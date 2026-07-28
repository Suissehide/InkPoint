import { addComponent, addEntity } from 'bitecs'

import { Collider, Facing, Movement, Player, Position, PrevPosition, Velocity } from './components'
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
