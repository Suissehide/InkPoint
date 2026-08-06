import { addComponent, addEntity, defineQuery, hasComponent, Not, removeComponent } from 'bitecs'

import {
  Collider,
  Dashing,
  Doomed,
  Enemy,
  Frozen,
  Halo,
  Hazard,
  Invulnerable,
  Lifetime,
  Materializing,
  Position,
} from '../components'
import { MAX_ENEMY_RADIUS } from '../data/enemies'
import { HAZARD_BLAST, RULE_TUNING } from '../data/powerups'
import { grantInvulnerability } from '../invulnerability'
import { createSpatialHash } from '../spatial-hash'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * Grâce accordée à la rupture du Halo. La plus longue des quatre après celle
 * de la Ronce, et pour la raison inverse : le Halo se brise au contact, donc
 * au milieu de ce qui vient de toucher le joueur — il lui faut de quoi en
 * sortir avant de redevenir mortel.
 */
const HALO_BREAK_GRACE_MS = 1000

/**
 * L'explosion d'« Onde de rupture », posée au point de contact quand le Halo
 * casse.
 *
 * Réutiliser `HAZARD_BLAST` a exactement la même conséquence que pour la Volée
 * (voir `seeker.ts`) : cette explosion n'hérite **pas** de « Large explosion »
 * ni de « Combustion lente », qui lisent `stats.blastRadius` et
 * `stats.blastLingerMs` alors que les réglages viennent ici de
 * `RULE_TUNING.haloBurst`. C'est voulu — « Onde de rupture » est une carte du
 * Halo, pas de la Bombe, et un cumul ferait dépendre la puissance du Halo d'un
 * investissement dans un autre power-up.
 *
 * Le rayon ET la croissance sont mis à l'échelle : leur rapport, qui décide de
 * la durée de vie, reste donc invariant d'une arène à l'autre.
 */
function spawnHaloBurst(world: SimWorld, x: number, y: number): void {
  const scale = world.arena.rangeScale
  const radius = RULE_TUNING.haloBurst.radius * scale
  const growthRate = RULE_TUNING.haloBurst.growthRate * scale
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = HAZARD_BLAST
  Hazard.radius[eid] = 6
  Hazard.maxRadius[eid] = radius
  Hazard.growthRate[eid] = growthRate
  Lifetime.remaining[eid] = (radius / growthRate) * 1000 + RULE_TUNING.haloBurst.lingerMs
}

// `Not(Materializing)` : « pointillé = inoffensif, plein = mortel » doit être
// vrai sans exception, sinon les embuscades deviennent des pièges injustes.
// `Not(Frozen)` est indispensable, pas défensif : la mort est différée
// (`freezeSystem` marque `Doomed` mais ne supprime qu'en fin de pas) — sans
// cette exclusion, un ennemi gelé traversé par le joueur tuerait ce dernier.
// `Not(Doomed)` de même : un ennemi tué par une bombe reste présent jusqu'à
// la fin du pas, sans quoi une bombe au contact tuerait le joueur en retour.
const activeEnemies = defineQuery([
  Enemy,
  Position,
  Collider,
  Not(Materializing),
  Not(Frozen),
  Not(Doomed),
])
const invulnerables = defineQuery([Invulnerable])

const hashes = new WeakMap<SimWorld, ReturnType<typeof createSpatialHash>>()
const scratch: number[] = []

function hashFor(world: SimWorld) {
  let h = hashes.get(world)
  if (!h) {
    h = createSpatialHash(64)
    hashes.set(world, h)
  }
  return h
}

export function collisionSystem(world: SimWorld, stats: RunStats): SimWorld {
  const dt = FIXED_DT * world.timeScale

  for (const eid of invulnerables(world)) {
    const remaining = Invulnerable.remaining[eid]! - dt
    if (remaining <= 0) {
      removeComponent(world, Invulnerable, eid)
    } else {
      Invulnerable.remaining[eid] = remaining
    }
  }

  if (!world.alive || world.playerEid < 0) {
    return world
  }

  const player = world.playerEid
  const hash = hashFor(world)
  hash.clear()

  const list = activeEnemies(world)
  for (const eid of list) {
    hash.insert(eid, Position.x[eid]!, Position.y[eid]!)
  }

  // La ruée vaut invulnérabilité, sans composant séparé : deux minuteurs pour
  // un même état finissent par diverger d'un pas, ce qui a déjà tué le
  // joueur sur la dernière image de la ruée.
  if (hasComponent(world, Invulnerable, player) || hasComponent(world, Dashing, player)) {
    return world
  }

  const px = Position.x[player]!
  const py = Position.y[player]!
  const pr = Collider.radius[player]!

  // Marge dérivée de MAX_ENEMY_RADIUS, jamais en dur : sinon un ennemi plus
  // large ajouté plus tard sortirait de la fenêtre de recherche.
  for (const eid of hash.query(px, py, pr + MAX_ENEMY_RADIUS, scratch)) {
    const r = pr + Collider.radius[eid]!
    const dx = Position.x[eid]! - px
    const dy = Position.y[eid]! - py
    if (dx * dx + dy * dy > r * r) {
      continue
    }

    if (hasComponent(world, Halo, player)) {
      removeComponent(world, Halo, player)
      addComponent(world, Doomed, eid)
      grantInvulnerability(world, player, HALO_BREAK_GRACE_MS)
      if (stats.rules.has('haloBurst')) {
        spawnHaloBurst(world, px, py)
      }
      world.events.push({ type: 'haloBroken', x: px, y: py })
      return world
    }

    world.alive = false
    world.events.push({ type: 'playerDied', x: px, y: py })
    return world
  }

  return world
}
