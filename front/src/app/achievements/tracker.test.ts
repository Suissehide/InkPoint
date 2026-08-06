import { spawnPlayer } from '@sim/spawn'
import { ARENA, createWorld, type SimWorld } from '@sim/world'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeLocalStorage } from '@/app/fake-local-storage'
import { createTracker } from './tracker'

function world(): SimWorld {
  const w = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  spawnPlayer(w)
  return w
}

describe('tracker', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ouvre un succès une seule fois', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)

    w.wave = 5
    const premier = tracker.step(w).map((a) => a.id)
    const second = tracker.step(w).map((a) => a.id)

    expect(premier).toContain('wave-5')
    expect(second).not.toContain('wave-5')
  })

  it('persiste immédiatement ce qu’il ouvre', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)
    w.wave = 5
    tracker.step(w)

    expect(localStorage.getItem('inkpoint.achievements')).toContain('wave-5')
  })

  it('rend plusieurs succès ouverts au même pas', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)
    w.wave = 10

    const ids = tracker.step(w).map((a) => a.id)
    expect(ids).toContain('wave-5')
    expect(ids).toContain('wave-10')
  })

  // `playerDied` arrive dans les événements du pas courant : les succès de
  // mort s'ouvrent là, pas dans une passe finale séparée.
  it('ouvre les succès de mort dans le pas qui porte playerDied', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)
    w.events.push({ type: 'playerDied', x: 640, y: 360 })

    const ids = tracker.step(w).map((a) => a.id)
    expect(ids).toContain('blank-page')
    expect(ids).toContain('back-to-inkwell')
  })

  it('expose la trace en cours pour le tirage des cartes', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)
    w.events.push({ type: 'powerupPicked', kind: 1 })
    tracker.step(w)

    expect(tracker.trace.powerupsPicked.has('blast')).toBe(true)
  })

  it('ne réévalue pas un succès acquis dans une partie précédente', () => {
    const w = world()
    const premier = createTracker()
    premier.reset(640, 360)
    w.wave = 5
    premier.step(w)

    const suivant = createTracker()
    suivant.reset(640, 360)
    expect(suivant.step(w).map((a) => a.id)).not.toContain('wave-5')
  })
})
