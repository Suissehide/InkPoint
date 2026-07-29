/**
 * Intentions du joueur, normalisées. La simulation ne connaît aucune touche.
 * Pas de champ pour les power-ups : ils se déclenchent au ramassage, pas sur
 * une entrée (spec §3.4) — voir pickupSystem.
 */
export interface InputState {
  /** -1 (gauche) à 1 (droite) */
  moveX: number
  /** -1 (haut) à 1 (bas) */
  moveY: number
}
