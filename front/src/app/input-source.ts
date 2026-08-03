import type { InputState } from '@sim/input'

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
  /** Accélération commandée à pleine entrée, en px/s². */
  accel: number
  /** Vitesse maximale, en px/s. */
  maxSpeed: number
}

/**
 * Ce que toute source d'entrée sait faire ; `game.ts` n'en appelle qu'une par
 * pas (jamais les deux). `player` sert aux sources qui visent une cible ; le
 * clavier l'ignore en ne le déclarant pas.
 *
 * `writeInto` doit écrire des valeurs déjà sur la grille `QUANTUM` (`1/128`,
 * `@sim/input`) : c'est ce qui rend l'enregistrement d'un replay sans perte
 * (voir la docstring de `sim/replay/format.ts`). `game.ts` requantifie tout de
 * même le résultat (`quantizeInput`) avant d'enregistrer le pas — en défense,
 * pas en substitut : une implémentation qui ignorerait ce contrat verrait son
 * entrée arrondie sous le pied plutôt que de faire diverger le jeu et le rejeu.
 */
export interface InputSource {
  writeInto(input: InputState, player: PlayerMotion): void
  destroy(): void
}

export type MovementInput = 'keyboard' | 'mouse' | 'joystick' | 'tilt'

/**
 * Sources réellement servies aujourd'hui. `'tilt'` est déclaré dans le type
 * pour le lot 2 mais n'a pas encore de source : le rabattre ici évite qu'une
 * valeur stockée par une version future rende le jeu injouable.
 */
const SERVED: readonly MovementInput[] = ['keyboard', 'mouse', 'joystick']

/**
 * Valeur stockée si elle est servie ; sinon le défaut de l'appareil — joystick
 * au doigt, souris ailleurs. Le joystick ne dépend d'aucune permission ni
 * d'aucun capteur, c'est ce qui en fait le bon premier contact sur téléphone.
 */
export function resolveMovementInput(coarsePointer: boolean): MovementInput {
  const stored = storage.get<string>('movementInput', '')
  if ((SERVED as readonly string[]).includes(stored)) {
    return stored as MovementInput
  }
  return coarsePointer ? 'joystick' : 'mouse'
}
