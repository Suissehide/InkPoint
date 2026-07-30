import { describe, expect, it } from 'vitest'

import { afterimageAlpha } from './afterimage'

describe('afterimageAlpha', () => {
  it('est à son maximum à la naissance', () => {
    expect(afterimageAlpha(0, 250)).toBeCloseTo(1, 10)
  })

  it("s'éteint exactement en fin de vie", () => {
    expect(afterimageAlpha(250, 250)).toBeCloseTo(0, 10)
  })

  it('décroît de façon monotone', () => {
    expect(afterimageAlpha(50, 250)).toBeGreaterThan(afterimageAlpha(150, 250))
  })

  it('ne repasse jamais au-dessus de zéro passé la fin de vie', () => {
    expect(afterimageAlpha(400, 250)).toBe(0)
  })
})
