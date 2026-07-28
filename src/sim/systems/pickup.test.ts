import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Collider, Doomed, Lifetime, Pickup, Position } from '../components'
import { PICKUP_LIFE_MS, PICKUP_RADIUS } from '../data/powerups'
import { readInventory } from '../powerups/inventory'
import { spawnPlayer } from '../spawn'
import { createWorld } from '../world'
import { pickupSystem, spawnPickup } from './pickup'

const pickups = defineQuery([Pickup])

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  return w
}

describe('spawnPickup', () => {
  it("crée une pastille dans les bornes de l'arène, avec sursis et rayon fixes", () => {
    const w = setup()
    const eid = spawnPickup(w)
    expect(hasComponent(w, Pickup, eid)).toBe(true)
    expect(Collider.radius[eid]).toBe(PICKUP_RADIUS)
    expect(Lifetime.remaining[eid]).toBe(PICKUP_LIFE_MS)
    expect(Position.x[eid]!).toBeGreaterThanOrEqual(60)
    expect(Position.x[eid]!).toBeLessThanOrEqual(w.arena.width - 60)
    expect(Position.y[eid]!).toBeGreaterThanOrEqual(60)
    expect(Position.y[eid]!).toBeLessThanOrEqual(w.arena.height - 60)
  })

  it('consomme toujours exactement 3 tirages RNG, quelle que soit la géométrie', () => {
    // Déterminisme (Task 8 avait un vrai bug ici) : un rejet géométrique ferait
    // dépendre le nombre de tirages de la position, ce qui désynchroniserait
    // deux runs par ailleurs identiques. On enveloppe world.rng pour compter
    // les appels réellement effectués par spawnPickup.
    const countCalls = (world: ReturnType<typeof setup>) => {
      const original = world.rng
      let calls = 0
      world.rng = {
        next: () => {
          calls++
          return original.next()
        },
        int: (max) => {
          calls++
          return original.int(max)
        },
        range: (min, max) => {
          calls++
          return original.range(min, max)
        },
        pick: (items) => {
          calls++
          return original.pick(items)
        },
      }
      return () => calls
    }

    const w = setup()
    const getCalls = countCalls(w)
    spawnPickup(w)
    expect(getCalls()).toBe(3)

    // Rejouer dans une arène de forme très différente ne doit rien changer.
    const w2 = createWorld({ seed: 1, width: 2000, height: 50 })
    const getCalls2 = countCalls(w2)
    spawnPickup(w2)
    expect(getCalls2()).toBe(3)
  })
})

describe('pickupSystem', () => {
  it('ramasse une pastille au contact : ajoute le power-up et détruit la pastille au sol', () => {
    const w = setup()
    const eid = spawnPickup(w)
    Position.x[eid] = 400
    Position.y[eid] = 300
    pickupSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(true)
    expect(readInventory(w).some((k) => k !== null)).toBe(true)
  })

  it('ignore une pastille hors de portée — elle reste au sol, intacte', () => {
    const w = setup()
    const eid = spawnPickup(w)
    Position.x[eid] = 780
    Position.y[eid] = 580
    pickupSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
    expect(readInventory(w)).toEqual([null, null, null])
  })

  it('inventaire plein : la pastille reste au sol, et le contenu des emplacements ne change pas', () => {
    const w = setup()
    const first = spawnPickup(w)
    Position.x[first] = 400
    Position.y[first] = 300
    pickupSystem(w)
    const secondBefore = spawnPickup(w)
    Position.x[secondBefore] = 400
    Position.y[secondBefore] = 300
    pickupSystem(w)
    const thirdBefore = spawnPickup(w)
    Position.x[thirdBefore] = 400
    Position.y[thirdBefore] = 300
    pickupSystem(w)
    const before = readInventory(w)
    expect(before.every((k) => k !== null)).toBe(true)

    const overflow = spawnPickup(w)
    Position.x[overflow] = 400
    Position.y[overflow] = 300
    pickupSystem(w)

    expect(readInventory(w)).toEqual(before)
    expect(hasComponent(w, Doomed, overflow)).toBe(false)
    expect(entityExists(w, overflow)).toBe(true)
  })

  it("fait apparaître une nouvelle pastille automatiquement après l'intervalle configuré", () => {
    const w = setup()
    expect(pickups(w).length).toBe(0)
    // Avancer au-delà de PICKUP_SPAWN_INTERVAL_MS en pas fixes.
    const steps = Math.ceil(7000 / 16) + 1
    for (let i = 0; i < steps; i++) {
      pickupSystem(w)
    }
    expect(pickups(w).length).toBeGreaterThanOrEqual(1)
  })

  it('ne ramasse rien une fois le joueur mort', () => {
    const w = setup()
    const eid = spawnPickup(w)
    Position.x[eid] = 400
    Position.y[eid] = 300
    w.alive = false
    pickupSystem(w)
    // Preuve que le système s'est bien arrêté au early-return, pas que la
    // pastille était simplement hors de portée : elle est pile sur le joueur.
    expect(hasComponent(w, Doomed, eid)).toBe(false)
    expect(readInventory(w)).toEqual([null, null, null])
  })
})
