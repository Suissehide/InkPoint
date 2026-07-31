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

/**
 * Reproduit la sémantique réelle (pas celle promise par son typage) de
 * `Container#setMask` dans Pixi v8.19 : appelé avec `mask: null`, il
 * n'appelle jamais le setter `mask` — celui qui retire vraiment l'effet
 * (`effectsMixin.js` : `if (options.mask) { this.mask = options.mask }`).
 * C'est exactement le piège qui a laissé passer le bug initial. Un vrai
 * `Container` Pixi n'est pas instanciable ici (l'environnement de test n'a
 * ni DOM ni WebGL), donc ce faux objet en encode la sémantique névralgique
 * plutôt que de s'y fier aveuglément.
 */
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
