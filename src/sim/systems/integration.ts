import { defineQuery, Not } from 'bitecs'

import { Collider, Materializing, Position, PrevPosition, Velocity } from '../components'
import { FIXED_DT, type SimWorld } from '../world'

// Un ennemi en cours d'apparition doit rester immobile ET traversable (spec §3.3).
// Aujourd'hui rien n'écrit sa vélocité pendant cette phase, donc l'exclure ici est
// redondant — mais une tâche future ajoutera des effets (attraction, recul) qui
// écrivent la vélocité des ennemis ; sans cette exclusion, un tel effet ferait
// dériver un fantôme encore affiché comme inoffensif et traversable.
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
