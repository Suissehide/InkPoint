import { describe, expect, it } from 'vitest'

import { PAGE_HALO_RADIUS, PAGE_REVEAL_PEAK, revealAlpha } from './page'

describe('revealAlpha', () => {
  it('atteint son pic sous la plume', () => {
    expect(revealAlpha(0, PAGE_HALO_RADIUS)).toBeCloseTo(PAGE_REVEAL_PEAK, 10)
  })

  it('s’annule exactement au bord du halo', () => {
    expect(revealAlpha(PAGE_HALO_RADIUS, PAGE_HALO_RADIUS)).toBe(0)
  })

  it('reste nulle au-delà : la page n’existe que dans le halo', () => {
    expect(revealAlpha(PAGE_HALO_RADIUS * 3, PAGE_HALO_RADIUS)).toBe(0)
  })

  it('décroît de façon monotone', () => {
    expect(revealAlpha(40, PAGE_HALO_RADIUS)).toBeGreaterThan(revealAlpha(120, PAGE_HALO_RADIUS))
  })
})
