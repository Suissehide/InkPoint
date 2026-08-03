import { addComponent, defineQuery, hasComponent, Not } from 'bitecs'

import { Collider, Dashing, Doomed, Enemy, Materializing, Position } from '../components'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'

const targets = defineQuery([Enemy, Position, Collider, Not(Materializing)])

/**
 * Pendant la ruée, le joueur tue ce qu'il traverse. Système dédié plutôt
 * qu'un cas particulier dans `hazardSystem` : la condition de déclenchement
 * (`Dashing`) n'a rien à voir avec la logique des zones.
 */
export function dashKillSystem(world: SimWorld, stats: RunStats): SimWorld {
  const player = world.playerEid
  if (player < 0 || !hasComponent(world, Dashing, player)) {
    return world
  }

  const px = Position.x[player]!
  const py = Position.y[player]!
  // Portée de la ruée, pas rayon du joueur : la Plume balaie un couloir (spec
  // §4.1). Pas de test balayé nécessaire : le déplacement par pas reste petit
  // face au rayon, le recouvrement entre deux pas est large.
  const pr = stats.dashRadius

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
