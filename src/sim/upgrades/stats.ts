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
  strikeWidth: number
  blotterRadius: number
  dashDurationMs: number
  dryspellDurationMs: number
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
    strikeWidth: POWERUP_BASE.strike.width,
    blotterRadius: POWERUP_BASE.blotter.radius,
    dashDurationMs: POWERUP_BASE.dash.durationMs,
    dryspellDurationMs: POWERUP_BASE.dryspell.durationMs,
    rules: new Set<string>(),
  }
}
