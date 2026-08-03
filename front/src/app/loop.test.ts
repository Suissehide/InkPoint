import { FIXED_DT } from '@sim/world'
import { describe, expect, it, vi } from 'vitest'

import { createFixedLoop } from './loop'

describe('createFixedLoop', () => {
  it('exécute un pas par tranche de 16,67 ms', () => {
    const onStep = vi.fn()
    const loop = createFixedLoop({ onStep, onRender: () => undefined })
    loop.advance(FIXED_DT * 3)
    expect(onStep).toHaveBeenCalledTimes(3)
  })

  it('conserve le reliquat entre deux appels', () => {
    const onStep = vi.fn()
    const loop = createFixedLoop({ onStep, onRender: () => undefined })
    loop.advance(FIXED_DT * 0.6)
    expect(onStep).toHaveBeenCalledTimes(0)
    loop.advance(FIXED_DT * 0.6)
    expect(onStep).toHaveBeenCalledTimes(1)
  })

  it("transmet un alpha d'interpolation entre 0 et 1", () => {
    const alphas: number[] = []
    const loop = createFixedLoop({ onStep: () => undefined, onRender: (a) => alphas.push(a) })
    loop.advance(FIXED_DT * 1.5)
    expect(alphas).toHaveLength(1)
    expect(alphas[0]).toBeCloseTo(0.5, 2)
  })

  it('borne le rattrapage pour éviter la spirale de la mort', () => {
    const onStep = vi.fn()
    const loop = createFixedLoop({ onStep, onRender: () => undefined })
    // 10 secondes d'onglet en arrière-plan : sans borne, 600 pas d'un coup.
    loop.advance(10_000)
    expect(onStep.mock.calls.length).toBeLessThanOrEqual(15)
  })

  it('ne transmet jamais un alpha négatif à la limite de rattrapage (250 ms)', () => {
    const alphas: number[] = []
    const loop = createFixedLoop({ onStep: () => undefined, onRender: (a) => alphas.push(a) })
    // À exactement 250 ms, le reliquat après 15 pas sous-dépasse zéro de quelques
    // ULP (division flottante), et non parce que l'écoulement dépasse le plafond.
    loop.advance(250)
    expect(alphas[0]).toBeGreaterThanOrEqual(0)
  })
})
