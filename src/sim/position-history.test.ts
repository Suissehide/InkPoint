import { describe, expect, it } from 'vitest'

import { createPositionHistory } from './position-history'

describe('createPositionHistory', () => {
  it("retourne la position à l'instant demandé", () => {
    const h = createPositionHistory(64)
    h.push(0, 0, 0)
    h.push(100, 100, 0)
    expect(h.sample(100)).toEqual({ x: 100, y: 0 })
  })

  it('interpole entre deux échantillons', () => {
    const h = createPositionHistory(64)
    h.push(0, 0, 0)
    h.push(100, 100, 0)
    const p = h.sample(50)
    expect(p.x).toBeCloseTo(50, 1)
  })

  it('retourne le plus ancien échantillon si on demande avant lui', () => {
    const h = createPositionHistory(64)
    h.push(100, 10, 10)
    h.push(200, 20, 20)
    expect(h.sample(0)).toEqual({ x: 10, y: 10 })
  })

  it('retourne le plus récent si on demande après lui', () => {
    const h = createPositionHistory(64)
    h.push(0, 0, 0)
    h.push(100, 100, 100)
    expect(h.sample(999)).toEqual({ x: 100, y: 100 })
  })

  it('écrase les plus anciens quand la capacité est atteinte', () => {
    const h = createPositionHistory(3)
    h.push(0, 0, 0)
    h.push(10, 10, 0)
    h.push(20, 20, 0)
    h.push(30, 30, 0)
    // L'échantillon t=0 a été écrasé : le plus ancien est maintenant t=10.
    expect(h.sample(0)).toEqual({ x: 10, y: 0 })
  })
})
