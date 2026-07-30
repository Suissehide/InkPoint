import { describe, expect, it, vi } from 'vitest'

import type { Camera } from '@/render/camera'
import type { Flash } from '@/render/fx/flash'
import type { Shockwaves } from '@/render/fx/shockwave'
import type { Particles } from '@/render/particles'
import { createWorld } from '@/sim/world'
import {
  applyJuice,
  COMBO_FLASH_MIN_MULTIPLIER,
  comboIntensity,
  createJuiceState,
  DEATH_SLOWMO_MS,
  HITSTOP_MS,
} from './juice'

function fakeFx(motionEnabled: boolean): {
  camera: Camera
  particles: Particles
  flash: Flash
  shockwaves: Shockwaves
  punch: (strength: number) => void
  motionEnabled: boolean
} {
  const camera: Camera = { shake: vi.fn(), update: vi.fn(() => ({ x: 0, y: 0 })) }
  const particles: Particles = { emitBurst: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const flash: Flash = { flash: vi.fn(), resize: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const shockwaves: Shockwaves = { emit: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  return { camera, particles, flash, shockwaves, punch: vi.fn(), motionEnabled }
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

describe('comboIntensity', () => {
  it('vaut 0 au multiplicateur ×1', () => {
    expect(comboIntensity(1)).toBe(0)
  })

  it('vaut 1 au multiplicateur maximal ×10', () => {
    expect(comboIntensity(10)).toBe(1)
  })

  it('croît avec le multiplicateur', () => {
    expect(comboIntensity(5)).toBeGreaterThan(comboIntensity(2))
  })

  it('borne les valeurs hors plage', () => {
    expect(comboIntensity(0)).toBe(0)
    expect(comboIntensity(50)).toBe(1)
  })
})

describe('applyJuice — le combo module le ressenti', () => {
  const killWith = (combo: number) => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.combo = combo
    const state = createJuiceState()
    const fx = fakeFx(true)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })
    applyJuice(world, state, fx)
    return fx
  }

  it('émet plus de particules à haut combo qu’à bas combo', () => {
    // `world.combo` est déjà à jour quand `applyJuice` tourne : `scoreSystem`
    // passe en dernier dans `stepWorld`, avant l'appel depuis `game.ts`.
    const low = killWith(0)
    const high = killWith(40)
    const countOf = (fx: ReturnType<typeof fakeFx>): number => {
      const call = vi.mocked(fx.particles.emitBurst).mock.calls[0]
      if (!call) {
        throw new Error('aucune émission de particules')
      }
      return call[2].count
    }
    expect(countOf(high)).toBeGreaterThan(countOf(low))
  })

  it('ne déclenche flash ni anneau sous le seuil de combo', () => {
    const fx = killWith(0)
    expect(fx.flash.flash).not.toHaveBeenCalled()
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
  })

  it('déclenche flash et anneau à partir du seuil de combo', () => {
    // 4 kills par palier : combo 8 → multiplicateur ×3.
    const fx = killWith(4 * (COMBO_FLASH_MIN_MULTIPLIER - 1))
    expect(fx.flash.flash).toHaveBeenCalled()
    expect(fx.shockwaves.emit).toHaveBeenCalled()
  })

  it('secoue le HUD sur un kill, sauf en mouvement réduit', () => {
    expect(killWith(0).punch).toHaveBeenCalled()

    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const fx = fakeFx(false)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })
    applyJuice(world, createJuiceState(), fx)
    expect(fx.punch).not.toHaveBeenCalled()
  })
})
