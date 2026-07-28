import { defineQuery, hasComponent, removeEntity } from 'bitecs'

import { Doomed, Enemy, Position, Velocity } from '../components'
import { ENEMIES, ENEMY_TYPE_BY_ID } from '../data/enemies'
import { spawnEnemy } from '../spawn'
import type { SimWorld } from '../world'

const doomed = defineQuery([Doomed])

/**
 * Applique les morts marquées pendant le pas. Passe unique et différée :
 * supprimer une entité au milieu d'une itération de requête invaliderait
 * les autres systèmes du même pas.
 */
export function deathSystem(world: SimWorld): SimWorld {
  for (const eid of doomed(world)) {
    const x = Position.x[eid] ?? 0
    const y = Position.y[eid] ?? 0

    if (hasComponent(world, Enemy, eid)) {
      const type = ENEMY_TYPE_BY_ID[Enemy.type[eid] ?? 0] ?? 'point'
      const split = ENEMIES[type].splitsInto

      world.events.push({ type: 'enemyKilled', eid, x, y })

      if (split) {
        const vx = Velocity.x[eid] ?? 0
        const vy = Velocity.y[eid] ?? 0
        // L'ordre et la vitesse des enfants ne dépendent que de l'état du
        // parent (x, y, vx, vy, count) : aucune itération de Set/Map ni
        // aucun aléa n'entre ici, condition nécessaire au déterminisme.
        for (let i = 0; i < split.count; i++) {
          const angle = (i / split.count) * Math.PI * 2
          const child = spawnEnemy(world, {
            type: split.type,
            x: x + Math.cos(angle) * 18,
            y: y + Math.sin(angle) * 18,
            materializeMs: 0,
          })
          // Les enfants héritent d'une partie de l'élan du parent (spec §3.3).
          Velocity.x[child] = vx * 0.5 + Math.cos(angle) * 60
          Velocity.y[child] = vy * 0.5 + Math.sin(angle) * 60
        }
      }
    }

    removeEntity(world, eid)
  }

  return world
}
