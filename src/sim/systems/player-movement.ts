import { defineQuery } from 'bitecs'

import { Facing, Movement, Player, Velocity } from '../components'
import { FIXED_DT, type SimWorld } from '../world'

const players = defineQuery([Player, Velocity, Movement, Facing])

export function playerMovementSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale

  for (const eid of players(world)) {
    const maxSpeed = Movement.maxSpeed[eid]!
    let ix = world.input.moveX
    let iy = world.input.moveY

    // Normaliser la diagonale, sinon on va √2 fois plus vite en biais.
    const inputLen = Math.hypot(ix, iy)
    if (inputLen > 1) {
      ix /= inputLen
      iy /= inputLen
    }

    let vx = Velocity.x[eid]!
    let vy = Velocity.y[eid]!

    if (inputLen > 0.001) {
      vx += ix * Movement.accel[eid]! * dt
      vy += iy * Movement.accel[eid]! * dt
      Facing.angle[eid] = Math.atan2(iy, ix)
    } else {
      const speed = Math.hypot(vx, vy)
      if (speed > 0) {
        const drop = Math.min(speed, Movement.friction[eid]! * dt)
        vx -= (vx / speed) * drop
        vy -= (vy / speed) * drop
      }
    }

    const speed = Math.hypot(vx, vy)
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed
      vy = (vy / speed) * maxSpeed
    }

    Velocity.x[eid] = vx
    Velocity.y[eid] = vy
  }

  return world
}
