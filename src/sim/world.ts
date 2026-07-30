import { createWorld as createBitWorld, type IWorld } from 'bitecs'

import type { InputState } from './input'
import { createRng, type Rng } from './rng'

export const FIXED_DT = 1000 / 60

/**
 * Arène logique, identique pour tous les joueurs quelle que soit la fenêtre :
 * la difficulté ne doit pas dépendre de la taille de l'écran. `createWorld`
 * reste paramétrable — les tests passent leurs propres dimensions.
 */
export const ARENA = { width: 1600, height: 900 } as const

export type SimEvent =
  | { type: 'enemySpawned'; eid: number; x: number; y: number }
  | { type: 'enemyMaterialized'; eid: number }
  | { type: 'enemyKilled'; eid: number; x: number; y: number }
  | { type: 'playerHit'; x: number; y: number }
  | { type: 'playerDied'; x: number; y: number }
  | { type: 'haloBroken'; x: number; y: number }
  | { type: 'powerupPicked'; kind: number }
  | { type: 'powerupUsed'; kind: number; x: number; y: number }
  | { type: 'waveEnded'; wave: number }
  | { type: 'waveStarted'; wave: number }

export interface SimWorld extends IWorld {
  time: number
  rng: Rng
  arena: { width: number; height: number }
  input: InputState
  events: SimEvent[]
  playerEid: number
  wave: number
  waveElapsed: number
  score: number
  combo: number
  comboTimer: number
  alive: boolean
  timeScale: number
  /** Instant (temps de simulation) jusqu'auquel le Séchage ralentit les ennemis. */
  slowUntil: number
}

export function createWorld(opts: { seed: number; width: number; height: number }): SimWorld {
  const world = createBitWorld() as SimWorld
  world.time = 0
  world.rng = createRng(opts.seed)
  world.arena = { width: opts.width, height: opts.height }
  world.input = { moveX: 0, moveY: 0 }
  world.events = []
  world.playerEid = -1
  world.wave = 1
  world.waveElapsed = 0
  world.score = 0
  world.combo = 0
  world.comboTimer = 0
  world.alive = true
  world.timeScale = 1
  world.slowUntil = 0
  return world
}
