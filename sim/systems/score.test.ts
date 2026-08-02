import { describe, expect, it } from 'vitest'

import { spawnPlayer } from '../spawn'
import { createWorld, FIXED_DT } from '../world'
import { scoreSystem } from './score'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

const run = (w: ReturnType<typeof setup>, ms: number) => {
  for (let i = 0; i < Math.ceil(ms / FIXED_DT); i++) {
    scoreSystem(w)
    w.events.length = 0
    w.time += FIXED_DT
  }
}

describe('scoreSystem', () => {
  it('donne 5 points par seconde de survie', () => {
    const w = setup()
    run(w, 1000)
    expect(w.score).toBeCloseTo(5, 0)
  })

  it('donne 40 points par kill au combo ×1', () => {
    const w = setup()
    w.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    scoreSystem(w)
    expect(w.score).toBeCloseTo(40, 0)
  })

  it('incrémente le combo à chaque kill', () => {
    const w = setup()
    for (let i = 0; i < 3; i++) {
      w.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
      scoreSystem(w)
      w.events.length = 0
    }
    expect(w.combo).toBe(3)
  })

  it('le multiplicateur passe à ×2 après 4 kills', () => {
    const w = setup()
    for (let i = 0; i < 4; i++) {
      w.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
      scoreSystem(w)
      w.events.length = 0
    }
    const before = w.score
    w.events.push({ type: 'enemyKilled', eid: 99, x: 0, y: 0 })
    scoreSystem(w)
    expect(w.score - before).toBeCloseTo(80, 0)
  })

  it('plafonne le multiplicateur à ×10', () => {
    const w = setup()
    for (let i = 0; i < 200; i++) {
      w.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
      scoreSystem(w)
      w.events.length = 0
    }
    const before = w.score
    w.events.push({ type: 'enemyKilled', eid: 999, x: 0, y: 0 })
    scoreSystem(w)
    expect(w.score - before).toBeCloseTo(400, 0)
  })

  it('remet le combo à zéro après 2,5 s sans kill', () => {
    const w = setup()
    w.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    scoreSystem(w)
    w.events.length = 0
    run(w, 2600)
    expect(w.combo).toBe(0)
  })

  it('ne compte plus le temps après la mort', () => {
    const w = setup()
    w.alive = false
    run(w, 2000)
    expect(w.score).toBe(0)
  })
})
