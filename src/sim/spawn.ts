import { addComponent, addEntity } from 'bitecs'

import {
  Collider,
  Dasher,
  Enemy,
  Facing,
  Homing,
  Inventory,
  Materializing,
  Movement,
  Player,
  Position,
  PrevPosition,
  Velocity,
} from './components'
import { ENEMIES, ENEMY_TYPE_ID, type EnemyType } from './data/enemies'
import type { SimWorld } from './world'

export const PLAYER_SPEED = 240
export const PLAYER_RADIUS = 9

export function spawnPlayer(world: SimWorld): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, PrevPosition, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Movement, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Facing, eid)
  addComponent(world, Player, eid)
  addComponent(world, Inventory, eid)

  Position.x[eid] = world.arena.width / 2
  Position.y[eid] = world.arena.height / 2
  PrevPosition.x[eid] = Position.x[eid]!
  PrevPosition.y[eid] = Position.y[eid]!
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0
  Movement.maxSpeed[eid] = PLAYER_SPEED
  // 90% de la vitesse max en ~117 ms, et arrêt en ~83 ms (mesuré par simulation
  // pas à pas, cf. player-movement.test.ts) — le glissé demandé après le
  // premier playtest réel, contre le ressenti trop sec des constantes d'avant.
  Movement.accel[eid] = PLAYER_SPEED / 0.12
  Movement.friction[eid] = PLAYER_SPEED / 0.09
  Collider.radius[eid] = PLAYER_RADIUS
  Facing.angle[eid] = -Math.PI / 2
  Inventory.slots[eid]!.fill(0)

  world.playerEid = eid
  return eid
}

export function spawnEnemy(
  world: SimWorld,
  opts: { type: EnemyType; x: number; y: number; materializeMs: number },
): number {
  const def = ENEMIES[opts.type]
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, PrevPosition, eid)
  addComponent(world, Velocity, eid)
  addComponent(world, Movement, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Enemy, eid)
  addComponent(world, Homing, eid)
  // Une durée nulle signifie « déjà matérialisé » : ne pas poser le composant
  // du tout, plutôt que le poser puis compter sur materializationSystem pour
  // le retirer plus tard — un appelant qui n'exécute pas ce système (le
  // télégraphe de l'Éclat, par ex.) verrait sinon l'ennemi bloqué invisible
  // et intraversable indéfiniment.
  if (opts.materializeMs > 0) {
    addComponent(world, Materializing, eid)
    Materializing.remaining[eid] = opts.materializeMs
    Materializing.total[eid] = opts.materializeMs
  }

  Position.x[eid] = opts.x
  Position.y[eid] = opts.y
  PrevPosition.x[eid] = opts.x
  PrevPosition.y[eid] = opts.y
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0
  // Valeur par défaut avant l'arrivée de la courbe de difficulté (Task 8).
  Movement.maxSpeed[eid] = 145 * def.speedFactor
  Movement.accel[eid] = def.accel
  Movement.friction[eid] = 0
  Collider.radius[eid] = def.radius
  Enemy.type[eid] = ENEMY_TYPE_ID[opts.type]
  Homing.delayMs[eid] = def.homingDelayMs

  if (opts.type === 'shard') {
    addComponent(world, Dasher, eid)
    Dasher.state[eid] = 0
    Dasher.timer[eid] = 0
  }

  world.events.push({ type: 'enemySpawned', eid, x: opts.x, y: opts.y })
  return eid
}
