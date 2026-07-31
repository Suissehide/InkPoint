import { describe, expect, it } from 'vitest'

import { Position } from './components'
import { spawnPlayer } from './spawn'
import { ARENA, createWorld, FIXED_DT } from './world'

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
    // Valeur épinglée en dur volontairement : c'est ce qui force une
    // modification de l'arène à être un geste délibéré plutôt qu'un effet de
    // bord. Le rapport 16:9, lui, est une contrainte permanente — l'échelle du
    // viewport (`render/stage.ts`) ne vaut 1 qu'à ce format.
    expect(ARENA).toEqual({ width: 1280, height: 720 })
    expect(ARENA.width / ARENA.height).toBeCloseTo(16 / 9, 5)
  })

  it("place le joueur au centre de l'arène de référence", () => {
    const w = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
    const eid = spawnPlayer(w)
    // Dérivé d'`ARENA` plutôt que codé en dur : ce test porte sur le centrage,
    // pas sur les dimensions — celles-ci sont épinglées par le test au-dessus,
    // et les répéter ici ne ferait que doubler le coût du prochain changement.
    expect(Position.x[eid]).toBe(ARENA.width / 2)
    expect(Position.y[eid]).toBe(ARENA.height / 2)
  })
})
