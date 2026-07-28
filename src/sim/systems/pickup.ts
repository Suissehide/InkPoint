import { addComponent, addEntity, defineQuery } from 'bitecs'

import { Collider, Doomed, Lifetime, Pickup, Position } from '../components'
import {
  PICKUP_LIFE_MS,
  PICKUP_RADIUS,
  PICKUP_SPAWN_INTERVAL_MS,
  POWERUP_BY_ID,
  POWERUP_ID,
  POWERUP_KINDS,
} from '../data/powerups'
import { addPowerUp } from '../powerups/inventory'
import { FIXED_DT, type SimWorld } from '../world'

const pickups = defineQuery([Pickup, Position, Collider])
const timers = new WeakMap<SimWorld, number>()

export function spawnPickup(world: SimWorld): number {
  const kind = world.rng.pick(POWERUP_KINDS)
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Collider, eid)
  addComponent(world, Pickup, eid)
  addComponent(world, Lifetime, eid)

  // Marge de 60 px : jamais collé aux murs, où il serait difficile à récupérer.
  Position.x[eid] = world.rng.range(60, world.arena.width - 60)
  Position.y[eid] = world.rng.range(60, world.arena.height - 60)
  Collider.radius[eid] = PICKUP_RADIUS
  Pickup.kind[eid] = POWERUP_ID[kind]
  Lifetime.remaining[eid] = PICKUP_LIFE_MS
  return eid
}

export function pickupSystem(world: SimWorld): SimWorld {
  if (!world.alive || world.playerEid < 0) {
    return world
  }
  const dt = FIXED_DT * world.timeScale

  const timer = (timers.get(world) ?? PICKUP_SPAWN_INTERVAL_MS) - dt
  if (timer <= 0) {
    spawnPickup(world)
    timers.set(world, PICKUP_SPAWN_INTERVAL_MS)
  } else {
    timers.set(world, timer)
  }

  const px = Position.x[world.playerEid]!
  const py = Position.y[world.playerEid]!
  const pr = Collider.radius[world.playerEid]!

  for (const eid of pickups(world)) {
    const r = pr + Collider.radius[eid]!
    const dx = Position.x[eid]! - px
    const dy = Position.y[eid]! - py
    if (dx * dx + dy * dy > r * r) {
      continue
    }

    const kind = POWERUP_BY_ID[Pickup.kind[eid]!]
    // Si l'inventaire est plein, le power-up reste au sol : le joueur choisit.
    if (kind && addPowerUp(world, kind)) {
      addComponent(world, Doomed, eid)
    }
  }

  return world
}
