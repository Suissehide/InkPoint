import { addComponent, addEntity, defineQuery, Not } from 'bitecs'

import {
  Attractor,
  Collider,
  Dashing,
  Enemy,
  Facing,
  FreshlyFrozen,
  Frozen,
  Halo,
  Hazard,
  Lifetime,
  Materializing,
  Orbiting,
  Position,
  PrevPosition,
  Velocity,
} from '../components'
import {
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_BRAMBLE,
  POWERUP_BASE,
  POWERUP_ID,
  type PowerUpKind,
} from '../data/powerups'
import { grantInvulnerability } from '../invulnerability'
import { launchSplatter } from '../systems/ricochet'
import { launchVolley } from '../systems/seeker'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

// Même règle de ciblage que `hazardSystem` : un ennemi en matérialisation
// reste hors d'atteinte (spec §3.3, le pointillé est inoffensif partout).
const gelables = defineQuery([Enemy, Position, Collider, Not(Materializing)])

function createHazard(
  world: SimWorld,
  kind: number,
  x: number,
  y: number,
  opts: { radius: number; maxRadius: number; growthRate: number; lifeMs: number },
): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = kind
  Hazard.radius[eid] = opts.radius
  Hazard.maxRadius[eid] = opts.maxRadius
  Hazard.growthRate[eid] = opts.growthRate
  Lifetime.remaining[eid] = opts.lifeMs
  return eid
}

/**
 * Gèle d'un coup les ennemis à portée. Le Gel n'est plus une zone : il ne pose
 * rien dans le monde, il agit une fois et c'est fini.
 *
 * Balayage linéaire, pas de hash spatial. Le hash de `hazardSystem` existe
 * parce qu'il tourne à chaque image sur toutes les zones ; ici le code
 * s'exécute une seule fois, au ramassage.
 *
 * Aucun garde « déjà gelé », contrairement à la zone : le sien n'existait que
 * parce qu'elle réappliquait son effet à chaque image, ce qui remettait le
 * minuteur à plein et faisait de `FreshlyFrozen` un état permanent. Sur un coup
 * unique, ce garde empêcherait seulement un second Gel de rafraîchir un ennemi
 * encore pris par le premier. Conséquence voulue : un second Gel repose
 * `FreshlyFrozen`, donc relance une vague de contagion sous « Givre rampant » —
 * une fois, pas en boucle.
 */
function freezeAround(world: SimWorld, stats: RunStats, x: number, y: number): void {
  for (const eid of gelables(world)) {
    const r = stats.freezeRadius + Collider.radius[eid]!
    const dx = Position.x[eid]! - x
    const dy = Position.y[eid]! - y
    if (dx * dx + dy * dy > r * r) {
      continue
    }
    addComponent(world, Frozen, eid)
    Frozen.remaining[eid] = stats.freezeDurationMs
    addComponent(world, FreshlyFrozen, eid)
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
  }
}

/** Portée publiée avec `powerupUsed`. */
function usedRadius(kind: PowerUpKind, stats: RunStats): number | null {
  switch (kind) {
    // La Bombe rend `null` **bien qu'elle ait un rayon** : le sien part de
    // 12 px et grandit jusqu'à `stats.blastRadius`, donc aucun nombre unique
    // ne la décrit à l'activation.
    case 'blast':
      return null
    case 'freeze':
      return stats.freezeRadius
    // La couronne de la Ronce s'attache au joueur : pas de portée ponctuelle.
    case 'bramble':
      return null
    case 'blotter':
      return stats.blotterRadius
    // La Ruée est un geste orienté, pas une zone de portée donnée.
    case 'dash':
      return null
    // Le Halo s'attache au joueur : pas de portée ponctuelle.
    case 'halo':
      return null
    // La Volée et la Bavure sont des jets : pas de portée ponctuelle.
    case 'volley':
      return null
    case 'splatter':
      return null
    default: {
      // Sans ce contrôle, l'ajout d'un power-up de plus compilerait en silence
      // et publierait `null` sans que personne ne le décide — la même panne
      // muette que le grand `switch` plus bas se garde déjà de laisser passer.
      const exhaustif: never = kind
      void exhaustif
      return null
    }
  }
}

/**
 * Déclenche un power-up. `x`/`y` est la position d'activation, celle de la
 * pastille ramassée (pas d'inventaire, spec §3.4) : ne sert qu'aux effets
 * centrés sur un point (Bombe, Gel, Buvard). La Ronce d'encre lit plutôt la
 * position du joueur, qu'elle suit ensuite à chaque pas (brambleSystem).
 */
