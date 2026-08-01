import { describe, expect, it, vi } from 'vitest'

import { POWERUP_ID, POWERUP_KINDS } from '@/sim/data/powerups'
import { createWorld } from '@/sim/world'
import { applyAudio } from './apply'
import { VOICE_CAP_PER_FRAME } from './curves'

function fakeEngine() {
  return { play: vi.fn() }
}

describe('applyAudio', () => {
  it('déclenche un son pour chaque genre de power-up', () => {
    // Boucle sur POWERUP_KINDS, jamais sur une liste recopiée : l'ajout d'un
    // septième power-up doit faire échouer ce test s'il reste muet.
    for (const kind of POWERUP_KINDS) {
      const world = createWorld({ seed: 1, width: 800, height: 600 })
      world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x: 10, y: 10 })
      const engine = fakeEngine()
      applyAudio(world, engine)
      expect(engine.play, `aucun son pour ${kind}`).toHaveBeenCalled()
    }
  })

  it('monte la hauteur du kill avec le combo', () => {
    const bas = createWorld({ seed: 1, width: 800, height: 600 })
    bas.combo = 0
    bas.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    const e1 = fakeEngine()
    applyAudio(bas, e1)

    const haut = createWorld({ seed: 1, width: 800, height: 600 })
    haut.combo = 40
    haut.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    const e2 = fakeEngine()
    applyAudio(haut, e2)

    expect(e2.play.mock.calls[0]?.[0].freq).toBeGreaterThan(e1.play.mock.calls[0]?.[0].freq)
  })

  it('plafonne les voix d’une salve de kills', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    for (let i = 0; i < 30; i++) {
      world.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
    }
    const engine = fakeEngine()
    applyAudio(world, engine)
    // Exactement le plafond, pas « au plus 8 » : une borne lâche laisserait
    // passer un plafonnement à moitié cassé.
    expect(engine.play.mock.calls.length).toBe(VOICE_CAP_PER_FRAME)
  })
})
