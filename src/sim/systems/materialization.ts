import { defineQuery, removeComponent } from 'bitecs'

import { Materializing } from '../components'
import { FIXED_DT, type SimWorld } from '../world'

const materializing = defineQuery([Materializing])

/**
 * Fait avancer la phase d'apparition. Tant que Materializing est présent,
 * l'ennemi est immobile et traversable — les systèmes de poursuite et de
 * collision l'ignorent (spec §3.3).
 */
export function materializationSystem(world: SimWorld): SimWorld {
  const dt = FIXED_DT * world.timeScale

  for (const eid of materializing(world)) {
    const remaining = Materializing.remaining[eid]! - dt
    if (remaining <= 0) {
      removeComponent(world, Materializing, eid)
      world.events.push({ type: 'enemyMaterialized', eid })
    } else {
      Materializing.remaining[eid] = remaining
    }
  }

  return world
}
