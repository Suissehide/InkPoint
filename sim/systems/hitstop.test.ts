import { describe, expect, it } from 'vitest'

import { createWorld, type SimWorld } from '../world'
import { HITSTOP_MS, hitstopSystem } from './hitstop'

function newWorld(): SimWorld {
  return createWorld({ seed: 1, width: 1280, height: 720 })
}

function kill(world: SimWorld): void {
  world.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
}

describe('hitstop', () => {
  it('laisse le temps couler quand rien ne meurt', () => {
    const world = newWorld()
    hitstopSystem(world)
    expect(world.timeScale).toBe(1)
  })

  it('gèle le temps au pas qui suit un kill', () => {
    const world = newWorld()
    kill(world)
    hitstopSystem(world)
    expect(world.timeScale).toBe(0)
    expect(world.hitstopRemaining).toBe(HITSTOP_MS)
  })

  it('dégèle une fois la durée écoulée', () => {
    const world = newWorld()
    kill(world)
    // Quatre pas de 16,67 ms dépassent les 60 ms de gel.
    for (let i = 0; i < 5; i++) {
      hitstopSystem(world)
      world.events.length = 0
    }
    expect(world.timeScale).toBe(1)
  })

  it('refuse un second gel tant que la cadence n’est pas écoulée', () => {
    const world = newWorld()
    kill(world)
    hitstopSystem(world)
    world.events.length = 0
    // On laisse le gel expirer, sans atteindre la cadence de 200 ms.
    for (let i = 0; i < 5; i++) {
      hitstopSystem(world)
    }
    expect(world.timeScale).toBe(1)
    kill(world)
    hitstopSystem(world)
    expect(world.timeScale).toBe(1)
    expect(world.hitstopCooldownRemaining).toBeGreaterThan(0)
  })

  it('regèle une fois la cadence écoulée', () => {
    const world = newWorld()
    kill(world)
    hitstopSystem(world)
    world.events.length = 0
    // 13 pas de 16,67 ms passent les 200 ms de cadence.
    for (let i = 0; i < 13; i++) {
      hitstopSystem(world)
    }
    kill(world)
    hitstopSystem(world)
    expect(world.timeScale).toBe(0)
  })

  it('décompte la cadence même pendant un gel', () => {
    const world = newWorld()
    kill(world)
    hitstopSystem(world)
    const avant = world.hitstopCooldownRemaining
    world.events.length = 0
    hitstopSystem(world)
    expect(world.hitstopCooldownRemaining).toBeLessThan(avant)
  })
})
