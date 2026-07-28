import { addComponent, addEntity } from 'bitecs'

import {
  Collider,
  Enemy,
  Facing,
  Homing,
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

  Position.x[eid] = world.arena.width / 2
  Position.y[eid] = world.arena.height / 2
  PrevPosition.x[eid] = Position.x[eid]!
  PrevPosition.y[eid] = Position.y[eid]!
  Velocity.x[eid] = 0
  Velocity.y[eid] = 0
  Movement.maxSpeed[eid] = PLAYER_SPEED
  // 90% de la vitesse max en ~120 ms, et arrêt en ~80 ms.
  Movement.accel[eid] = PLAYER_SPEED / 0.052
  Movement.friction[eid] = PLAYER_SPEED / 0.035
  Collider.radius[eid] = PLAYER_RADIUS
  Facing.angle[eid] = -Math.PI / 2

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
  addComponent(world, Materializing, eid)

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
  Materializing.remaining[eid] = opts.materializeMs
  Materializing.total[eid] = opts.materializeMs

  world.events.push({ type: 'enemySpawned', eid, x: opts.x, y: opts.y })
  return eid
}
