/**
 * Génère `sim/math.golden.json`. À relancer uniquement quand `sim/math.ts`
 * change volontairement — la fixture est justement là pour que rien d'autre ne
 * la fasse bouger.
 *
 * Depuis `front/` : `npm run golden`
 *
 * Régénérer est légitime seulement après un changement volontaire de
 * `sim/math.ts` qui continue de n'utiliser que des opérations exactement
 * spécifiées — voir la liste blanche vérifiée par `purity.test.ts`. Ce
 * n'est **jamais** légitime simplement parce que `math.golden.test.ts` a
 * rougi : rougir est tout l'objet du fichier, et relancer ce script pour
 * faire repasser un test rouge au vert re-fige la fixture autour d'un
 * comportement qui vient justement de changer sans qu'on l'ait décidé.
 * C'est le chemin le plus probable par lequel cette branche entière
 * pourrirait en silence.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { atan2, cos, exp, hypot, PI, sin, TAU, wrapAngle } from '../math'
import { createRng } from '../rng'

const view = new DataView(new ArrayBuffer(8))
const bitPattern = (v: number): string => {
  view.setFloat64(0, v)
  return view.getBigUint64(0).toString(16).padStart(16, '0')
}

const rng = createRng(0x90d)
const draw = (n: number, min: number, max: number): number[] =>
  Array.from({ length: n }, () => rng.range(min, max))

/** Valeurs remarquables : axes, bornes de quadrant, très petits, très grands. */
const NOTABLE = [
  0,
  1,
  -1,
  0.5,
  -0.5,
  PI,
  -PI,
  PI / 2,
  -PI / 2,
  PI / 4,
  -PI / 4,
  PI / 6,
  TAU,
  -TAU,
  1e-8,
  -1e-8,
  1e-300,
  1000,
  -1000,
  Number.MIN_VALUE,
  Number.EPSILON,
]

const unary = (f: (x: number) => number, inputs: number[]): [number, string][] =>
  inputs.map((x) => [x, bitPattern(f(x))])

const binary = (
  f: (a: number, b: number) => number,
  inputs: [number, number][],
): [number, number, string][] => inputs.map(([a, b]) => [a, b, bitPattern(f(a, b))])

/**
 * Bornes du domaine garanti d'`exp` et bande de saturation. `NOTABLE` ne porte
 * que ±1000, déjà profondément saturé, et les tirages restent dans [-100, 100] :
 * sans ces valeurs, un `k > 1023` changé en `k >= 1023` passe inaperçu. Vérifié
 * en injectant la régression : zéro divergence sur les 421 entrées d'avant.
 */
const EXP_THRESHOLD = [708, -708, 709, 709.089, 709.436, 709.5, -709, -720, -745]

/**
 * Bord du domaine garanti de `sin`/`cos` — `2^20 · π/2`, voir la docstring de
 * `sin` dans `math.ts` — juste en-deçà. Sans cette valeur, un changement qui
 * déplacerait la borne passerait inaperçu : le reste de la fixture ne visite
 * que des angles bien plus petits.
 */
const SIN_COS_BOUNDARY = [2 ** 20 * (PI / 2), -(2 ** 20 * (PI / 2))]

const wideAngles = [...NOTABLE, ...SIN_COS_BOUNDARY, ...draw(400, -1000, 1000)]
const pairs: [number, number][] = Array.from({ length: 400 }, () => [
  rng.range(-2000, 2000),
  rng.range(-2000, 2000),
])
const notablePairs: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
  [1, 1e-12],
  [1e-12, 1],
  [1e8, 1],
  [1, 1e8],
  // Magnitudes subnormales : `NOTABLE` en porte pour les fonctions unaires,
  // mais `atan2`/`hypot` n'en visitaient aucune. Contrairement à `-0` et
  // `NaN`, ces valeurs passent le JSON sans perte — `5e-324` s'y
  // round-trippe exactement — donc rien n'empêchait de les épingler ici.
  // Ça pin aussi l'underflow vers zéro de `hypot`, sa seule saturation
  // jusque-là non couverte par la fixture.
  [Number.MIN_VALUE, Number.MIN_VALUE],
  [Number.MIN_VALUE, 1],
  [1, Number.MIN_VALUE],
  [1e-320, 1e-320],
]

const fixture = {
  _warning:
    'Généré par sim/scripts/gen-golden.ts. Ne pas éditer à la main. Toute modification ' +
    'de ce fichier signifie un changement volontaire de sim/math.ts.',
  sin: unary(sin, wideAngles),
  cos: unary(cos, wideAngles),
  exp: unary(exp, [...NOTABLE, ...EXP_THRESHOLD, ...draw(400, -100, 100)]),
  wrapAngle: unary(wrapAngle, wideAngles),
  atan2: binary(atan2, [...notablePairs, ...pairs]),
  hypot: binary(hypot, [...notablePairs, ...pairs]),
}

/**
 * Sérialiser à la main plutôt que via `JSON.stringify(fixture, null, 2)` : celui-ci
 * met chaque nombre d'un tuple sur sa propre ligne, une mise en forme que Biome
 * réécrirait aussitôt (un tuple par ligne). Écrire directement dans le format que
 * Biome choisit garde le fichier committé stable d'une génération à l'autre — sans
 * quoi `npm run golden` produirait un diff purement cosmétique à chaque appel.
 */
const tuple = (values: (number | string)[]): string =>
  `[${values.map((v) => JSON.stringify(v)).join(', ')}]`

const formatEntries = (entries: (number | string)[][]): string =>
  `[\n${entries.map((e) => `    ${tuple(e)}`).join(',\n')}\n  ]`

/**
 * Le gabarit est dérivé des clés de `fixture`, et non recopié : une liste de
 * fonctions écrite à la main une seconde fois est une liste qui finira
 * désynchronisée, et une fonction oubliée disparaîtrait du fichier committé sans
 * qu'aucun test ne s'en aperçoive.
 */
const sections = Object.entries(fixture)
  .filter(([key]) => key !== '_warning')
  .map(
    ([key, entries]) =>
      `  ${JSON.stringify(key)}: ${formatEntries(entries as (number | string)[][])}`,
  )

const json = `{
  "_warning": ${JSON.stringify(fixture._warning)},
${sections.join(',\n')}
}
`

const outputPath = fileURLToPath(new URL('../math.golden.json', import.meta.url))
writeFileSync(outputPath, json)
console.log(`écrit : ${outputPath}`)
