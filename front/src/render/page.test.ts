import { describe, expect, it } from 'vitest'

import { applyHaloMask, PAGE_HALO_RADIUS, PAGE_REVEAL_PEAK, revealAlpha } from './page'

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

/** Reproduit la sémantique réelle de `Container#setMask` en Pixi v8.19 (voir `applyHaloMask`) : un vrai `Container` n'est pas instanciable sans DOM/WebGL. */
function createFakePixiContainer(): {
  mask: number | null
  setMask(options: { mask: number | null; channel?: 'red' | 'alpha' }): void
} {
  return {
    mask: null,
    setMask(options) {
      if (options.mask) {
        this.mask = options.mask
      }
    },
  }
}

describe('applyHaloMask', () => {
  it('pose le masque quand le halo est actif', () => {
    const target = createFakePixiContainer()
    applyHaloMask(target, 7, true)
    expect(target.mask).toBe(7)
  })

  it('retire réellement le masque quand le halo est coupé', () => {
    const target = createFakePixiContainer()
    applyHaloMask(target, 7, true)
    applyHaloMask(target, 7, false)
    expect(target.mask).toBeNull()
  })

  it('ne pose rien tant que le halo reste coupé', () => {
    const target = createFakePixiContainer()
    applyHaloMask(target, 7, false)
    expect(target.mask).toBeNull()
  })
})
