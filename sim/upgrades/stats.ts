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
  brambleDurationMs: number
  blotterRadius: number
  dashDurationMs: number
  dashRadius: number
  volleyCount: number
  splatterLifeMs: number
  /** Règles booléennes activées par les cartes rares et mythiques. */
  rules: Set<string>
}

/**
 * `rangeScale` vient de `world.arena.rangeScale` : 1 au bureau, 0,7 sur
 * l'arène mobile. Il ne touche qu'aux portées ; les cartes d'amélioration
 * multiplient ensuite par-dessus, donc « Gel élargi » reste ×1,2 de la portée
 * réellement en jeu.
 */
export function createRunStats(rangeScale = 1): RunStats {
  return {
    moveSpeed: 240,
    blastRadius: POWERUP_BASE.blast.maxRadius * rangeScale,
    blastLingerMs: POWERUP_BASE.blast.lingerMs,
    freezeRadius: POWERUP_BASE.freeze.radius * rangeScale,
    freezeDurationMs: POWERUP_BASE.freeze.durationMs,
    brambleDurationMs: POWERUP_BASE.bramble.durationMs,
    blotterRadius: POWERUP_BASE.blotter.radius * rangeScale,
    dashDurationMs: POWERUP_BASE.dash.durationMs,
    dashRadius: POWERUP_BASE.dash.radius,
    volleyCount: POWERUP_BASE.volley.count,
    splatterLifeMs: POWERUP_BASE.splatter.lifeMs,
    rules: new Set<string>(),
  }
}
