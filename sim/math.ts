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

/**
 * π/2 scindé en une partie haute dont les 33 bits de poids faible sont nuls et
 * un reste. C'est ce qui rend la soustraction `x - n*PIO2_HI` exacte pour les
 * `n` que l'on rencontre, et donc la réduction d'argument fiable là où un
 * simple `x % (π/2)` perdrait la moitié des chiffres significatifs.
 * Valeurs de fdlibm (`__ieee754_rem_pio2`).
 */
const PIO2_HI = 1.5707963267341256
const PIO2_LO = 6.077100506506192e-11
const TWO_OVER_PI = 0.6366197723675814

/**
 * Minimax de fdlibm pour sin sur [-π/4, π/4]. Écrits sous leur forme décimale
 * la plus courte qui redonne exactement le même double, et non sous les 21
 * chiffres de la source C : un double n'en retient pas plus, et la règle
 * Biome `noPrecisionLoss` a raison de refuser un littéral qui prétend le
 * contraire. Vérifier ces valeurs contre fdlibm en comparant les doubles
 * obtenus, jamais les chaînes décimales.
 */
const S1 = -0.16666666666666632
const S2 = 0.00833333333332249
const S3 = -0.0001984126982985795
const S4 = 0.0000027557313707070068
const S5 = -2.5050760253406863e-8
const S6 = 1.58969099521155e-10

/** Minimax de fdlibm pour cos sur [-π/4, π/4]. Même forme courte que ci-dessus. */
const C1 = 0.0416666666666666
const C2 = -0.001388888888887411
const C3 = 0.00002480158728947673
const C4 = -2.7557314351390663e-7
const C5 = 2.087572321298175e-9
const C6 = -1.1359647557788195e-11

function sinKernel(x: number): number {
  const z = x * x
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))
  return x + z * x * (S1 + z * r)
}

function cosKernel(x: number): number {
  const z = x * x
  const r = C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6))))
  return 1 - 0.5 * z + z * z * r
}

/**
 * Ramène `x` dans [-π/4, π/4] et renvoie le quadrant. Le reste `r` est calculé
 * en deux temps (`PIO2_HI` puis `PIO2_LO`) pour ne pas perdre de précision
 * quand `n` est grand.
 */
function reduceAngle(x: number): { r: number; quadrant: number } {
  const n = Math.round(x * TWO_OVER_PI)
  const r = x - n * PIO2_HI - n * PIO2_LO
  return { r, quadrant: ((n % 4) + 4) % 4 }
}

export function sin(x: number): number {
  const { r, quadrant } = reduceAngle(x)
  switch (quadrant) {
    case 0:
      return sinKernel(r)
    case 1:
      return cosKernel(r)
    case 2:
      return -sinKernel(r)
    default:
      return -cosKernel(r)
  }
}

export function cos(x: number): number {
  const { r, quadrant } = reduceAngle(x)
  switch (quadrant) {
    case 0:
      return cosKernel(r)
    case 1:
      return -sinKernel(r)
    case 2:
      return -cosKernel(r)
    default:
      return sinKernel(r)
  }
}
