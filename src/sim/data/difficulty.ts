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

/**
 * Rythme du minuteur des formations, en secondes. Décroissance hyperbolique :
 * elle tend vers zéro sans jamais l'atteindre, là où un plancher à zéro ferait
 * naître une infinité de formations par seconde. 6 s à deux minutes, 2 s à
 * dix, 0,75 s à trente.
 *
 * Le plancher effectif est de toute façon plus haut que celui de la courbe :
 * le minuteur de `waves.ts` ne déclenche qu'une formation par pas de
 * simulation, l'intervalle réel ne descend donc jamais sous `FIXED_DT`
 * (16,67 ms), quelle que soit la valeur rendue ici.
 */
export function formationInterval(elapsedSec: number): number {
  return 12 / (1 + Math.max(0, elapsedSec) / 120)
}

/**
 * Vitesse max des ennemis, en px/s ; le joueur va à 240 px/s (spawn.ts), la
 * marge doit permettre de se replacer, pas seulement de fuir tout droit.
 */
export function enemyMaxSpeed(elapsedSec: number): number {
  return lerp(110, 150, clamp01(ramp(elapsedSec, 90)))
}

/**
 * Effectif d'une formation. En dessous de huit, la figure ne se lit plus comme
 * une forme ; au-dessus, rien ne la borne — la difficulté monte indéfiniment
 * et toute partie finit par une mort (spec §5.1).
 *
 * L'envergure d'une figure traversante finit donc par dépasser l'arène,
 * d'autant plus tôt que l'entrée est latérale (bornée par la hauteur) plutôt
 * que verticale (bornée par la largeur) — le seuil se calcule dans
 * `crossingLayout` (data/formations.ts), il n'y a pas un chiffre unique. La
 * figure ne déborde pas pour autant : l'espacement se resserre, et l'effectif
 * ne cède qu'une fois le plancher d'espacement atteint. Les « lignes de bord à
 * bord » arrivent ainsi sans formation nouvelle, puis se densifient.
 * `waveSystem` borne l'ensemble par `MAX_ENEMIES - alive`.
 */
export function formationSize(elapsedSec: number): number {
  return Math.round(8 + Math.max(0, elapsedSec) / 20)
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
