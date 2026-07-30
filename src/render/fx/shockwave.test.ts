import { describe, expect, it } from 'vitest'

import { ringRadius } from './shockwave'

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
