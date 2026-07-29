import { describe, expect, it } from 'vitest'

import { lerp } from './interpolate'

describe('lerp', () => {
  it('retourne a à t = 0', () => {
    expect(lerp(10, 20, 0)).toBe(10)
  })
  it('retourne b à t = 1', () => {
    expect(lerp(10, 20, 1)).toBe(20)
  })
  it('interpole au milieu', () => {
    expect(lerp(10, 20, 0.5)).toBe(15)
  })
  it('gère les valeurs négatives', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0)
  })
})
