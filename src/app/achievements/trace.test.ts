import { describe, expect, it } from 'vitest'

import { Position } from '@/sim/components'
import { spawnPlayer } from '@/sim/spawn'
import { ARENA, createWorld, type SimWorld } from '@/sim/world'
import { advanceTrace, BURST_WINDOW_MS, createTrace, type RunTrace } from './trace'

/** Un monde nu avec un joueur au centre, comme au début d'une partie. */
function world(): SimWorld {
  const w = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  spawnPlayer(w)
  return w
}

function trace(w: SimWorld): RunTrace {
  const eid = w.playerEid
  return createTrace(Position.x[eid] ?? 0, Position.y[eid] ?? 0)
}

/** Avance d'un pas en plaçant le joueur et en laissant l'ennemi au loin. */
function step(t: RunTrace, w: SimWorld, x: number, y: number, nearest = Number.POSITIVE_INFINITY) {
  Position.x[w.playerEid] = x
  Position.y[w.playerEid] = y
  advanceTrace(t, w, nearest)
  w.events.length = 0
}

describe('advanceTrace', () => {
  it('compte les kills et horodate chacun', () => {
    const w = world()
    const t = trace(w)
    w.time = 1000
    w.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    w.events.push({ type: 'enemyKilled', eid: 2, x: 0, y: 0 })
    step(t, w, 100, 100)

    expect(t.kills).toBe(2)
    expect(t.killTimestamps).toEqual([1000, 1000])
  })

  // Sans élagage, le tableau grandirait avec la durée de la partie et
  // « 100 ennemis en 2 s » deviendrait « 100 ennemis en tout ».
  it('élague les kills sortis de la fenêtre de rafale', () => {
    const w = world()
    const t = trace(w)
    w.time = 1000
    w.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    step(t, w, 100, 100)

    w.time = 1000 + BURST_WINDOW_MS + 1
    w.events.push({ type: 'enemyKilled', eid: 2, x: 0, y: 0 })
    step(t, w, 100, 100)

    expect(t.kills).toBe(2)
    expect(t.killTimestamps).toEqual([1000 + BURST_WINDOW_MS + 1])
  })

  // `scoreSystem` remet `world.combo` à zéro dès que la fenêtre expire : un
  // prédicat qui lirait la valeur courante manquerait le pic.
  it('retient le pic de combo malgré la remise à zéro', () => {
    const w = world()
    const t = trace(w)
    w.combo = 37
    step(t, w, 100, 100)
    w.combo = 0
    step(t, w, 100, 100)

    expect(t.maxCombo).toBe(37)
  })

  it('mémorise les genres de power-up ramassés', () => {
    const w = world()
    const t = trace(w)
    // 1 = `blast` dans POWERUP_BY_ID (l'indice 0 n'est pas attribué).
    w.events.push({ type: 'powerupPicked', kind: 1 })
    step(t, w, 100, 100)

    expect(t.powerupsPicked.has('blast')).toBe(true)
    expect(t.powerupCount).toBe(1)
  })

  it('remet les accumulateurs de vague à zéro au début de la suivante', () => {
    const w = world()
    const t = trace(w)
    w.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    step(t, w, 100, 100)
    expect(t.waveKills).toBe(1)

    w.events.push({ type: 'waveEnded', wave: 1 })
    w.events.push({ type: 'waveStarted', wave: 2 })
    step(t, w, 100, 100)

    expect(t.waveKills).toBe(0)
  })

  it('retient une vague traversée sans un seul kill', () => {
    const w = world()
    const t = trace(w)
    step(t, w, 100, 100)
    w.events.push({ type: 'waveEnded', wave: 1 })
    step(t, w, 100, 100)

    expect(t.hadPacifistWave).toBe(true)
  })

  it('salit la vague dès qu’un ennemi approche', () => {
    const w = world()
    const t = trace(w)
    step(t, w, 100, 100, 59)
    w.events.push({ type: 'waveEnded', wave: 1 })
    step(t, w, 100, 100)

    expect(t.cleanWaveStreak).toBe(0)
  })

  it('enchaîne les vagues propres', () => {
    const w = world()
    const t = trace(w)
    for (const wave of [1, 2]) {
      step(t, w, 100, 100, 400)
      w.events.push({ type: 'waveEnded', wave })
      w.events.push({ type: 'waveStarted', wave: wave + 1 })
      step(t, w, 100, 100, 400)
    }

    expect(t.cleanWaveStreak).toBe(2)
  })

  // L'ancre suit le joueur dès qu'il en sort : « rester immobile » se compte
  // par rapport à l'endroit où l'on s'est posé, pas au point de départ.
  it('accumule l’immobilité et replace l’ancre à la sortie', () => {
    const w = world()
    const t = trace(w)
    w.time = 0
    step(t, w, 100, 100)
    w.time = 500
    step(t, w, 110, 100)
    expect(t.stillMs).toBe(500)

    w.time = 1000
    step(t, w, 400, 400)
    expect(t.stillMs).toBe(0)
    expect(t.stillX).toBe(400)
  })

  it('horodate le contact avec chaque bord', () => {
    const w = world()
    const t = trace(w)
    w.time = 300
    step(t, w, 5, 360)

    expect(t.edgeTouchedAt[0]).toBe(300)
    expect(t.edgeTouchedAt[1]).toBe(Number.NEGATIVE_INFINITY)
  })

  // La boîte part du point d'apparition (le centre) : c'est là que le joueur
  // se tient au premier pas, et la vague 1 n'a pas de `waveStarted` pour la
  // recaler.
  it('suit la boîte englobante de la vague', () => {
    const w = world()
    const t = trace(w)
    step(t, w, 100, 100)
    step(t, w, 300, 500)

    expect(t.waveMinX).toBe(100)
    expect(t.waveMaxX).toBe(640)
    expect(t.waveMinY).toBe(100)
    expect(t.waveMaxY).toBe(500)
  })

  it('note la mort et la dernière position', () => {
    const w = world()
    const t = trace(w)
    w.events.push({ type: 'playerDied', x: 640, y: 360 })
    step(t, w, 640, 360)

    expect(t.died).toBe(true)
    expect(t.x).toBe(640)
  })
})
