import { createWorld as createBitWorld, type IWorld } from 'bitecs'

import type { InputState } from './input'
import { createRng, type Rng } from './rng'

export const FIXED_DT = 1000 / 60

/**
 * Arène logique, identique pour tous les joueurs quelle que soit la fenêtre :
 * la difficulté ne doit pas dépendre de la taille de l'écran.
 * `render/stage.ts` la met à l'échelle de la fenêtre (`viewportLayer`) ;
 * format 16:9 pour que l'échelle vaille exactement 1 sur une fenêtre 16:9.
 */
export const ARENA = { width: 1280, height: 720 } as const

export type SimEvent =
  | { type: 'enemySpawned'; eid: number; x: number; y: number }
  | { type: 'enemyMaterialized'; eid: number }
  | { type: 'enemyKilled'; eid: number; x: number; y: number }
  | { type: 'playerHit'; x: number; y: number }
  | { type: 'playerDied'; x: number; y: number }
  | { type: 'haloBroken'; x: number; y: number }
  | { type: 'powerupPicked'; kind: number }
  /**
   * `radius` : la portée de l'effet à l'instant de l'activation, quand il en a
   * *une*. `null` sinon — jamais 0, par la même règle que le champ `angle` de
   * `HazardView` : un zéro par défaut affirmerait une portée nulle avec
   * l'aplomb d'une information vraie. La couche FX en a besoin pour dessiner à
   * la vraie taille et ne doit pas la recalculer, sous peine de diverger de
   * celle qui a réellement agi.
   */
  | { type: 'powerupUsed'; kind: number; x: number; y: number; radius: number | null }
  /**
   * Rebond d'une goutte de Bavure sur un mur. `nx`/`ny` est la normale
   * unitaire du mur, dirigée vers l'intérieur de l'arène : le rendu s'en sert
   * pour projeter l'éclaboussure du bon côté. Purement décoratif — rien dans
   * la simulation ne le consomme.
   */
  | { type: 'splatterBounced'; x: number; y: number; nx: number; ny: number }
  | { type: 'waveEnded'; wave: number }
  | { type: 'waveStarted'; wave: number }

export interface SimWorld extends IWorld {
  time: number
  rng: Rng
  arena: { readonly width: number; readonly height: number }
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
  /** Temps accumulé depuis le dernier segment de sillage déposé par la ruée. */
  dashWakeAccMs: number
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
  world.dashWakeAccMs = 0
  return world
}
