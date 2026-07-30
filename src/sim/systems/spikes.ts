import { defineQuery } from 'bitecs'

import { Hazard, Orbiting, Position, PrevPosition } from '../components'
import { HAZARD_SPIKE } from '../data/powerups'
import type { SimWorld } from '../world'

const spikes = defineQuery([Hazard, Orbiting, Position, PrevPosition])

/**
 * Angle d'une pique à un instant donné. Dérivé de `time` (temps de simulation)
 * et non d'une horloge murale : la rotation est déterministe et gèle pendant un
 * hitstop, comme tout le reste du monde.
 */
export function spikeAngle(baseAngle: number, rate: number, time: number): number {
  return baseAngle + rate * time
}

/**
 * La couronne de piques du Trait d'encre. Chaque pique est une vraie zone
 * mortelle, pas un ornement : ce qui est dessiné à l'écran est exactement ce qui
 * tue (spec §3.1). Les trous entre les piques sont voulus — c'est ce qui en fait
 * des piques plutôt qu'une aura — et la rotation les balaie.
 */
export function spikeSystem(world: SimWorld): SimWorld {
  const player = world.playerEid
  if (player < 0) {
    return world
  }
  const px = Position.x[player]!
  const py = Position.y[player]!

  for (const eid of spikes(world)) {
    if (Hazard.kind[eid] !== HAZARD_SPIKE) {
      continue
    }
    // Mémorisée avant le déplacement : ces zones bougent, et sans PrevPosition
    // le rendu ne peut pas les interpoler — elles décrocheraient visiblement du
    // joueur, lui interpolé, sur un écran à haut rafraîchissement.
    PrevPosition.x[eid] = Position.x[eid]!
    PrevPosition.y[eid] = Position.y[eid]!

    const a = spikeAngle(Orbiting.angle[eid]!, Hazard.growthRate[eid]!, world.time)
    const r = Orbiting.radius[eid]!
    Position.x[eid] = px + Math.cos(a) * r
    Position.y[eid] = py + Math.sin(a) * r
  }
  return world
}
