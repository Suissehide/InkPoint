import { describe, expect, it } from 'vitest'

import { cos, HALF_PI, hypot, PI, sin, TAU, wrapAngle } from './math'
import { createRng } from './rng'

const rng = createRng(0x5eed)
const sample = (n: number, min: number, max: number): number[] =>
  Array.from({ length: n }, () => rng.range(min, max))

/**
 * Écart en ulp entre deux doubles. `Number.EPSILON * |expected|` approche l'ulp
 * à un facteur deux près selon la position dans la binade — assez fin pour
 * distinguer « quelques ulp » de « formule fausse », qui est tout ce qu'on
 * demande ici.
 */
function ulps(actual: number, expected: number): number {
  if (actual === expected) {
    return 0
  }
  const ulp = Math.max(Number.MIN_VALUE, Math.abs(expected) * Number.EPSILON)
  return Math.abs(actual - expected) / ulp
}

describe('hypot', () => {
  it('vaut exactement sqrt(x² + y²)', () => {
    for (const x of sample(200, -2000, 2000)) {
      const y = rng.range(-2000, 2000)
      expect(hypot(x, y)).toBe(Math.sqrt(x * x + y * y))
    }
  })

  // Budget de 4 ulp, et non de 1. `Math.hypot` est délibérément plus précis que
  // la formule naïve : il évite l'accumulation d'arrondi des deux carrés et de
  // leur somme. 2 ulp d'écart sont mesurés à l'échelle de l'arène, ce qui est
  // exactement ce que l'analyse d'erreur prédit.
  //
  // Surtout, ce test ne mesure pas ce qui compte. La portabilité ne vient pas
  // d'un accord avec `Math.hypot` — dont chaque moteur choisit
  // l'approximation — mais du fait que `sqrt(x*x + y*y)` n'utilise que des
  // opérations exactement spécifiées par IEEE-754. Ce test ne vérifie qu'une
  // chose : qu'on ne s'est pas trompé de formule. La preuve de portabilité,
  // elle, est dans `math.golden.test.ts` et ne tolère rien.
  //
  // Pour l'ordre de grandeur : les résultats atterrissent dans des composants
  // `Types.f32`, dont la grille est 2,7 × 10⁸ fois plus grossière que cet écart.
  it('reste à quelques ulp de Math.hypot à l’échelle de l’arène', () => {
    for (const x of sample(200, -2000, 2000)) {
      const y = rng.range(-2000, 2000)
      expect(ulps(hypot(x, y), Math.hypot(x, y))).toBeLessThan(4)
    }
  })

  it('vaut zéro à l’origine', () => {
    expect(hypot(0, 0)).toBe(0)
  })
})

describe('wrapAngle', () => {
  it('laisse intact un angle déjà dans (-π, π]', () => {
    for (const a of sample(200, -3.14, 3.14)) {
      expect(wrapAngle(a)).toBe(a)
    }
  })

  it('ramène tout angle dans (-π, π]', () => {
    for (const a of sample(500, -1000, 1000)) {
      const w = wrapAngle(a)
      expect(w).toBeGreaterThan(-PI - 1e-9)
      expect(w).toBeLessThanOrEqual(PI + 1e-9)
    }
  })

  it('préserve le cosinus et le sinus de l’angle', () => {
    for (const a of sample(200, -1000, 1000)) {
      expect(Math.cos(wrapAngle(a))).toBeCloseTo(Math.cos(a), 9)
      expect(Math.sin(wrapAngle(a))).toBeCloseTo(Math.sin(a), 9)
    }
  })

  it('ramène un tour complet à zéro', () => {
    expect(wrapAngle(TAU)).toBeCloseTo(0, 12)
    expect(wrapAngle(-TAU)).toBeCloseTo(0, 12)
  })
})

describe('sin et cos', () => {
  it('restent à quelques ulp de Math.sin sur (-π, π]', () => {
    for (const x of sample(2000, -PI, PI)) {
      expect(ulps(sin(x), Math.sin(x))).toBeLessThan(4)
    }
  })

  it('restent à quelques ulp de Math.cos sur (-π, π]', () => {
    for (const x of sample(2000, -PI, PI)) {
      expect(ulps(cos(x), Math.cos(x))).toBeLessThan(4)
    }
  })

  it('tiennent au-delà d’un tour, jusqu’à 1000 radians', () => {
    for (const x of sample(2000, -1000, 1000)) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(4e-16)
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(4e-16)
    }
  })

  it('donne les valeurs remarquables', () => {
    expect(sin(0)).toBe(0)
    expect(cos(0)).toBe(1)
    expect(sin(HALF_PI)).toBeCloseTo(1, 15)
    expect(cos(HALF_PI)).toBeCloseTo(0, 15)
    expect(sin(PI)).toBeCloseTo(0, 15)
    expect(cos(PI)).toBeCloseTo(-1, 15)
    expect(sin(TAU)).toBeCloseTo(0, 15)
    expect(cos(TAU)).toBeCloseTo(1, 15)
  })

  it('respecte l’identité fondamentale', () => {
    for (const x of sample(1000, -100, 100)) {
      expect(sin(x) * sin(x) + cos(x) * cos(x)).toBeCloseTo(1, 15)
    }
  })

  it('est impaire pour sin, paire pour cos', () => {
    for (const x of sample(500, -10, 10)) {
      expect(sin(-x)).toBe(-sin(x))
      expect(cos(-x)).toBe(cos(x))
    }
  })
})
