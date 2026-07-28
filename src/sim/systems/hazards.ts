import { addComponent, defineQuery, Not } from 'bitecs'

import {
  Attractor,
  Collider,
  Doomed,
  Enemy,
  Frozen,
  Hazard,
  Materializing,
  Position,
  Velocity,
} from '../components'
import { MAX_ENEMY_RADIUS } from '../data/enemies'
import {
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_FREEZE,
  HAZARD_STRIKE,
  HAZARD_TRAIL,
  POWERUP_BASE,
} from '../data/powerups'
import { createSpatialHash } from '../spatial-hash'
import { FIXED_DT, type SimWorld } from '../world'

const hazards = defineQuery([Hazard, Position])
// Un ennemi en cours de matérialisation reste hors d'atteinte des zones, comme
// des collisions directes (spec §3.3) : le pointillé reste inoffensif partout.
const targets = defineQuery([Enemy, Position, Collider, Not(Materializing)])

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

const LETHAL = new Set([HAZARD_BLAST, HAZARD_TRAIL, HAZARD_STRIKE])

export function hazardSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale

  const hash = hashFor(world)
  hash.clear()
  for (const eid of targets(world)) {
    hash.insert(eid, Position.x[eid]!, Position.y[eid]!)
  }

  for (const hid of hazards(world)) {
    const kind = Hazard.kind[hid]!
    const growth = Hazard.growthRate[hid]!
    if (growth > 0) {
      Hazard.radius[hid] = Math.min(Hazard.maxRadius[hid]!, Hazard.radius[hid]! + growth * dt)
    }

    const hx = Position.x[hid]!
    const hy = Position.y[hid]!
    const hr = Hazard.radius[hid]!

    // Marge dérivée des définitions d'ennemis, jamais écrite en dur (voir
    // MAX_ENEMY_RADIUS) : sinon un ennemi plus large ajouté plus tard sortirait
    // de la fenêtre de recherche et traverserait les zones sans être touché.
    for (const eid of hash.query(hx, hy, hr + MAX_ENEMY_RADIUS, scratch)) {
      const r = hr + Collider.radius[eid]!
      const dx = Position.x[eid]! - hx
      const dy = Position.y[eid]! - hy
      const distSq = dx * dx + dy * dy
      if (distSq > r * r) {
        continue
      }

      if (LETHAL.has(kind)) {
        addComponent(world, Doomed, eid)
      } else if (kind === HAZARD_FREEZE) {
        addComponent(world, Frozen, eid)
        Frozen.remaining[eid] = Math.max(Frozen.remaining[eid] ?? 0, POWERUP_BASE.freeze.durationMs)
        Velocity.x[eid] = 0
        Velocity.y[eid] = 0
      } else if (kind === HAZARD_BLOTTER) {
        // Aspire sans tuer : le Buvard n'existe que par ses combinaisons (spec §3.4).
        const dist = Math.sqrt(distSq) || 1
        const pull = Attractor.strength[hid] ?? POWERUP_BASE.blotter.strength
        Velocity.x[eid] = Velocity.x[eid]! - (dx / dist) * pull * dt
        Velocity.y[eid] = Velocity.y[eid]! - (dy / dist) * pull * dt
      }
    }
  }

  return world
}
