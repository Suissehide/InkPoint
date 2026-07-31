import { addComponent, defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Enemy, Invulnerable, Materializing, Position } from '../components'
import { MAX_ENEMIES, WAVE_DURATION_MS } from '../data/difficulty'
import { AMBUSH_MIN_DISTANCE, MATERIALIZE_AMBUSH_MS } from '../data/enemies'
import { spawnPlayer } from '../spawn'
import { createWorld, FIXED_DT } from '../world'
import { waveSystem } from './waves'

const enemies = defineQuery([Enemy])

const setup = () => {
  const w = createWorld({ seed: 12, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

const setupAt = (px: number, py: number, width = 800, height = 600, seed = 12) => {
  const w = createWorld({ seed, width, height })
  spawnPlayer(w)
  Position.x[w.playerEid] = px
  Position.y[w.playerEid] = py
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

  it("n'écourte pas une grâce déjà plus longue", () => {
    const w = setup()
    // 1000 ms : ce que `collision.ts` accorde à la rupture du Halo, c'est-à-dire
    // précisément quand le joueur est encerclé. Un passage de vague juste après
    // ne doit pas ramener cette protection à 500 ms et le relâcher dans la
    // formation qui vient d'apparaître.
    addComponent(w, Invulnerable, w.playerEid)
    Invulnerable.remaining[w.playerEid] = 1000

    runFor(w, WAVE_DURATION_MS + FIXED_DT * 2)

    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(1000, 0)
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

  it("les embuscades restent dans l'arène même près d'un coin", () => {
    // Joueur près d'un coin (pas au centre comme les autres tests) : le cas
    // dégénéré est rare, on cumule plusieurs graines pour obtenir un
    // échantillon d'embuscades assez grand pour trancher.
    let ambushCount = 0
    for (let seed = 1; seed <= 60; seed++) {
      const w = setupAt(30, 30, 800, 600, seed)
      w.wave = 8
      runFor(w, 60_000)
      const px = Position.x[w.playerEid]!
      const py = Position.y[w.playerEid]!
      for (const eid of enemies(w)) {
        if (
          hasComponent(w, Materializing, eid) &&
          Materializing.total[eid] === MATERIALIZE_AMBUSH_MS
        ) {
          ambushCount += 1
          const x = Position.x[eid]!
          const y = Position.y[eid]!
          expect(x).toBeGreaterThan(0)
          expect(x).toBeLessThan(w.arena.width)
          expect(y).toBeGreaterThan(0)
          expect(y).toBeLessThan(w.arena.height)
          expect(Math.hypot(x - px, y - py)).toBeGreaterThanOrEqual(AMBUSH_MIN_DISTANCE - 1)
        }
      }
    }
    // Sans cette assertion le test passerait aussi si aucune embuscade n'avait eu lieu.
    expect(ambushCount).toBeGreaterThan(0)
  })

  it("consomme un nombre de tirages PRNG indépendant de la taille de l'arène", () => {
    // Déterminisme (netcode v3) : deux mondes à la même graine mais des
    // arènes différentes ne doivent jamais diverger. Témoin indirect : la
    // séquence des *types* d'ennemis apparus, qui puise dans le même flux de
    // tirages, doit être identique quelle que soit la taille de l'arène.
    const a = createWorld({ seed: 12, width: 800, height: 600 })
    spawnPlayer(a)
    a.wave = 6

    const b = createWorld({ seed: 12, width: 300, height: 220 })
    spawnPlayer(b)
    b.wave = 6

    // 60 s pour laisser le temps à au moins une embuscade de se produire :
    // c'est uniquement pendant l'échantillonnage d'une embuscade que l'ancien
    // code pouvait consommer un nombre de tirages variable.
    runFor(a, 60_000)
    runFor(b, 60_000)

    const ambushCountOf = (w: ReturnType<typeof setup>) =>
      Array.from(enemies(w)).filter(
        (eid) =>
          hasComponent(w, Materializing, eid) && Materializing.total[eid] === MATERIALIZE_AMBUSH_MS,
      ).length

    // Sans cette assertion le test passerait aussi si aucune embuscade n'avait
    // jamais eu lieu dans l'un ou l'autre monde — la seule situation où la
    // divergence de tirages testée ici peut apparaître.
    expect(ambushCountOf(a)).toBeGreaterThan(0)

    const typesOf = (w: ReturnType<typeof setup>) =>
      w.events
        .filter((e) => e.type === 'enemySpawned')
        .map((e) => (e.type === 'enemySpawned' ? Enemy.type[e.eid] : undefined))

    const typesA = typesOf(a)
    const typesB = typesOf(b)
    expect(typesA.length).toBeGreaterThan(0)
    expect(typesA).toEqual(typesB)
  })
})
