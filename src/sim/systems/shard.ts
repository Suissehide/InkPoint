import { addComponent, defineQuery, Not, removeComponent } from 'bitecs'

import { Dasher, Homing, Materializing, Position, Velocity } from '../components'
import {
  ENEMIES,
  SHARD_DASH_DURATION_MS,
  SHARD_DASH_SPEED,
  SHARD_DASH_TRIGGER_DISTANCE,
  SHARD_TELEGRAPH_MS,
} from '../data/enemies'
import { FIXED_DT, type SimWorld } from '../world'

const shards = defineQuery([Dasher, Position, Velocity, Not(Materializing)])

/**
 * L'Éclat : approche en poursuite normale, puis se fige, se télégraphie une
 * demi-seconde, et charge en ligne droite à 420 px/s sans corriger sa
 * trajectoire. C'est le seul ennemi plus rapide que le joueur — sa lisibilité
 * repose entièrement sur le télégraphe (spec §3.6).
 */
export function shardSystem(world: SimWorld): SimWorld {
  const dt = FIXED_DT * world.timeScale
  if (world.playerEid < 0) {
    return world
  }

  const px = Position.x[world.playerEid]!
  const py = Position.y[world.playerEid]!

  for (const eid of shards(world)) {
    const state = Dasher.state[eid]!

    if (state === 0) {
      const dist = Math.hypot(px - Position.x[eid]!, py - Position.y[eid]!)
      if (dist <= SHARD_DASH_TRIGGER_DISTANCE) {
        Dasher.state[eid] = 1
        Dasher.timer[eid] = SHARD_TELEGRAPH_MS
        Velocity.x[eid] = 0
        Velocity.y[eid] = 0
        // Pendant télégraphe et charge, la poursuite ne doit plus intervenir.
        removeComponent(world, Homing, eid)
      }
      continue
    }

    // Garantie structurelle : tant que l'état n'est pas « approche », Homing
    // doit être absent, même si un appelant force Dasher.state directement (tests).
    removeComponent(world, Homing, eid)

    const timer = Dasher.timer[eid]! - dt
    Dasher.timer[eid] = timer

    if (state === 1) {
      Velocity.x[eid] = 0
      Velocity.y[eid] = 0
      if (timer <= 0) {
        const dx = px - Position.x[eid]!
        const dy = py - Position.y[eid]!
        const d = Math.hypot(dx, dy) || 1
        Velocity.x[eid] = (dx / d) * SHARD_DASH_SPEED
        Velocity.y[eid] = (dy / d) * SHARD_DASH_SPEED
        Dasher.state[eid] = 2
        Dasher.timer[eid] = SHARD_DASH_DURATION_MS
      }
    } else if (state === 2 && timer <= 0) {
      // Fin de charge : bitECS remet à zéro les champs de Homing au
      // removeComponent() plus haut et ne les restaure pas à l'addComponent —
      // sans cette ligne, le délai de visée retomberait à 0.
      Dasher.state[eid] = 0
      addComponent(world, Homing, eid)
      Homing.delayMs[eid] = ENEMIES.shard.homingDelayMs
    }
  }

  return world
}
