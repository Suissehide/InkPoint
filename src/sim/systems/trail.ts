import { defineQuery } from 'bitecs'

import { Hazard, Position } from '../components'
import { HAZARD_TRAIL } from '../data/powerups'
import type { SimWorld } from '../world'

const hazards = defineQuery([Hazard, Position])

/**
 * Le Trait d'encre suit le joueur. On recopie sa position sur la zone à
 * chaque pas plutôt que de laisser un sillage de segments vieillissants :
 * un vrai sillage coûte une entité par pas (voir README, ajustement
 * post-playtest possible).
 */
export function trailSystem(world: SimWorld): SimWorld {
  const player = world.playerEid
  if (player < 0) {
    return world
  }

  for (const eid of hazards(world)) {
    if (Hazard.kind[eid] !== HAZARD_TRAIL) {
      continue
    }
    Position.x[eid] = Position.x[player]!
    Position.y[eid] = Position.y[player]!
  }
  return world
}
