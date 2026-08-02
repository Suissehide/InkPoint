import { describe, expect, it, vi } from 'vitest'

import { POWERUP_ID, POWERUP_KINDS } from '@/sim/data/powerups'
import { createWorld } from '@/sim/world'
import { applyAudio, createVoiceBudget, resetVoiceBudget } from './apply'
import { VOICE_CAP_PER_FRAME } from './curves'

function fakeEngine() {
  return { play: vi.fn() }
}

/** Un pas isolé : le cas courant, une image qui n'en contient qu'un. */
function applyOneStep(
  world: Parameters<typeof applyAudio>[0],
  engine: ReturnType<typeof fakeEngine>,
) {
  applyAudio(world, engine, createVoiceBudget())
}

describe('applyAudio', () => {
  it('déclenche un son pour chaque genre de power-up', () => {
    // Boucle sur POWERUP_KINDS, jamais sur une liste recopiée : l'ajout d'un
    // huitième power-up doit faire échouer ce test s'il reste muet.
    for (const kind of POWERUP_KINDS) {
      const world = createWorld({ seed: 1, width: 800, height: 600 })
      world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x: 10, y: 10 })
      const engine = fakeEngine()
      applyOneStep(world, engine)
      expect(engine.play, `aucun son pour ${kind}`).toHaveBeenCalled()
    }
  })

  it('monte la hauteur du kill avec le combo', () => {
    const bas = createWorld({ seed: 1, width: 800, height: 600 })
    bas.combo = 0
    bas.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    const e1 = fakeEngine()
    applyOneStep(bas, e1)

    const haut = createWorld({ seed: 1, width: 800, height: 600 })
    haut.combo = 40
    haut.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    const e2 = fakeEngine()
    applyOneStep(haut, e2)

    expect(e2.play.mock.calls[0]?.[0].freq).toBeGreaterThan(e1.play.mock.calls[0]?.[0].freq)
  })

  it('plafonne les voix d’une salve de kills', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    for (let i = 0; i < 30; i++) {
      world.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
    }
    const engine = fakeEngine()
    applyOneStep(world, engine)
    // Exactement le plafond, pas « au plus 8 » : une borne lâche laisserait
    // passer un plafonnement à moitié cassé.
    expect(engine.play.mock.calls.length).toBe(VOICE_CAP_PER_FRAME)
  })

  it('plafonne à l’image entière, pas à chaque pas de simulation', () => {
    // Une image en contient jusqu'à quinze (MAX_CATCHUP_MS / FIXED_DT, voir
    // app/loop.ts) au retour d'un onglet ou après un pic de latence, et
    // `ctx.currentTime` n'avance pas entre eux : un plafond par pas, c'étaient
    // quinze plafonds, donc soixante voix programmées au même instant.
    const engine = fakeEngine()
    const budget = createVoiceBudget()
    for (let step = 0; step < 15; step++) {
      const world = createWorld({ seed: 1, width: 800, height: 600 })
      for (let i = 0; i < 30; i++) {
        world.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
      }
      applyAudio(world, engine, budget)
    }
    expect(engine.play.mock.calls.length).toBe(VOICE_CAP_PER_FRAME)
  })

  it('rouvre le plafond à l’image suivante', () => {
    const engine = fakeEngine()
    const budget = createVoiceBudget()
    const salve = () => {
      const world = createWorld({ seed: 1, width: 800, height: 600 })
      for (let i = 0; i < 30; i++) {
        world.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
      }
      applyAudio(world, engine, budget)
    }
    salve()
    resetVoiceBudget(budget)
    salve()
    expect(engine.play.mock.calls.length).toBe(VOICE_CAP_PER_FRAME * 2)
  })

  it('fait entendre une salve comme une rafale, pas comme un seul impact', () => {
    // Sans cela les `n` voix d'un même pas étaient rigoureusement identiques —
    // même hauteur, même instant de départ : un seul son, n fois plus fort.
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    for (let i = 0; i < 10; i++) {
      world.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
    }
    const engine = fakeEngine()
    applyOneStep(world, engine)

    const voices = engine.play.mock.calls.map((call) => call[0])
    expect(voices.length).toBe(VOICE_CAP_PER_FRAME)
    for (let i = 1; i < voices.length; i++) {
      expect(voices[i].delayMs, `voix ${i} : même instant de départ`).toBeGreaterThan(
        voices[i - 1].delayMs ?? 0,
      )
      expect(voices[i].freq, `voix ${i} : même hauteur`).toBeGreaterThan(voices[i - 1].freq)
      expect(voices[i].gain, `voix ${i} : même gain`).toBeLessThan(voices[i - 1].gain)
    }
  })
})
