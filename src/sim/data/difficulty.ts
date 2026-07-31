export const WAVE_DURATION_MS = 40_000

/**
 * Plafond dur des ennemis simultanés (les survivants s'accumulent de vague en
 * vague) : garde-fou, pas un réglage d'équilibrage — le rendu Pixi sature
 * bien avant la simulation.
 */
export const MAX_ENEMIES = 1500

export const WAVE_START_INVULN_MS = 500

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** Progression 0→1, asymptotique, atteignant ~95% à 300 s. */
const ramp = (sec: number, timeConstant: number) => 1 - Math.exp(-Math.max(0, sec) / timeConstant)

/** Intervalle d'apparition des ennemis, en secondes. */
export function spawnInterval(elapsedSec: number): number {
  return lerp(1.1, 0.3, clamp01(ramp(elapsedSec, 90)))
}

/** Rythme du minuteur des formations, en secondes ; minuteur dédié, indépendant de `spawnInterval`. */
export function formationInterval(elapsedSec: number): number {
  return lerp(12, 6, clamp01(ramp(elapsedSec, 200)))
}

/**
 * Vitesse max des ennemis, en px/s ; le joueur va à 240 px/s (spawn.ts), la
 * marge doit permettre de se replacer, pas seulement de fuir tout droit.
 */
export function enemyMaxSpeed(elapsedSec: number): number {
  return lerp(110, 150, clamp01(ramp(elapsedSec, 90)))
}

/** Effectif d'une formation : en dessous de huit, la figure ne se lit plus comme une forme. */
export function formationSize(elapsedSec: number): number {
  return Math.round(lerp(8, 15, clamp01(ramp(elapsedSec, 180))))
}

/** Probabilité qu'une vague soit une embuscade, jamais nulle : `spawnTrickle` (waves.ts) n'a pas d'autre plancher. */
export function ambushChance(elapsedSec: number): number {
  return lerp(0.15, 0.4, clamp01(ramp(elapsedSec, 200)))
}

/**
 * Intervalle d'apparition d'un power-up, **en ms** (contrairement aux courbes
 * ci-dessus, en secondes). Multiplié par `RunStats.pickupIntervalMultiplier`
 * (« Encre généreuse »).
 */
export function pickupInterval(elapsedSec: number): number {
  return lerp(2500, 1800, clamp01(ramp(elapsedSec, 90)))
}
