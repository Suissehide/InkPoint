import { POWERUP_BASE } from '../data/powerups'

/**
 * Toutes les valeurs modifiables par les cartes d'amélioration.
 * Les systèmes lisent ces valeurs, jamais les constantes de base : c'est ce qui
 * rend les cartes purement additives (spec §3.5).
 */
export interface RunStats {
  moveSpeed: number
  blastRadius: number
  blastLingerMs: number
  freezeRadius: number
  freezeDurationMs: number
  trailDurationMs: number
  blotterRadius: number
  dashDurationMs: number
  dashRadius: number
  /**
   * Multiplicateur appliqué à `pickupInterval(elapsedSec)` (difficulty.ts).
   * L'intervalle de base varie désormais dans le temps, donc « Encre
   * généreuse » ne peut plus muter une valeur absolue une fois pour toutes :
   * elle réduit ce multiplicateur (1 par défaut), appliqué fraîchement à
   * chaque réapparition.
   */
  pickupIntervalMultiplier: number
  /** Règles booléennes activées par les cartes rares et mythiques. */
  rules: Set<string>
}

export function createRunStats(): RunStats {
  return {
    moveSpeed: 240,
    blastRadius: POWERUP_BASE.blast.maxRadius,
    blastLingerMs: POWERUP_BASE.blast.lingerMs,
    freezeRadius: POWERUP_BASE.freeze.radius,
    freezeDurationMs: POWERUP_BASE.freeze.durationMs,
    trailDurationMs: POWERUP_BASE.trail.durationMs,
    blotterRadius: POWERUP_BASE.blotter.radius,
    dashDurationMs: POWERUP_BASE.dash.durationMs,
    dashRadius: POWERUP_BASE.dash.radius,
    pickupIntervalMultiplier: 1,
    rules: new Set<string>(),
  }
}
