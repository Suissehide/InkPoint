import { addComponent, defineQuery } from 'bitecs'

import { Doomed, Lifetime } from '../components'
import { FIXED_DT, type SimWorld } from '../world'

const timed = defineQuery([Lifetime])

/** Marque pour suppression toute entité dont le sursis (`Lifetime.remaining`) est écoulé. */
export function lifetimeSystem(world: SimWorld): SimWorld {
  const dt = FIXED_DT * world.timeScale

  for (const eid of timed(world)) {
    const remaining = Lifetime.remaining[eid]! - dt
    if (remaining <= 0) {
      addComponent(world, Doomed, eid)
    } else {
      Lifetime.remaining[eid] = remaining
    }
  }

  return world
}
