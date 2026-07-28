import { describe, expect, it } from 'vitest'

import { Position, Velocity } from '../components'
import { spawnPlayer } from '../spawn'
import { createWorld, FIXED_DT } from '../world'
import { integrationSystem } from './integration'
import { playerMovementSystem } from './player-movement'

const world = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

const stepN = (w: ReturnType<typeof world>, n: number) => {
  for (let i = 0; i < n; i++) {
    playerMovementSystem(w)
    integrationSystem(w)
  }
}

describe('playerMovementSystem', () => {
  it("démarre immobile au centre de l'arène", () => {
    const w = world()
    expect(Position.x[w.playerEid]).toBe(400)
    expect(Position.y[w.playerEid]).toBe(300)
    expect(Velocity.x[w.playerEid]).toBe(0)
  })

  it('accélère dans la direction demandée', () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 5)
    expect(Velocity.x[w.playerEid]).toBeGreaterThan(0)
    expect(Position.x[w.playerEid]).toBeGreaterThan(400)
  })

  it('atteint au moins 90% de la vitesse max en 120 ms', () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, Math.ceil(120 / FIXED_DT))
    expect(Velocity.x[w.playerEid]).toBeGreaterThanOrEqual(240 * 0.9)
  })

  it('ne dépasse jamais 240 px/s en diagonale', () => {
    const w = world()
    w.input.moveX = 1
    w.input.moveY = 1
    stepN(w, 60)
    const speed = Math.hypot(Velocity.x[w.playerEid]!, Velocity.y[w.playerEid]!)
    expect(speed).toBeLessThanOrEqual(240.5)
  })

  it("s'arrête en environ 80 ms quand l'entrée cesse", () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 30)
    w.input.moveX = 0
    stepN(w, Math.ceil(80 / FIXED_DT))
    expect(Math.abs(Velocity.x[w.playerEid]!)).toBeLessThan(24)
  })

  it('est bloqué par les murs, sans rebond', () => {
    const w = world()
    w.input.moveX = -1
    stepN(w, 300)
    expect(Position.x[w.playerEid]).toBeGreaterThanOrEqual(0)
    expect(Position.x[w.playerEid]).toBeLessThan(20)
    expect(Velocity.x[w.playerEid]).toBe(0)
  })
})
