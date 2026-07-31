import { defineQuery } from 'bitecs'

import { Facing, Hazard, Orbiting, Position, PrevPosition } from '../components'
import { HAZARD_BRAMBLE } from '../data/powerups'
import type { SimWorld } from '../world'

const brambleEntities = defineQuery([Hazard, Orbiting, Position, PrevPosition])

/**
 * Angle d'une épine à un instant donné. Dérivé de `time` (temps de simulation)
 * et non d'une horloge murale : la rotation est déterministe et gèle pendant un
 * hitstop, comme tout le reste du monde.
 *
 * `baseAngle` est une *phase*, pas l'angle visible au moment de l'activation :
 * `activate.ts` y range `angle − rate · world.time` précisément pour que deux
 * couronnes nées à des instants différents ne se retrouvent jamais l'une sur
 * l'autre — `world.time` étant partagé, un angle absolu les aurait fait
 * coïncider (voir son commentaire).
 */
export function brambleAngle(baseAngle: number, rate: number, time: number): number {
  return baseAngle + rate * time
}

/**
 * La couronne d'épines de la Ronce d'encre. Chaque épine est une vraie zone
 * mortelle, pas un ornement : ce qui est dessiné à l'écran est exactement ce qui
 * tue (spec §3.1). Les trous entre les épines sont voulus — c'est ce qui en fait
 * des épines plutôt qu'une aura — et la rotation les balaie.
 */
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
    // Mémorisée avant le déplacement : ces zones bougent, et sans PrevPosition
    // le rendu ne peut pas les interpoler — elles décrocheraient visiblement du
    // joueur, lui interpolé, sur un écran à haut rafraîchissement.
    PrevPosition.x[eid] = Position.x[eid]!
    PrevPosition.y[eid] = Position.y[eid]!

    // Le taux angulaire vit sur `Orbiting`, pas sur `Hazard.growthRate` :
    // ce dernier appartient à `hazardSystem`, qui le lit sur toute entité
    // `Hazard` pour faire croître le rayon (voir activate.ts).
    const a = brambleAngle(Orbiting.angle[eid]!, Orbiting.rate[eid]!, world.time)
    const r = Orbiting.radius[eid]!
    Position.x[eid] = px + Math.cos(a) * r
    Position.y[eid] = py + Math.sin(a) * r
    // Orientation posée ici plutôt que recalculée par le rendu (même patron
    // que dashWakeSystem pour le sillage de la ruée) : `stage.ts` n'a alors
    // aucun cas particulier à ajouter, sa lecture de `Facing` couvrant déjà
    // les deux.
    Facing.angle[eid] = a
  }
  return world
}
