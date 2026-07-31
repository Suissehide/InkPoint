import { defineQuery, Not } from 'bitecs'

import { Collider, Materializing, Position, PrevPosition, Velocity } from '../components'
import { FIXED_DT, type SimWorld } from '../world'

// Un ennemi en apparition doit rester immobile ET traversable (spec §3.3) :
// exclu ici pour qu'un futur effet qui écrit sa vélocité (attraction, recul)
// ne le fasse pas dériver pendant qu'il est affiché comme inoffensif.
const movables = defineQuery([Position, PrevPosition, Velocity, Collider, Not(Materializing)])

export function integrationSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale

  for (const eid of movables(world)) {
    PrevPosition.x[eid] = Position.x[eid]!
    PrevPosition.y[eid] = Position.y[eid]!

    let x = Position.x[eid]! + Velocity.x[eid]! * dt
    let y = Position.y[eid]! + Velocity.y[eid]! * dt

    // Murs : on bloque, on ne rebondit pas (spec §3.2).
    const r = Collider.radius[eid]!
    if (x < r) {
      x = r
      Velocity.x[eid] = 0
    } else if (x > world.arena.width - r) {
      x = world.arena.width - r
      Velocity.x[eid] = 0
    }
    if (y < r) {
      y = r
      Velocity.y[eid] = 0
    } else if (y > world.arena.height - r) {
      y = world.arena.height - r
      Velocity.y[eid] = 0
    }

    Position.x[eid] = x
    Position.y[eid] = y
  }

  return world
}
