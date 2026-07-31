import { addComponent, addEntity } from 'bitecs'

import {
  Attractor,
  Dashing,
  Facing,
  Halo,
  Hazard,
  Lifetime,
  Orbiting,
  Position,
  PrevPosition,
} from '../components'
import {
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_BRAMBLE,
  HAZARD_FREEZE,
  POWERUP_BASE,
  POWERUP_ID,
  type PowerUpKind,
} from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'

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
 * Déclenche un power-up. `x`/`y` est la position d'activation — celle de la
 * pastille ramassée, puisqu'il n'y a plus d'inventaire : toucher l'objet,
 * c'est l'utiliser, sur place (spec §3.4). Elle ne sert qu'aux effets centrés
 * sur un point (Bombe, Gel, Buvard) : la Plume et le Halo n'ont besoin
 * d'aucune position, et la Ronce d'encre lit celle du joueur lui-même
 * puisqu'il le suit ensuite à chaque pas (brambleSystem).
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
      createHazard(world, HAZARD_FREEZE, x, y, {
        radius: stats.freezeRadius,
        maxRadius: stats.freezeRadius,
        growthRate: 0,
        lifeMs: POWERUP_BASE.freeze.zoneLifeMs,
      })
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
          // Zéro, et pas le taux angulaire : `hazardSystem` lit `growthRate`
          // sur toute entité `Hazard` et fait grandir le rayon dès qu'il est
          // positif. Le taux angulaire y a séjourné un temps — seule l'égalité
          // `radius === maxRadius` empêchait alors la couronne de grossir.
          growthRate: 0,
          lifeMs: stats.brambleDurationMs,
        })
        addComponent(world, Orbiting, eid)
        // Phase relative à l'instant d'activation, et non angle absolu :
        // `brambleAngle` ajoute `rate · world.time`, partagé par toutes les
        // couronnes. Un angle absolu faisait donc atterrir toute couronne
        // suivante exactement sur la précédente — six épines sur six épines,
        // même portée, même couverture, même nombre de morts, seule l'opacité
        // doublait. En retranchant `rate · world.time` ici, l'épine vaut
        // `angle` à l'instant même de l'activation : les couronnes s'entrelacent
        // au lieu de coïncider, et la position posée juste au-dessus est déjà
        // celle que `brambleSystem` calculera pour ce même `world.time` (sans
        // quoi la première image dessinait six épines balayant un arc où rien
        // ne tue).
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
      // Un seul minuteur. Une première version accordait aussi `Invulnerable`
      // pour la même durée : les deux composants étaient décrémentés par des
      // systèmes différents, décalaient d'un pas, et le joueur mourait sur la
      // dernière image de sa ruée — alors qu'il se déplaçait encore à pleine
      // vitesse. La Plume étant le recours quand on est encerclé, elle tuait
      // dans la situation même où on l'active. `collisionSystem` traite
      // désormais la présence de `Dashing` comme une invulnérabilité, donc les
      // deux états ne peuvent plus diverger.
      const angle = Facing.angle[player] ?? 0
      addComponent(world, Dashing, player)
      Dashing.remaining[player] = stats.dashDurationMs
      Dashing.vx[player] = Math.cos(angle) * POWERUP_BASE.dash.speed
      Dashing.vy[player] = Math.sin(angle) * POWERUP_BASE.dash.speed
      break
    }

    case 'halo':
      addComponent(world, Halo, player)
      break
  }

  world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x, y })
}
