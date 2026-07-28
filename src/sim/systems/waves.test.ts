import { defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Enemy, Invulnerable, Materializing, Position } from '../components'
import { MAX_ENEMIES, WAVE_DURATION_MS } from '../data/difficulty'
import { AMBUSH_MIN_DISTANCE } from '../data/enemies'
import { spawnPlayer } from '../spawn'
import { createWorld, FIXED_DT } from '../world'
import { waveSystem } from './waves'

const enemies = defineQuery([Enemy])

const setup = () => {
  const w = createWorld({ seed: 12, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

const runFor = (w: ReturnType<typeof setup>, ms: number) => {
  const steps = Math.ceil(ms / FIXED_DT)
  for (let i = 0; i < steps; i++) {
    waveSystem(w)
    w.time += FIXED_DT
  }
}

describe('waveSystem', () => {
  it('fait apparaître des ennemis au fil du temps', () => {
    const w = setup()
    runFor(w, 6000)
    expect(enemies(w).length).toBeGreaterThan(0)
  })

  it('émet waveEnded après 40 secondes et incrémente la vague', () => {
    const w = setup()
    runFor(w, WAVE_DURATION_MS + FIXED_DT * 2)
    expect(w.events.some((e) => e.type === 'waveEnded' && e.wave === 1)).toBe(true)
    expect(w.wave).toBe(2)
  })

  it("n'utilise que le type Point à la vague 1", () => {
    const w = setup()
    runFor(w, 20_000)
    expect(enemies(w).length).toBeGreaterThan(0)
    for (const eid of enemies(w)) {
      expect(Enemy.type[eid]).toBe(0)
    }
  })

  it("respecte le plafond d'ennemis simultanés", () => {
    const w = setup()
    runFor(w, 400_000)
    expect(enemies(w).length).toBeLessThanOrEqual(MAX_ENEMIES)
  })

  it('les embuscades respectent la distance minimale au joueur', () => {
    const w = setup()
    w.wave = 8
    runFor(w, 60_000)
    const px = Position.x[w.playerEid]!
    const py = Position.y[w.playerEid]!
    let ambushCount = 0
    for (const eid of enemies(w)) {
      // On ne teste que les ennemis encore en apparition, apparus via une embuscade :
      // les autres ont bougé, ou proviennent d'une apparition en bord d'écran.
      if (hasComponent(w, Materializing, eid) && Materializing.total[eid] === 1600) {
        ambushCount += 1
        expect(Math.hypot(Position.x[eid]! - px, Position.y[eid]! - py)).toBeGreaterThanOrEqual(
          AMBUSH_MIN_DISTANCE - 1,
        )
      }
    }
    // Sans cette assertion le test passerait aussi si aucune embuscade n'avait eu lieu.
    expect(ambushCount).toBeGreaterThan(0)
  })

  it("accorde 0,5 s d'invulnérabilité au début de chaque vague", () => {
    const w = setup()
    runFor(w, WAVE_DURATION_MS + FIXED_DT * 2)
    expect(hasComponent(w, Invulnerable, w.playerEid)).toBe(true)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(500, 0)
  })

  it('est déterministe : même graine, mêmes apparitions', () => {
    const a = setup()
    const b = setup()
    runFor(a, 30_000)
    runFor(b, 30_000)
    expect(enemies(a).length).toBe(enemies(b).length)
    const posA = Array.from(enemies(a)).map((e) => Position.x[e])
    const posB = Array.from(enemies(b)).map((e) => Position.x[e])
    expect(posA).toEqual(posB)
  })
})
