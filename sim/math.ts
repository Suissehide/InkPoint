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

/**
 * Minimax de fdlibm pour atan sur [0, 0.4375]. La réduction ci-dessous garantit
 * que l'argument y tombe toujours : c'est la condition pour que ces onze
 * coefficients suffisent à tenir l'ulp.
 */
const T0 = 0.3333333333333293
const T1 = -0.19999999999876483
const T2 = 0.14285714272503466
const T3 = -0.11111110405462356
const T4 = 0.09090887133436507
const T5 = -0.0769187620504483
const T6 = 0.06661073137387531
const T7 = -0.058335701337905735
const T8 = 0.049768779946159324
const T9 = -0.036531572744216916
const T10 = 0.016285820115365782

/** `tan(π/8)`, exprimé exactement par `sqrt(2) - 1`. */
const TAN_PI_8 = Math.sqrt(2) - 1
const PI_4 = Math.PI / 4

/** atan sur [0, 1], par repli sur [0, tan(π/8)] puis polynôme impair. */
function atanUnit(t: number): number {
  if (t > TAN_PI_8) {
    // atan(t) = π/4 + atan((t-1)/(t+1)), et l'argument replié tient dans
    // [-(√2-1), 0] pour t dans [√2-1, 1].
    return PI_4 + atanSmall((t - 1) / (t + 1))
  }
  return atanSmall(t)
}

function atanSmall(t: number): number {
  const z = t * t
  const w = z * z
  const oddPart = z * (T0 + w * (T2 + w * (T4 + w * (T6 + w * (T8 + w * T10)))))
  const evenPart = w * (T1 + w * (T3 + w * (T5 + w * (T7 + w * T9))))
  return t - t * (oddPart + evenPart)
}

/**
 * ln 2 scindé, même principe que π/2 pour la réduction de sin. `LN2_HI` n'est
 * pas `Math.LN2` : c'est sa partie haute tronquée (mantisse terminée par des
 * zéros), ce qui est précisément ce qui rend la soustraction exacte.
 */
const LN2_HI = 0.6931471803691238
const LN2_LO = 1.9082149292705877e-10

/**
 * `Math.LOG2E` et non un littéral : c'est une **constante** de la spec, donc
 * exactement spécifiée — même catégorie que `Math.PI`, et sans rapport avec les
 * *fonctions* transcendantes que ce module existe pour éviter. Bit-identique au
 * littéral `1.4426950408889634`, et la règle Biome
 * `noApproximativeNumericConstant` la réclame à juste titre.
 */
const INV_LN2 = Math.LOG2E

/** Minimax de fdlibm pour exp. */
const E1 = 0.16666666666666602
const E2 = -0.0027777777777015593
const E3 = 0.00006613756321437934
const E4 = -0.0000016533902205465252
const E5 = 4.1381367970572385e-8

const bits = new DataView(new ArrayBuffer(8))

/**
 * 2^k, construit en écrivant directement l'exposant IEEE-754 plutôt qu'avec
 * `Math.pow` — qui est, lui aussi, laissé à l'appréciation du moteur.
 */
function powerOfTwo(k: number): number {
  if (k > 1023) {
    return Number.POSITIVE_INFINITY
  }
  if (k < -1022) {
    return 0
  }
  bits.setBigUint64(0, BigInt(k + 1023) << 52n)
  return bits.getFloat64(0)
}

export function exp(x: number): number {
  if (Number.isNaN(x)) {
    return x
  }
  if (x === Number.POSITIVE_INFINITY) {
    return x
  }
  if (x === Number.NEGATIVE_INFINITY) {
    return 0
  }

  const k = Math.round(x * INV_LN2)
  const hi = x - k * LN2_HI
  const lo = k * LN2_LO
  const r = hi - lo

  const t = r * r
  const c = r - t * (E1 + t * (E2 + t * (E3 + t * (E4 + t * E5))))
  const y = 1 - (lo - (r * c) / (2 - c) - hi)

  return y * powerOfTwo(k)
}

export function atan2(y: number, x: number): number {
  if (x === 0 && y === 0) {
    // Même convention que `Math.atan2` : le signe de x décide.
    return Object.is(x, -0) ? (Object.is(y, -0) ? -PI : PI) : y
  }
  const ay = Math.abs(y)
  const ax = Math.abs(x)
  // On ne divise jamais le grand par le petit : le rapport reste dans [0, 1],
  // domaine où `atanUnit` est précis.
  const angle = ay <= ax ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay)
  if (x < 0) {
    return y < 0 || Object.is(y, -0) ? -(PI - angle) : PI - angle
  }
  return y < 0 || Object.is(y, -0) ? -angle : angle
}
