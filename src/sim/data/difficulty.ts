export const WAVE_DURATION_MS = 40_000

/**
 * Plafond dur du nombre d'ennemis simultanés. Les survivants s'accumulant
 * d'une vague à l'autre (spec §3.1), sans ce plafond une run peut basculer
 * dans une spirale ingagnable — c'est le risque n°1 identifié en §11.
 */
export const MAX_ENEMIES = 220

/** Grâce au début de chaque vague, pour que la carte choisie ne soit pas fatale. */
export const WAVE_START_INVULN_MS = 500

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** Progression 0→1, asymptotique, atteignant ~95% à 300 s. */
const ramp = (sec: number, timeConstant: number) => 1 - Math.exp(-Math.max(0, sec) / timeConstant)

export function spawnInterval(elapsedSec: number): number {
  return lerp(2.2, 0.35, clamp01(ramp(elapsedSec, 150)))
}

export function enemyMaxSpeed(elapsedSec: number): number {
  return lerp(90, 145, clamp01(ramp(elapsedSec, 120)))
}

export function formationSize(elapsedSec: number): number {
  return Math.round(lerp(3, 12, clamp01(ramp(elapsedSec, 180))))
}

export function ambushChance(elapsedSec: number): number {
  return lerp(0, 0.35, clamp01(ramp(elapsedSec, 200)))
}
