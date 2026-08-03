/**
 * Génère `sim/math.golden.json`. À relancer uniquement quand `sim/math.ts`
 * change volontairement — la fixture est justement là pour que rien d'autre ne
 * la fasse bouger.
 *
 * Depuis `front/` : `npm run golden`
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

const wideAngles = [...NOTABLE, ...draw(400, -1000, 1000)]
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
]

const fixture = {
  _warning:
    'Généré par sim/scripts/gen-golden.ts. Ne pas éditer à la main. Toute modification ' +
    'de ce fichier signifie un changement volontaire de sim/math.ts.',
  sin: unary(sin, wideAngles),
  cos: unary(cos, wideAngles),
  exp: unary(exp, [...NOTABLE, ...draw(400, -100, 100)]),
  wrapAngle: unary(wrapAngle, wideAngles),
  atan2: binary(atan2, [...notablePairs, ...pairs]),
  hypot: binary(hypot, [...notablePairs, ...pairs]),
}

/**
 * Sérialise à la main plutôt que via `JSON.stringify(fixture, null, 2)` :
 * celui-ci mettrait chaque nombre d'un tuple sur sa propre ligne, une mise en
 * forme que Biome reformaterait aussitôt (un tuple par ligne) à la prochaine
 * régénération. Écrire directement dans le format que Biome choisit garde le
 * fichier committé stable d'une génération à l'autre.
 */
const tuple = (values: (number | string)[]): string =>
  `[${values.map((v) => JSON.stringify(v)).join(', ')}]`

const formatEntries = (entries: (number | string)[][]): string =>
  `[\n${entries.map((e) => `    ${tuple(e)}`).join(',\n')}\n  ]`

const json = `{
  "_warning": ${JSON.stringify(fixture._warning)},
  "sin": ${formatEntries(fixture.sin)},
  "cos": ${formatEntries(fixture.cos)},
  "exp": ${formatEntries(fixture.exp)},
  "wrapAngle": ${formatEntries(fixture.wrapAngle)},
  "atan2": ${formatEntries(fixture.atan2)},
  "hypot": ${formatEntries(fixture.hypot)}
}
`

const outputPath = fileURLToPath(new URL('../math.golden.json', import.meta.url))
writeFileSync(outputPath, json)
console.log(`écrit : ${outputPath}`)