export function activatePowerUp(
  world: SimWorld,
  kind: PowerUpKind,
  stats: RunStats,
  x: number,
  y: number,
): void {
  const player = world.playerEid
  if (player < 0) {
    return
  }

  switch (kind) {
    case 'blast': {
      const growth = POWERUP_BASE.blast.growthRate
      createHazard(world, HAZARD_BLAST, x, y, {
        radius: 12,
        maxRadius: stats.blastRadius,
        growthRate: growth,
        // La zone persiste après avoir atteint son rayon max (spec §3.4).
        lifeMs: (stats.blastRadius / growth) * 1000 + stats.blastLingerMs,
      })
      break
    }
    case 'freeze':
      // Instantané : `pickupSystem` s'exécute plus tard dans le pas que
      // `hazardSystem`, mais aucun système entre les deux ne déplace d'ennemi,
      // et `homingSystem` comme `formationSystem` excluent `Frozen`
      // structurellement — le cycle de vie d'un ennemi gelé est inchangé.
      freezeAround(world, stats, x, y)
      break

    case 'bramble': {
      // Une entité par épine : chacune est une vraie zone mortelle, donc ce que
      // le joueur voit est exactement ce qui tue (spec §3.1). Leur position
      // est recalculée à chaque pas par `brambleSystem`.
      const px = Position.x[player]!
      const py = Position.y[player]!
      const { count, orbitRadius, thornRadius, angularRate } = POWERUP_BASE.bramble
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        const x = px + Math.cos(angle) * orbitRadius
        const y = py + Math.sin(angle) * orbitRadius
        const eid = createHazard(world, HAZARD_BRAMBLE, x, y, {
          radius: thornRadius,
          maxRadius: thornRadius,
          // Zéro, pas le taux angulaire : `hazardSystem` lit `growthRate` sur
          // toute entité `Hazard` et grandit le rayon dès qu'il est positif.
          growthRate: 0,
          lifeMs: stats.brambleDurationMs,
        })
        addComponent(world, Orbiting, eid)
        // Phase, pas angle absolu (voir brambleAngle, bramble.ts) : garantit
        // que l'épine vaut `angle` à l'instant même de l'activation, et que
        // la position posée juste au-dessus correspond à ce même `world.time`.
        Orbiting.angle[eid] = angle - angularRate * world.time
        Orbiting.radius[eid] = orbitRadius
        Orbiting.rate[eid] = angularRate
        addComponent(world, PrevPosition, eid)
        PrevPosition.x[eid] = x
        PrevPosition.y[eid] = y
        // Orientation initiale : `brambleSystem` la recalcule et la repose à
        // chaque pas suivant (même patron que `dashWakeSystem`), mais l'image
        // avant ce premier recalcul doit déjà pointer juste.
        addComponent(world, Facing, eid)
        Facing.angle[eid] = angle
      }
      // La couronne est étanche par géométrie, mais l'étanchéité raisonne sur
      // un anneau STATIQUE : un ennemi assez rapide la traverse en un seul pas
      // de simulation. Le bouclier fait tenir la promesse quoi qu'il arrive.
      //
      // `+ FIXED_DT` : `collisionSystem` expire `Invulnerable` AVANT que
      // `lifetimeSystem` ne tue les épines (voir l'ordre dans step.ts). À durée
      // strictement égale, il existe une image où la couronne est encore à
      // l'écran et le joueur redevenu mortel — le piège que le commentaire de
      // `Dashing`, plus bas, raconte avoir déjà vécu.
      //
      // `grantInvulnerability` porte le reste : le `Math.max` avec la grâce en
      // cours (une Ronce ramassée juste après un Halo brisé n'écourte pas sa
      // seconde) et l'écriture de `total`, dont le rendu tire l'arc.
      grantInvulnerability(world, player, stats.brambleDurationMs + FIXED_DT)
      break
    }

    case 'blotter': {
      const eid = createHazard(world, HAZARD_BLOTTER, x, y, {
        radius: stats.blotterRadius,
        maxRadius: stats.blotterRadius,
        growthRate: 0,
        lifeMs: POWERUP_BASE.blotter.lifeMs,
      })
      addComponent(world, Attractor, eid)
      Attractor.strength[eid] = POWERUP_BASE.blotter.strength
      break
    }

    case 'dash': {
      // Un seul minuteur, pas de `Invulnerable` séparé pour la même durée :
      // deux composants décrémentés par des systèmes différents ont déjà
      // divergé d'un pas et tué le joueur sur la dernière image de sa ruée.
      // `collisionSystem` traite la présence de `Dashing` comme invulnérabilité.
      const angle = Facing.angle[player] ?? 0
      addComponent(world, Dashing, player)
      Dashing.remaining[player] = stats.dashDurationMs
      Dashing.vx[player] = Math.cos(angle) * POWERUP_BASE.dash.speed
      Dashing.vy[player] = Math.sin(angle) * POWERUP_BASE.dash.speed
      break
    }

    case 'volley':
      // Depuis la pastille et non depuis le joueur : c'est un jet, pas un
      // effet centré sur soi comme la Ronce. Les deux points coïncident au
      // ramassage, mais l'intention doit se lire dans le code.
      launchVolley(world, stats, x, y)
      break

    case 'splatter':
      // Le seul power-up qui mélange les deux sources : la position vient de
      // la pastille (comme la Volée — c'est un jet, pas un effet centré sur
      // soi), la direction du `Facing` du joueur, lu par `launchSplatter`
      // (comme la Ruée — c'est un geste orienté). Les deux points coïncident
      // au ramassage, mais on lance bien la goutte *depuis la pastille, vers
      // où l'on regarde*.
      launchSplatter(world, stats, x, y)
      break

    case 'halo':
      addComponent(world, Halo, player)
      break

    default: {
      // Sans ce contrôle, l'ajout d'un power-up de plus compilerait en silence
      // et son ramassage ne ferait rien — la panne muette dont `powerupVoices`
      // (audio/sounds.ts) et `powerupSignature` (app/juice.ts) se gardent déjà
      // chacun de son côté. C'était le dernier `switch` sur `PowerUpKind` du
      // projet à ne pas l'avoir.
      const exhaustif: never = kind
      void exhaustif
      break
    }
  }

  world.events.push({
    type: 'powerupUsed',
    kind: POWERUP_ID[kind],
    x,
    y,
    radius: usedRadius(kind, stats),
  })
}
