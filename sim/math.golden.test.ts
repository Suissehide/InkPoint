import { describe, expect, it } from 'vitest'

import { atan2, cos, exp, hypot, sin, wrapAngle } from './math'
import golden from './math.golden.json'

const view = new DataView(new ArrayBuffer(8))
const bitPattern = (v: number): string => {
  view.setFloat64(0, v)
  return view.getBigUint64(0).toString(16).padStart(16, '0')
}

const UNARY = {
  sin,
  cos,
  exp,
  wrapAngle,
} satisfies Record<string, (x: number) => number>

const BINARY = {
  atan2,
  hypot,
} satisfies Record<string, (a: number, b: number) => number>

/**
 * Aucune tolérance : c'est tout l'objet du fichier. `math.test.ts` vérifie que
 * l'implémentation est juste ; celui-ci vérifie qu'elle donne le *même* bit
 * partout. Rejoué dans Chromium, Firefox et WebKit par
 * `vitest.browser.config.ts`, il est la preuve que le serveur pourra rejouer la
 * partie d'un joueur quel que soit son navigateur.
 */
/**
 * Les zéros signés, `NaN` et les infinis ne peuvent pas vivre dans la fixture :
 * `JSON.stringify(-0)` rend `'0'` et `JSON.stringify(NaN)` rend `'null'`. Un
 * `-0` écrit dans le JSON ressortirait en `+0`, et le test comparerait alors la
 * sortie de `atan2(-0, …)` à l'entrée `atan2(0, …)` — une couverture illusoire
 * qui, pire, ferait rougir le test pour une mauvaise raison.
 *
 * Ces cas sont donc épinglés explicitement ici. Ce sont des contrats de
 * comportement, pas des échantillons, et ils gagnent à être lisibles. La
 * comparaison à `Math.*` est légitime pour eux : contrairement aux valeurs
 * générales, la spec fixe **exactement** ce que valent `atan2` sur les axes et
 * les zéros, `sin(-0)` ou `exp(±∞)`. Rien n'y est laissé au moteur.
 *
 * Ils comptent : `atan2` distingue `-0` de `0` par `Object.is`, puisque `-0 < 0`
 * est faux. Retirer ces branches ne fait bouger aucune des entrées générées —
 * vérifié en injectant la régression.
 */
describe('valeurs spéciales, hors fixture', () => {
  it('atan2 traite les zéros signés comme Math.atan2', () => {
    const cases: [number, number][] = [
      [0, 1],
      [-0, 1],
      [0, -1],
      [-0, -1],
      [0, 0],
      [-0, 0],
      [0, -0],
      [-0, -0],
      [5, -0],
      [-5, -0],
      [-0, 5],
      [-0, -5],
    ]
    for (const [y, x] of cases) {
      const label = `atan2(${Object.is(y, -0) ? '-0' : y}, ${Object.is(x, -0) ? '-0' : x})`
      expect(bitPattern(atan2(y, x)), label).toBe(bitPattern(Math.atan2(y, x)))
    }
  })

  it('sin, cos, exp et wrapAngle préservent le zéro signé', () => {
    expect(bitPattern(sin(-0)), 'sin(-0)').toBe(bitPattern(Math.sin(-0)))
    expect(bitPattern(sin(0)), 'sin(0)').toBe(bitPattern(Math.sin(0)))
    expect(bitPattern(cos(-0)), 'cos(-0)').toBe(bitPattern(Math.cos(-0)))
    expect(bitPattern(exp(-0)), 'exp(-0)').toBe(bitPattern(Math.exp(-0)))
    expect(bitPattern(hypot(-0, -0)), 'hypot(-0, -0)').toBe(bitPattern(Math.hypot(-0, -0)))
    expect(bitPattern(wrapAngle(-0)), 'wrapAngle(-0)').toBe(bitPattern(-0))
  })

  it('exp propage NaN et sature aux infinis', () => {
    expect(Number.isNaN(exp(Number.NaN))).toBe(true)
    expect(exp(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
    expect(exp(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe('motifs binaires figés', () => {
  for (const [name, f] of Object.entries(UNARY)) {
    it(`${name} reproduit la fixture au bit près`, () => {
      const cases = golden[name as keyof typeof UNARY] as [number, string][]
      expect(cases.length).toBeGreaterThan(400)
      for (const [x, expected] of cases) {
        expect(bitPattern(f(x)), `${name}(${x})`).toBe(expected)
      }
    })
  }

  for (const [name, f] of Object.entries(BINARY)) {
    it(`${name} reproduit la fixture au bit près`, () => {
      const cases = golden[name as keyof typeof BINARY] as [number, number, string][]
      expect(cases.length).toBeGreaterThan(400)
      for (const [a, b, expected] of cases) {
        expect(bitPattern(f(a, b)), `${name}(${a}, ${b})`).toBe(expected)
      }
    })
  }
})
