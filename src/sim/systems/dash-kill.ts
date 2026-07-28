import { addComponent, defineQuery, hasComponent, Not } from 'bitecs'

import { Collider, Dashing, Doomed, Enemy, Materializing, Position } from '../components'
import type { SimWorld } from '../world'

const targets = defineQuery([Enemy, Position, Collider, Not(Materializing)])

/**
 * Pendant la ruée, le joueur tue ce qu'il traverse. Système dédié plutôt qu'un
 * cas particulier dans `hazardSystem` : la condition de déclenchement (le
 * joueur porte `Dashing`) n'a rien à voir avec la logique des zones, et les
 * mélanger rendrait les deux plus difficiles à lire et à tester.
 */
export function dashKillSystem(world: SimWorld): SimWorld {
  const player = world.playerEid
  if (player < 0 || !hasComponent(world, Dashing, player)) {
    return world
  }

  const px = Position.x[player]!
  const py = Position.y[player]!
  const pr = Collider.radius[player]!

  for (const eid of targets(world)) {
    const r = pr + Collider.radius[eid]!
    const dx = Position.x[eid]! - px
    const dy = Position.y[eid]! - py
    if (dx * dx + dy * dy <= r * r) {
      addComponent(world, Doomed, eid)
    }
  }
  return world
}
