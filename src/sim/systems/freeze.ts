import { addComponent, defineQuery, removeComponent } from 'bitecs'

import { Collider, Doomed, Frozen, Position, Velocity } from '../components'
import { FIXED_DT, type SimWorld } from '../world'

const frozen = defineQuery([Frozen, Position, Collider])

/**
 * Maintient les ennemis gelés immobiles, et les tue au contact du joueur :
 * le gel transforme le joueur lui-même en arme (spec §3.4).
 */
export function freezeSystem(world: SimWorld): SimWorld {
  const dt = FIXED_DT * world.timeScale
  const player = world.playerEid
  const px = player >= 0 ? Position.x[player]! : Number.NaN
  const py = player >= 0 ? Position.y[player]! : Number.NaN
  const pr = player >= 0 ? Collider.radius[player]! : 0

  for (const eid of frozen(world)) {
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0

    if (player >= 0 && world.alive) {
      const r = pr + Collider.radius[eid]!
      const dx = Position.x[eid]! - px
      const dy = Position.y[eid]! - py
      if (dx * dx + dy * dy <= r * r) {
        addComponent(world, Doomed, eid)
        continue
      }
    }

    const remaining = Frozen.remaining[eid]! - dt
    if (remaining <= 0) {
      removeComponent(world, Frozen, eid)
    } else {
      Frozen.remaining[eid] = remaining
    }
  }

  return world
}
