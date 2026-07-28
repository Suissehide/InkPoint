import { hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Materializing, Position, Velocity } from '../components'
import { MATERIALIZE_EDGE_MS } from '../data/enemies'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createWorld, FIXED_DT } from '../world'
import { homingSystem } from './homing'
import { integrationSystem } from './integration'
import { materializationSystem } from './materialization'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

const step = (w: ReturnType<typeof setup>) => {
  materializationSystem(w)
  homingSystem(w)
  integrationSystem(w)
  w.time += FIXED_DT
}

describe('materializationSystem', () => {
  it("garde l'ennemi immobile pendant l'apparition", () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 100, materializeMs: MATERIALIZE_EDGE_MS })
    for (let i = 0; i < 10; i++) {
      step(w)
    }
    expect(Position.x[eid]).toBe(100)
    expect(Position.y[eid]).toBe(100)
  })

  it('retire le composant Materializing à échéance et émet un événement', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 100, materializeMs: 100 })
    for (let i = 0; i < Math.ceil(100 / FIXED_DT) + 1; i++) {
      step(w)
    }
    expect(hasComponent(w, Materializing, eid)).toBe(false)
    expect(w.events.some((e) => e.type === 'enemyMaterialized' && e.eid === eid)).toBe(true)
  })
})

describe('homingSystem', () => {
  it("déplace l'ennemi vers le joueur une fois actif", () => {
    const w = setup()
    Position.x[w.playerEid] = 700
    Position.y[w.playerEid] = 300
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 300, materializeMs: 0 })
    const before = Position.x[eid]!
    for (let i = 0; i < 60; i++) {
      step(w)
    }
    expect(Position.x[eid]!).toBeGreaterThan(before)
  })

  it("vise la position passée du joueur, pas l'actuelle", () => {
    const w = setup()
    // Joueur immobile à droite pendant 1 s, l'historique se remplit.
    Position.x[w.playerEid] = 700
    Position.y[w.playerEid] = 300
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    for (let i = 0; i < 60; i++) {
      step(w)
    }

    // Téléportation brutale vers le haut : pendant le délai, l'ennemi continue
    // de viser l'ancienne position, donc sa vitesse verticale reste faible.
    Position.y[w.playerEid] = 50
    step(w)
    expect(Math.abs(Velocity.y[eid]!)).toBeLessThan(20)
  })

  it('ne dépasse pas la vitesse max assignée', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 100, materializeMs: 0 })
    for (let i = 0; i < 600; i++) {
      step(w)
    }
    expect(Math.hypot(Velocity.x[eid]!, Velocity.y[eid]!)).toBeLessThanOrEqual(145.5)
  })
})
