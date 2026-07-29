import { describe, expect, it, vi } from 'vitest'

import type { Camera } from '@/render/camera'
import type { Particles } from '@/render/particles'
import { createWorld } from '@/sim/world'
import { applyJuice, createJuiceState, DEATH_SLOWMO_MS, HITSTOP_MS } from './juice'

function fakeFx(motionEnabled: boolean): {
  camera: Camera
  particles: Particles
  motionEnabled: boolean
} {
  const camera: Camera = { shake: vi.fn(), update: vi.fn(() => ({ x: 0, y: 0 })) }
  const particles: Particles = { emitBurst: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  return { camera, particles, motionEnabled }
}

describe('applyJuice — portée du mouvement réduit', () => {
  it('coupe la secousse et les particules sur un kill, mais laisse le hitstop se déclencher', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const state = createJuiceState()
    const fx = fakeFx(false)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })

    applyJuice(world, state, fx)

    expect(state.hitstopRemaining).toBe(HITSTOP_MS)
    expect(fx.camera.shake).not.toHaveBeenCalled()
    expect(fx.particles.emitBurst).not.toHaveBeenCalled()
  })

  it('coupe la secousse et les particules sur une mort, mais laisse le ralenti se déclencher', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const state = createJuiceState()
    const fx = fakeFx(false)
    world.events.push({ type: 'playerDied', x: 10, y: 20 })

    applyJuice(world, state, fx)

    expect(state.deathSlowmoRemaining).toBe(DEATH_SLOWMO_MS)
    expect(fx.camera.shake).not.toHaveBeenCalled()
    expect(fx.particles.emitBurst).not.toHaveBeenCalled()
  })

  it('déclenche bien la secousse et les particules quand le mouvement est activé', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const state = createJuiceState()
    const fx = fakeFx(true)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })

    applyJuice(world, state, fx)

    expect(fx.camera.shake).toHaveBeenCalled()
    expect(fx.particles.emitBurst).toHaveBeenCalled()
  })
})
