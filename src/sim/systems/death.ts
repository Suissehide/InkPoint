import { addComponent, defineQuery, hasComponent, Not, removeEntity } from 'bitecs'

import { Collider, Doomed, Enemy, Frozen, Materializing, Position, Velocity } from '../components'
import { ENEMIES, ENEMY_TYPE_BY_ID } from '../data/enemies'
import { POWERUP_BASE, RULE_TUNING } from '../data/powerups'
import { createSpatialHash } from '../spatial-hash'
import { spawnEnemy } from '../spawn'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'

const doomed = defineQuery([Doomed])
// Cibles d'Encre vive : un ennemi déjà gelé, en apparition ou déjà condamné ne
// doit pas être regelé — même garde-fou qu'à Givre rampant (freeze.ts).
const thawed = defineQuery([
  Enemy,
  Position,
  Collider,
  Not(Materializing),
  Not(Frozen),
  Not(Doomed),
])

const hashes = new WeakMap<SimWorld, ReturnType<typeof createSpatialHash>>()
const scratch: number[] = []

function hashFor(world: SimWorld) {
  let h = hashes.get(world)
  if (!h) {
    h = createSpatialHash(64)
    hashes.set(world, h)
  }
  return h
}

/**
 * Encre vive : quand un ennemi *gelé* meurt, gèle ses voisins proches. Vérifie
 * bien `Frozen` sur le mourant — sinon la règle se déclencherait à chaque
 * mort, gelées ou non (voir rapport de tâche).
 */
function spreadFreeze(world: SimWorld, x: number, y: number, freezeDurationMs: number): void {
  const hash = hashFor(world)
  hash.clear()
  for (const eid of thawed(world)) {
    hash.insert(eid, Position.x[eid]!, Position.y[eid]!)
  }
  for (const neighbor of hash.query(x, y, RULE_TUNING.freezeSpreadRadius, scratch)) {
    addComponent(world, Frozen, neighbor)
    Frozen.remaining[neighbor] = freezeDurationMs
    Velocity.x[neighbor] = 0
    Velocity.y[neighbor] = 0
  }
}

/**
 * Applique les morts marquées pendant le pas. Passe unique et différée :
 * supprimer une entité au milieu d'une itération de requête invaliderait
 * les autres systèmes du même pas.
 *
 * `stats` est optionnel : les tests existants appellent `deathSystem(w)` sans
 * lui, et sans carte « Encre vive » active le comportement reste celui
 * d'avant cette tâche.
 */
export function deathSystem(world: SimWorld, stats?: RunStats): SimWorld {
  const livingInkActive = stats?.rules.has('livingInk') ?? false
  const freezeDurationMs = stats?.freezeDurationMs ?? POWERUP_BASE.freeze.durationMs

  for (const eid of doomed(world)) {
    const x = Position.x[eid] ?? 0
    const y = Position.y[eid] ?? 0

    if (hasComponent(world, Enemy, eid)) {
      if (livingInkActive && hasComponent(world, Frozen, eid)) {
        spreadFreeze(world, x, y, freezeDurationMs)
      }

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
