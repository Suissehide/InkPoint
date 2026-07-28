import { describe, expect, it } from 'vitest'

import { createWorld, FIXED_DT } from './world'

describe('createWorld', () => {
  it('expose un pas de temps de 60 Hz', () => {
    expect(FIXED_DT).toBeCloseTo(16.6667, 3)
  })

  it("démarre à t = 0 avec une file d'événements vide", () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    expect(world.time).toBe(0)
    expect(world.events).toEqual([])
    expect(world.arena).toEqual({ width: 800, height: 600 })
  })

  it('initialise son PRNG à partir de la graine', () => {
    const a = createWorld({ seed: 5, width: 800, height: 600 })
    const b = createWorld({ seed: 5, width: 800, height: 600 })
    expect(a.rng.next()).toBe(b.rng.next())
  })
})
