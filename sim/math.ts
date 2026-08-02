/**
 * Arithmétique portable de la simulation.
 *
 * La spec ECMAScript laisse à chaque moteur le choix de son approximation pour
 * `Math.sin`, `cos`, `atan2`, `exp` et `hypot` : deux navigateurs n'ont aucune
 * obligation de renvoyer le même bit de poids faible. Une simulation qui les
 * appelle n'est donc reproductible que sur la machine qui l'a produite — ce qui
 * interdit à un serveur de rejouer la partie d'un joueur pour en recalculer le
 * score, et interdirait aussi le netcode à rollback.
 *
 * Ce module les remplace par des implémentations qui n'utilisent que `+`, `-`,
 * `*`, `/`, `Math.sqrt`, `Math.floor`, `Math.round` et `Math.abs`. Toutes sont
 * exactement spécifiées par IEEE-754 en arrondi au plus proche pair, et la spec
 * JavaScript interdit la contraction en FMA. La portabilité vient donc de la
 * construction, pas de la chance : deux moteurs conformes ne *peuvent pas*
 * produire des résultats différents.
 *
 * `purity.test.ts` interdit d'appeler les transcendants ailleurs dans `sim/`.
 * Ce fichier est la seule exemption.
 */

/** Exact : la spec impose la valeur double la plus proche de π. */
export const PI = Math.PI
export const TAU = 2 * Math.PI
export const HALF_PI = Math.PI / 2

/**
 * `Math.hypot` protège contre l'over/underflow au prix d'une approximation
 * laissée au moteur. À l'échelle d'une arène de 1280 × 720 la protection n'a
 * aucun objet, et `sqrt` est exactement spécifié.
 */
export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

/**
 * Repli d'un angle dans (-π, π], en arithmétique exacte.
 *
 * Sert à deux choses : remplacer l'idiome `atan2(sin(a), cos(a))`, et borner
 * `Facing.angle`, qui s'accumule sans repli et dériverait hors du domaine où la
 * réduction d'argument de `sin`/`cos` reste précise.
 */
export function wrapAngle(a: number): number {
  const w = a - TAU * Math.round(a / TAU)
  // `round` arrondit les demis vers +∞, donc l'intervalle obtenu est [-π, π).
  // On rabat la borne basse pour obtenir (-π, π], la convention d'`atan2`.
  return w <= -PI ? w + TAU : w
}
