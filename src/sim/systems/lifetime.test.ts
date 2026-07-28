import { addComponent, addEntity, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Lifetime } from '../components'
import { createWorld } from '../world'
import { lifetimeSystem } from './lifetime'

describe('lifetimeSystem', () => {
  it("ne marque pas Doomed tant que le sursis n'est pas écoulé", () => {
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    const eid = addEntity(w)
    addComponent(w, Lifetime, eid)
    Lifetime.remaining[eid] = 1000
    lifetimeSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
    // Le sursis doit réellement avoir diminué, pas juste être resté figé.
    expect(Lifetime.remaining[eid]).toBeLessThan(1000)
    expect(Lifetime.remaining[eid]).toBeGreaterThan(0)
  })

  it('marque Doomed une fois le sursis écoulé', () => {
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    const eid = addEntity(w)
    addComponent(w, Lifetime, eid)
    Lifetime.remaining[eid] = 5
    lifetimeSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(true)
  })

  it("n'affecte pas une entité sans Lifetime", () => {
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    const eid = addEntity(w)
    lifetimeSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })
})
