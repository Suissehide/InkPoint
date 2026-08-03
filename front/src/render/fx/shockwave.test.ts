import { describe, expect, it } from 'vitest'

import { evictionIndex, ringRadius, ringRadiusBetween } from './shockwave'

describe('ringRadius', () => {
  it('part du point d’impact', () => {
    expect(ringRadius(0, 100)).toBeCloseTo(0, 10)
  })

  it('atteint exactement le rayon maximal en fin de vie', () => {
    expect(ringRadius(1, 100)).toBeCloseTo(100, 10)
  })

  it('freine en fin de course : plus de la moitié du chemin à mi-temps', () => {
    expect(ringRadius(0.5, 100)).toBeGreaterThan(50)
  })

  it('reste monotone croissante', () => {
    expect(ringRadius(0.7, 100)).toBeGreaterThan(ringRadius(0.3, 100))
  })
})

describe('ringRadiusBetween', () => {
  it('coïncide avec ringRadius quand elle part de zéro', () => {
    expect(ringRadiusBetween(0.4, 0, 100)).toBeCloseTo(ringRadius(0.4, 100), 10)
  })

  it('part du rayon initial', () => {
    expect(ringRadiusBetween(0, 190, 14)).toBeCloseTo(190, 10)
  })

  it('atteint exactement le rayon final', () => {
    expect(ringRadiusBetween(1, 190, 14)).toBeCloseTo(14, 10)
  })

  it('reste monotone décroissante quand elle se contracte', () => {
    expect(ringRadiusBetween(0.7, 190, 14)).toBeLessThan(ringRadiusBetween(0.3, 190, 14))
  })
})

describe('evictionIndex', () => {
  it('sacrifie le premier anneau dont le délai est déjà épuisé', () => {
    expect(evictionIndex([50, 0, 30])).toBe(1)
  })

  it('retombe sur le plus ancien si tous attendent encore leur délai', () => {
    expect(evictionIndex([50, 30, 10])).toBe(0)
  })

  it('un anneau sans délai est immédiatement éligible', () => {
    expect(evictionIndex([0])).toBe(0)
  })
})
