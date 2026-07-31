import type { InputState } from '@/sim/input'
import { storage } from './storage'

/** Un point en coordonnées d'arène. */
export interface Point {
  x: number
  y: number
}

/**
 * Ce que toute source d'entrée sait faire ; `game.ts` n'en appelle qu'une par
 * pas (jamais les deux). `player` sert aux sources qui visent une cible ; le
 * clavier l'ignore en ne le déclarant pas.
 */
export interface InputSource {
  writeInto(input: InputState, player: Point): void
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
