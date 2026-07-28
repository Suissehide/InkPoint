import { defineQuery, Not } from 'bitecs'

import { Homing, Materializing, Movement, Position, Velocity } from '../components'
import { createPositionHistory } from '../position-history'
import { FIXED_DT, type SimWorld } from '../world'

const hunters = defineQuery([Homing, Position, Velocity, Movement, Not(Materializing)])

/** Historique du joueur, par monde — jamais partagé entre deux simulations. */
const histories = new WeakMap<SimWorld, ReturnType<typeof createPositionHistory>>()

function historyFor(world: SimWorld) {
  let h = histories.get(world)
  if (!h) {
    // 64 échantillons à 60 Hz ≈ 1 s de mémoire, largement au-delà du délai max (400 ms).
    h = createPositionHistory(64)
    histories.set(world, h)
  }
  return h
}

export function homingSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale
  const history = historyFor(world)

  if (world.playerEid >= 0) {
    history.push(world.time, Position.x[world.playerEid]!, Position.y[world.playerEid]!)
  }

  for (const eid of hunters(world)) {
    const target = history.sample(world.time - Homing.delayMs[eid]!)
    const dx = target.x - Position.x[eid]!
    const dy = target.y - Position.y[eid]!
    const dist = Math.hypot(dx, dy)
    if (dist < 0.001) {
      continue
    }

    let vx = Velocity.x[eid]! + (dx / dist) * Movement.accel[eid]! * dt
    let vy = Velocity.y[eid]! + (dy / dist) * Movement.accel[eid]! * dt

    const maxSpeed = Movement.maxSpeed[eid]!
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
