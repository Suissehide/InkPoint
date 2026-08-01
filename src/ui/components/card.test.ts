import { describe, expect, it } from 'vitest'

import { frameJitter } from './card'

describe('frameJitter', () => {
  it('rend toujours la même déviation pour une carte et un sommet donnés', () => {
    expect(frameJitter('shockwave', 2)).toBe(frameJitter('shockwave', 2))
  })

  it('dévie différemment deux sommets de la même carte', () => {
    const sommets = [0, 1, 2, 3].map((i) => frameJitter('shockwave', i))
    expect(new Set(sommets).size).toBeGreaterThan(1)
  })

  it('dévie différemment deux cartes au même sommet', () => {
    expect(frameJitter('shockwave', 0)).not.toBe(frameJitter('light-step', 0))
  })

  it('reste dans une déviation discrète, jamais un cadre difforme', () => {
    for (const id of ['shockwave', 'light-step', 'second-ink', 'afterburn']) {
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(frameJitter(id, i))).toBeLessThanOrEqual(2.5)
      }
    }
  })
})
