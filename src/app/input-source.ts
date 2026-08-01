import type { InputState } from '@/sim/input'
import { storage } from './storage'

/** Un point en coordonnées d'arène. */
export interface Point {
  x: number
  y: number
}

/**
 * L'état de mouvement du joueur, tel qu'une source d'entrée peut en avoir
 * besoin. Le clavier l'ignore ; les sources qui visent une cible s'en servent
 * pour freiner à l'approche plutôt que de la dépasser.
 */
export interface PlayerMotion extends Point {
  vx: number
  vy: number
  /** Décélération passive, en px/s² — jamais négative. */
  friction: number
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
