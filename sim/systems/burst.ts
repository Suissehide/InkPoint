import { addComponent, defineQuery, Not, removeComponent } from 'bitecs'

import { Bursting, Enemy, Frozen, Homing, Materializing, Velocity } from '../components'
import { ENEMIES, ENEMY_TYPE_BY_ID } from '../data/enemies'
import { FIXED_DT, type SimWorld } from '../world'

// `Not(Frozen)` : un Bursting gelé reste immobile, son minuteur ne progresse
// pas et reprend le sursaut au dégel. `Not(Materializing)` par cohérence
// défensive (le sursaut n'est posé qu'à la dislocation d'une formation déjà
// matérialisée, donc ne devrait jamais coexister en pratique).
const bursting = defineQuery([Bursting, Velocity, Enemy, Not(Materializing), Not(Frozen)])

/**
 * Sursaut vers le joueur à la dislocation d'une figure traversante (spec
 * pacing-pass v2 §Traversantes) : vélocité gouvernée par un minuteur dédié,
 * pas par `Homing`, pendant sa durée. `Homing` reprend une fois épuisé.
 */
export function burstSystem(world: SimWorld): SimWorld {
  const dt = FIXED_DT * world.timeScale

  for (const eid of bursting(world)) {
    const remaining = Bursting.remaining[eid]! - dt
    if (remaining <= 0) {
      removeComponent(world, Bursting, eid)
      addComponent(world, Homing, eid)
      const type = ENEMY_TYPE_BY_ID[Enemy.type[eid] ?? 0] ?? 'point'
      Homing.delayMs[eid] = ENEMIES[type].homingDelayMs
      continue
    }

    Bursting.remaining[eid] = remaining
    Velocity.x[eid] = Bursting.vx[eid]!
    Velocity.y[eid] = Bursting.vy[eid]!
  }

  return world
}
