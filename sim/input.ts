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
  /**
   * Plafond de vitesse, en fraction de `Movement.maxSpeed`. Vaut 1 partout
   * sauf pour le joystick et l'inclinaison, seules sources analogiques.
   *
   * Champ distinct de la magnitude de `moveX`/`moveY`, et c'est délibéré :
   * la souris (`app/mouse.ts`) renvoie une intensité plancher de 0,01 en
   * croisière pour garder la commande, donc un plafond déduit de la magnitude
   * figerait le point sur place.
   */
  speedCap: number
}

/** Pas de quantification des entrées — prérequis du rejeu à l'identique (spec §3.5). */
export const QUANTUM = 1 / 128

/** Arrondit une composante d'entrée au pas de quantification. */
export function quantize(value: number): number {
  return Math.round(value / QUANTUM) * QUANTUM
}
