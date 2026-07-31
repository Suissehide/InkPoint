import { defineQuery } from 'bitecs'

import { Facing, Hazard, Orbiting, Position, PrevPosition } from '../components'
import { HAZARD_BRAMBLE } from '../data/powerups'
import type { SimWorld } from '../world'

const brambleEntities = defineQuery([Hazard, Orbiting, Position, PrevPosition])

/**
 * Angle d'une épine, dérivé de `time` (temps de simulation, pas horloge
 * murale) : déterministe, gèle pendant un hitstop.
 *
 * `baseAngle` est une *phase*, pas l'angle à l'activation : `activate.ts` y
 * range `angle − rate · world.time` pour que deux couronnes nées à des
 * instants différents ne coïncident jamais (world.time étant partagé, un
 * angle absolu les ferait coïncider).
 */
export function brambleAngle(baseAngle: number, rate: number, time: number): number {
  return baseAngle + rate * time
}

/** Chaque épine de la couronne est une vraie zone mortelle (spec §3.1). */
export function brambleSystem(world: SimWorld): SimWorld {
  const player = world.playerEid
  if (player < 0) {
    return world
  }
  const px = Position.x[player]!
  const py = Position.y[player]!

  for (const eid of brambleEntities(world)) {
    if (Hazard.kind[eid] !== HAZARD_BRAMBLE) {
      continue
    }
    // Sans PrevPosition ici, le rendu ne peut pas interpoler ces zones
    // mobiles : elles décrocheraient du joueur, lui interpolé.
    PrevPosition.x[eid] = Position.x[eid]!
    PrevPosition.y[eid] = Position.y[eid]!

    // Taux angulaire sur `Orbiting`, pas `Hazard.growthRate` : ce dernier
    // appartient à hazardSystem (croissance du rayon, voir activate.ts).
    const a = brambleAngle(Orbiting.angle[eid]!, Orbiting.rate[eid]!, world.time)
    const r = Orbiting.radius[eid]!
    Position.x[eid] = px + Math.cos(a) * r
    Position.y[eid] = py + Math.sin(a) * r
    Facing.angle[eid] = a
  }
  return world
}
