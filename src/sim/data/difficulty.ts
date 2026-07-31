export const WAVE_DURATION_MS = 40_000

/**
 * Plafond dur du nombre d'ennemis simultanés. Les survivants s'accumulant
 * d'une vague à l'autre (spec §3.1), sans ce plafond une run peut basculer
 * dans une spirale ingagnable — c'est le risque n°1 identifié en §11.
 *
 * 220 → 140 en même temps que l'arène passait de 1600×900 à 1280×720 : c'est
 * un plafond de *densité* déguisé en plafond de nombre, et l'aire tombant à
 * 64 % (0,8²), garder 220 aurait multiplié la foule au sol par 1,6 sans que
 * personne ne l'ait demandé. 220 × 0,64 ≈ 140.
 *
 * Puis 140 → 1500 : le jeu vise désormais une foule qui ne cesse d'épaissir,
 * qu'on traverse à la précision plutôt qu'on ne distance. Ce n'est plus un
 * réglage d'équilibrage mais un garde-fou — on meurt bien avant de l'atteindre.
 * Il reste parce que la simulation n'est pas ce qui cède en premier : mesurée
 * à 0,45 ms/pas pour 2400 ennemis (2,7 % du budget 60 fps), elle monte
 * linéairement, tandis que le rendu (un `Container` et un `Graphics` Pixi par
 * ennemi, plus le boil sur toute la couche) lâchera à un seuil qu'on ne sait
 * pas mesurer sans WebGL. Mieux vaut donc un plafond haut mais connu qu'un
 * emballement qui fige l'onglet sans qu'on sache pourquoi.
 */
export const MAX_ENEMIES = 1500

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
 * 90→145 (120 s) → 130→195 (90 s) → 110→150 px/s (90 s). Le second réglage
 * répondait à des ennemis « trop mous » ; le troisième revient dessus parce que
 * le jeu a changé de thèse entre-temps — il ne s'agit plus de distancer une
 * meute mais de traverser une foule qui ne cesse d'épaissir (`MAX_ENEMIES`), à
 * la précision.
 *
 * C'est la marge qui compte, pas la vitesse absolue : le joueur va à 240 px/s
 * (spawn.ts), donc 195 ne laissait que 45 px/s d'écart en fin de partie — de
 * quoi fuir tout droit, pas de quoi se replacer ni enfiler un intervalle. À
 * 150, la marge remonte à 90 px/s et l'esquive fine redevient jouable. Le
 * joueur reste toujours le plus rapide : contrainte structurante qui ne bouge
 * pas.
 */
export function enemyMaxSpeed(elapsedSec: number): number {
  return lerp(110, 150, clamp01(ramp(elapsedSec, 90)))
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
  // 3500→2500 → 2500→1800 ms : la foule ne cesse plus d'épaissir
  // (`MAX_ENEMIES`), il faut donc des outils plus souvent sous la main. ~40 %
  // plus fréquents, mais toujours assez espacés pour qu'aller chercher une
  // pastille reste une décision plutôt qu'un réflexe.
  return lerp(2500, 1800, clamp01(ramp(elapsedSec, 90)))
}
