import { describe, expect, it, vi } from 'vitest'

import { FIXED_DT } from '@/sim/world'
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
})
