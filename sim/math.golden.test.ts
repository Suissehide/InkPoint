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
