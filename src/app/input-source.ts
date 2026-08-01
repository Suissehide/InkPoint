import type { InputState } from '@/sim/input'
import { storage } from './storage'

/** Un point en coordonnées d'arène. */
export interface Point {
  x: number
  y: number
}

/**
 * L'état de mouvement du joueur, tel qu'une source d'entrée peut en avoir
 * besoin. Le clavier l'ignore ; les sources qui visent une cible (`aimInput`)
 * s'en servent pour viser une vitesse plutôt qu'une direction, via `accel` et
 * `maxSpeed`.
 */
export interface PlayerMotion extends Point {
  vx: number
  vy: number
  /**
   * Décélération passive, en px/s² — jamais négative. Non lue par `aimInput`
   * depuis que la poursuite vise une vitesse via `accel`/`maxSpeed` plutôt que
   * de couper la poussée à une distance d'arrêt calculée sur la friction ;
   * conservée sur l'interface pour une source future qui en aurait besoin.
   */
  friction: number
  /** Accélération commandée à pleine entrée, en px/s². */
  accel: number
  /** Vitesse maximale, en px/s. */
  maxSpeed: number
}

/**
 * Ce que toute source d'entrée sait faire ; `game.ts` n'en appelle qu'une par
 * pas (jamais les deux). `player` sert aux sources qui visent une cible ; le
 * clavier l'ignore en ne le déclarant pas.
 */
export interface InputSource {
  writeInto(input: InputState, player: PlayerMotion): void
  destroy(): void
}

export type MovementInput = 'keyboard' | 'mouse'

/**
 * Défaut : la souris. Toute valeur stockée différente de `'keyboard'` y
 * retombe — un stockage corrompu ne doit pas rendre le jeu injouable.
 */
export function resolveMovementInput(): MovementInput {
  return storage.get<string>('movementInput', 'mouse') === 'keyboard' ? 'keyboard' : 'mouse'
}
