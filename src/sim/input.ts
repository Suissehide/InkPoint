/** Intentions du joueur, normalisées. La simulation ne connaît aucune touche. */
export interface InputState {
  /** -1 (gauche) à 1 (droite) */
  moveX: number
  /** -1 (haut) à 1 (bas) */
  moveY: number
  /** Déclenchement des 3 emplacements de power-up */
  slots: [boolean, boolean, boolean]
}
