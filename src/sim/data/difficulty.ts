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

/**
 * 2,2→0,35 s (150 s) → 1,1→0,3 s (90 s) : playtest réel jugé l'ouverture trop
 * vide — plusieurs minutes avant que la pression ne se fasse sentir. Diviser
 * le point de départ par deux et resserrer la constante de temps rapproche
 * la densité de fin de partie beaucoup plus tôt, sans changer le plafond
 * (0,3 s reste au-dessus du disque le plus dense jouable).
 */
export function spawnInterval(elapsedSec: number): number {
  return lerp(1.1, 0.3, clamp01(ramp(elapsedSec, 90)))
}

/**
 * Rythme du minuteur des formations (spec pacing-pass §1), totalement
 * indépendant de `spawnInterval` : deux minuteurs séparés plutôt qu'un tirage
 * de probabilité par évènement, pour que les formations ponctuent la partie à
 * intervalles propres au lieu de s'agglutiner ou de disparaître selon la
 * chance sur un flux d'évènements bien plus fréquent (spec §1 — « pas un pile
 * ou face »). 18→8 s → 12→6 s (playtest réel : l'ouverture manquait de
 * ponctuation) ; 200 s conservé pour tightener sur le même horizon que
 * `ambushChance`, cohérent avec le fait que les figures enveloppantes (Cercle,
 * Carré) partagent désormais les garanties de l'embuscade.
 */
export function formationInterval(elapsedSec: number): number {
  return lerp(12, 6, clamp01(ramp(elapsedSec, 200)))
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

/**
 * 3→12 → 8→15 (spec pacing-pass v2 §Taille) : en dessous de huit, la figure ne
 * se lit plus comme une forme — huit est le plancher, pas une moyenne. Les
 * formations étant désormais rares (voir `formationInterval`), leur effectif
 * peut monter sans peser sur le rythme d'ensemble, qui vient surtout du
 * ruissellement (`spawnInterval`).
 */
export function formationSize(elapsedSec: number): number {
  return Math.round(lerp(8, 15, clamp01(ramp(elapsedSec, 180))))
}

/**
 * 0→35 % → 15→40 % (playtest réel) : à 0 % en début de partie, la vague
 * d'ouverture ne produisait aucune embuscade, alors que c'est précisément le
 * mécanisme demandé par le joueur — il devait attendre plusieurs minutes pour
 * en voir une seule. Démarrer à 15 % la rend présente dès la première vague ;
 * voir aussi `spawnTrickle` (waves.ts) qui n'a plus de plancher de vague en
 * plus de cette courbe.
 */
export function ambushChance(elapsedSec: number): number {
  return lerp(0.15, 0.4, clamp01(ramp(elapsedSec, 200)))
}

/**
 * 7000 ms fixe → 3500→2500 ms (playtest réel) : densifier les ennemis sans
 * densifier les pastilles ne rendrait pas la partie plus intense, seulement
 * plus courte — la mort arriverait plus vite, pas le rythme. Le point de vue
 * est donc devenu une courbe comme les autres, plutôt qu'une constante fixe ;
 * même constante de temps que `spawnInterval` (90 s), pour que les deux se
 * resserrent sur le même horizon d'ouverture. « Encre généreuse »
 * (upgrades.ts) continue de s'appliquer par-dessus, comme multiplicateur
 * (`RunStats.pickupIntervalMultiplier`) plutôt que par mutation d'une valeur
 * absolue, puisque celle-ci varie désormais dans le temps.
 */
export function pickupInterval(elapsedSec: number): number {
  return lerp(3500, 2500, clamp01(ramp(elapsedSec, 90)))
}
