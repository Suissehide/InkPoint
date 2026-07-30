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

/**
 * 90→145 px/s (120 s) → 130→195 px/s (90 s) : playtest réel jugé les ennemis
 * trop lents et trop mous en fin de partie. Le joueur (240 px/s, spawn.ts)
 * reste toujours plus rapide — contrainte structurante qui ne bouge pas — mais
 * la marge de fin de partie se resserre volontairement de 95 à 45 px/s : fuir
 * reste possible, distancer devient un effort.
 */
export function enemyMaxSpeed(elapsedSec: number): number {
  return lerp(130, 195, clamp01(ramp(elapsedSec, 90)))
}

export function formationSize(elapsedSec: number): number {
  return Math.round(lerp(3, 12, clamp01(ramp(elapsedSec, 180))))
}

export function ambushChance(elapsedSec: number): number {
  return lerp(0, 0.35, clamp01(ramp(elapsedSec, 200)))
}
