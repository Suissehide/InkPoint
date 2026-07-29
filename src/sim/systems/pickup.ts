import { addComponent, addEntity, defineQuery } from 'bitecs'

import { Collider, Doomed, Lifetime, Pickup, Position } from '../components'
import {
  PICKUP_LIFE_MS,
  PICKUP_RADIUS,
  POWERUP_BY_ID,
  POWERUP_ID,
  POWERUP_KINDS,
} from '../data/powerups'
import { activatePowerUp } from '../powerups/activate'
import type { RunStats } from '../upgrades/stats'
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

/**
 * Pas d'inventaire : toucher la pastille l'active immédiatement, à sa propre
 * position (spec §3.4) — le joueur se tient dessus au moment du contact, donc
 * la zone créée (Bombe, Gel, Buvard…) apparaît pile sous ses pieds. Ce n'est
 * pas un risque : `hazardSystem` ne cible jamais le joueur, seulement les
 * ennemis (voir hazards.ts), donc aucune zone ne peut tuer celui qui vient de
 * la déclencher. Preuve d'intégration dans step.test.ts (« sanity » du blast
 * à bout portant) et le nouveau test dédié ci-dessous.
 */
export function pickupSystem(world: SimWorld, stats: RunStats): SimWorld {
  if (!world.alive || world.playerEid < 0) {
    return world
  }
  const dt = FIXED_DT * world.timeScale

  // Lu depuis les stats (pas la constante) : « Encre généreuse » raccourcit
  // cet intervalle, donc le repère du minuteur doit suivre la même source.
  const timer = (timers.get(world) ?? stats.pickupIntervalMs) - dt
  if (timer <= 0) {
    spawnPickup(world)
    timers.set(world, stats.pickupIntervalMs)
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
    // `powerupPicked` survit à la suppression de l'inventaire : les cartes
    // d'amélioration (drawUpgrades) filtrent toujours sur « déjà rencontré »
    // (l'ensemble seenPowerups, tenu côté appelant), et ça n'a rien à voir
    // avec le fait qu'il n'y ait plus d'emplacement à remplir.
    world.events.push({ type: 'powerupPicked', kind: rawKind })
    activatePowerUp(world, kind, stats, Position.x[eid]!, Position.y[eid]!)
    addComponent(world, Doomed, eid)
  }

  return world
}
