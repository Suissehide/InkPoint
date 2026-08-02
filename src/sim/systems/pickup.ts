import { addComponent, addEntity, defineQuery } from 'bitecs'

import { Collider, Doomed, Lifetime, Pickup, Position } from '../components'
import { pickupInterval } from '../data/difficulty'
import {
  PICKUP_LIFE_MS,
  PICKUP_RADIUS,
  POWERUP_BY_ID,
  POWERUP_DRAWABLE,
  POWERUP_ID,
  POWERUP_WEIGHT,
  type PowerUpKind,
} from '../data/powerups'
import { activatePowerUp } from '../powerups/activate'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'
import { scheduleDelayedPowerUp } from './delayed-powerup'

const pickups = defineQuery([Pickup, Position, Collider])
const timers = new WeakMap<SimWorld, number>()

const POWERUP_WEIGHT_TOTAL = POWERUP_DRAWABLE.reduce((sum, kind) => sum + POWERUP_WEIGHT[kind], 0)

/**
 * Tirage pondéré par somme cumulée, un seul appel à `world.rng.next()`. Le
 * repli sur le dernier genre après la boucle n'est pas décoratif : l'arrondi
 * flottant peut faire que la somme cumulée n'atteigne jamais `threshold` sur
 * le dernier terme.
 */
function drawPowerUpKind(world: SimWorld): PowerUpKind {
  const threshold = world.rng.next() * POWERUP_WEIGHT_TOTAL
  let cumulative = 0
  for (const kind of POWERUP_DRAWABLE) {
    cumulative += POWERUP_WEIGHT[kind]
    if (threshold < cumulative) {
      return kind
    }
  }
  return POWERUP_DRAWABLE[POWERUP_DRAWABLE.length - 1]!
}

export function spawnPickup(world: SimWorld): number {
  const kind = drawPowerUpKind(world)
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

/**
 * Pas d'inventaire : toucher la pastille l'active immédiatement, à sa propre
 * position (spec §3.4). La zone créée apparaît donc pile sous les pieds du
 * joueur — sans risque, `hazardSystem` ne cible jamais le joueur.
 */
export function pickupSystem(world: SimWorld, stats: RunStats): SimWorld {
  if (!world.alive || world.playerEid < 0) {
    return world
  }
  const dt = FIXED_DT * world.timeScale
  // Recalculé à chaque pas : l'intervalle suit la courbe de difficulté.
  const intervalMs = pickupInterval(world.time / 1000)

  const timer = (timers.get(world) ?? intervalMs) - dt
  if (timer <= 0) {
    spawnPickup(world)
    timers.set(world, intervalMs)
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

    const rawKind = Pickup.kind[eid]!
    const kind = POWERUP_BY_ID[rawKind]
    if (!kind) {
      continue
    }
    // `powerupPicked` alimente aussi seenPowerups (drawUpgrades filtre sur
    // « déjà rencontré », tenu côté appelant).
    world.events.push({ type: 'powerupPicked', kind: rawKind })
    activatePowerUp(world, kind, stats, Position.x[eid]!, Position.y[eid]!)
    // « Double trait » : le ramassage est le SEUL endroit qui programme une
    // seconde salve. La programmer depuis `activatePowerUp` la ferait
    // s'auto-alimenter — la seconde en programmerait une troisième, et ainsi
    // de suite (voir `delayed-powerup.ts`).
    if (stats.rules.has('doubleStroke')) {
      scheduleDelayedPowerUp(world, rawKind)
    }
    addComponent(world, Doomed, eid)
  }

  return world
}
