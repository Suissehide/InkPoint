import { describe, expect, it } from 'vitest'

import { Position } from './components'
import { spawnPlayer } from './spawn'
import { ARENA, ARENA_MOBILE, createWorld, FIXED_DT } from './world'

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

describe('ARENA', () => {
  it('décrit une arène fixe en 16:9, indépendante de la fenêtre', () => {
    // Épinglé en dur pour forcer un changement d'arène à être délibéré. Le
    // 16:9 est une contrainte permanente : l'échelle du viewport ne vaut 1 qu'à ce format.
    expect(ARENA).toEqual({ width: 1280, height: 720, rangeScale: 1 })
    expect(ARENA.width / ARENA.height).toBeCloseTo(16 / 9, 5)
  })

  it("place le joueur au centre de l'arène de référence", () => {
    const w = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
    const eid = spawnPlayer(w)
    // Dérivé d'`ARENA`, pas codé en dur : ce test porte sur le centrage, pas
    // les dimensions (déjà épinglées ci-dessus).
    expect(Position.x[eid]).toBe(ARENA.width / 2)
    expect(Position.y[eid]).toBe(ARENA.height / 2)
  })
})

describe('ARENA_MOBILE', () => {
  it('garde exactement le ratio 16:9 de l’arène de bureau', () => {
    expect(ARENA_MOBILE.width / ARENA_MOBILE.height).toBeCloseTo(ARENA.width / ARENA.height, 12)
  })

  it('vaut 70 % de l’arène de bureau sur les deux axes', () => {
    expect(ARENA_MOBILE.width).toBe(896)
    expect(ARENA_MOBILE.height).toBe(504)
    expect(ARENA_MOBILE.width / ARENA.width).toBeCloseTo(0.7, 12)
    expect(ARENA_MOBILE.height / ARENA.height).toBeCloseTo(0.7, 12)
  })

  // `rangeScale` est déclaré, pas dérivé (voir l'encadré ci-dessus). Ce test
  // est ce qui empêche les deux de diverger silencieusement.
  it('déclare un rangeScale cohérent avec sa géométrie', () => {
    expect(ARENA.rangeScale).toBe(1)
    expect(ARENA_MOBILE.rangeScale).toBeCloseTo(ARENA_MOBILE.height / ARENA.height, 12)
  })

  it('se transmet au monde créé', () => {
    const world = createWorld({ seed: 1, width: ARENA_MOBILE.width, height: ARENA_MOBILE.height })
    expect(world.arena.width).toBe(896)
    expect(world.arena.height).toBe(504)
  })
})
