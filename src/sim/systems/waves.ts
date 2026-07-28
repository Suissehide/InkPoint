import { addComponent, defineQuery } from 'bitecs'

import { Enemy, Invulnerable, Movement, Position } from '../components'
import {
  ambushChance,
  enemyMaxSpeed,
  formationSize,
  MAX_ENEMIES,
  spawnInterval,
  WAVE_DURATION_MS,
  WAVE_START_INVULN_MS,
} from '../data/difficulty'
import {
  AMBUSH_MIN_DISTANCE,
  ENEMIES,
  ENEMY_TYPES,
  type EnemyType,
  MATERIALIZE_AMBUSH_MS,
  MATERIALIZE_EDGE_MS,
} from '../data/enemies'
import { FORMATION_KINDS, formationOffsets } from '../data/formations'
import { spawnEnemy } from '../spawn'
import { FIXED_DT, type SimWorld } from '../world'

const enemies = defineQuery([Enemy])
const timers = new WeakMap<SimWorld, number>()

function pickType(world: SimWorld): EnemyType {
  const available = ENEMY_TYPES.filter((t) => ENEMIES[t].unlockWave <= world.wave)
  const total = available.reduce((sum, t) => sum + ENEMIES[t].weight, 0)
  let roll = world.rng.next() * total
  for (const t of available) {
    roll -= ENEMIES[t].weight
    if (roll <= 0) {
      return t
    }
  }
  return 'point'
}

function edgeOrigin(world: SimWorld): { x: number; y: number } {
  const { width, height } = world.arena
  switch (world.rng.int(4)) {
    case 0:
      return { x: -40, y: world.rng.range(0, height) }
    case 1:
      return { x: width + 40, y: world.rng.range(0, height) }
    case 2:
      return { x: world.rng.range(0, width), y: -40 }
    default:
      return { x: world.rng.range(0, width), y: height + 40 }
  }
}

function ambushOrigin(world: SimWorld): { x: number; y: number } {
  const px = Position.x[world.playerEid]!
  const py = Position.y[world.playerEid]!
  const { width, height } = world.arena

  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = world.rng.range(0, Math.PI * 2)
    const dist = world.rng.range(AMBUSH_MIN_DISTANCE, AMBUSH_MIN_DISTANCE + 140)
    const x = px + Math.cos(angle) * dist
    const y = py + Math.sin(angle) * dist
    if (x > 20 && x < width - 20 && y > 20 && y < height - 20) {
      return { x, y }
    }
  }
  return edgeOrigin(world)
}

function typeOf(eid: number): EnemyType {
  const id = Enemy.type[eid] ?? 0
  return (['point', 'shard', 'blot'] as const)[id] ?? 'point'
}

/**
 * Fait apparaître les ennemis, avance la vague et boucle sur la vague suivante
 * une fois le délai écoulé (spec §3.1) : la vague se termine sur un minuteur,
 * pas quand l'arène est vidée — le joueur n'ayant pas d'arme permanente, exiger
 * une arène vide rendrait la partie potentiellement ingagnable.
 */
export function waveSystem(world: SimWorld): SimWorld {
  if (!world.alive || world.playerEid < 0) {
    return world
  }

  const dt = FIXED_DT * world.timeScale
  const elapsedSec = world.time / 1000

  world.waveElapsed += dt
  if (world.waveElapsed >= WAVE_DURATION_MS) {
    world.waveElapsed = 0
    world.events.push({ type: 'waveEnded', wave: world.wave })
    world.wave += 1
    // Grâce de début de vague : la formation qui vient d'apparaître ne doit
    // pas pouvoir tuer le joueur avant qu'il n'ait repris la main (spec §3.7).
    addComponent(world, Invulnerable, world.playerEid)
    Invulnerable.remaining[world.playerEid] = WAVE_START_INVULN_MS
    world.events.push({ type: 'waveStarted', wave: world.wave })
    return world
  }

  const maxSpeed = enemyMaxSpeed(elapsedSec)
  // La courbe de vitesse s'applique aussi aux ennemis déjà en jeu.
  for (const eid of enemies(world)) {
    Movement.maxSpeed[eid] = maxSpeed * ENEMIES[typeOf(eid)].speedFactor
  }

  let timer = (timers.get(world) ?? spawnInterval(elapsedSec) * 1000) - dt
  if (timer > 0) {
    timers.set(world, timer)
    return world
  }
  timer = spawnInterval(elapsedSec) * 1000
  timers.set(world, timer)

  const alive = enemies(world).length
  if (alive >= MAX_ENEMIES) {
    return world
  }

  const isAmbush = world.wave >= 2 && world.rng.next() < ambushChance(elapsedSec)
  const type = pickType(world)
  const budget = Math.min(formationSize(elapsedSec), MAX_ENEMIES - alive)

  if (isAmbush) {
    const origin = ambushOrigin(world)
    spawnEnemy(world, {
      type,
      x: origin.x,
      y: origin.y,
      materializeMs: MATERIALIZE_AMBUSH_MS,
    })
    return world
  }

  const origin = edgeOrigin(world)
  const kind = world.rng.pick(FORMATION_KINDS)
  for (const offset of formationOffsets(kind, budget, 34)) {
    spawnEnemy(world, {
      type,
      x: origin.x + offset.x,
      y: origin.y + offset.y,
      materializeMs: MATERIALIZE_EDGE_MS,
    })
  }

  return world
}
