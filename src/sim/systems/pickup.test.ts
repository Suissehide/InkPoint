import { defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Collider, Doomed, Halo, Hazard, Lifetime, Pickup, Position } from '../components'
import { PICKUP_LIFE_MS, PICKUP_RADIUS, POWERUP_ID } from '../data/powerups'
import { spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { createWorld } from '../world'
import { collisionSystem } from './collision'
import { hazardSystem } from './hazards'
import { pickupSystem, spawnPickup } from './pickup'

const pickups = defineQuery([Pickup])
const hazards = defineQuery([Hazard])

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
  it('ramasse une pastille au contact : active le power-up sur place et détruit la pastille au sol', () => {
    const w = setup()
    const stats = createRunStats()
    const eid = spawnPickup(w)
    Position.x[eid] = 400
    Position.y[eid] = 300
    Pickup.kind[eid] = POWERUP_ID.halo
    pickupSystem(w, stats)
    expect(hasComponent(w, Doomed, eid)).toBe(true)
    // Le Halo s'attache au joueur immédiatement — sans inventaire, aucune
    // touche à presser entre le ramassage et l'effet.
    expect(hasComponent(w, Halo, w.playerEid)).toBe(true)
  })

  it("active la zone d'un power-up à la position de la pastille, pas celle du joueur", () => {
    // Le joueur est au centre du cercle de contact, la pastille peut être
    // n'importe où dans ce cercle : preuve que c'est bien la position de la
    // pastille (et non celle, arrondie, du joueur) qui sert d'origine.
    const w = setup()
    const stats = createRunStats()
    const eid = spawnPickup(w)
    Position.x[eid] = 405
    Position.y[eid] = 298
    Pickup.kind[eid] = POWERUP_ID.blast
    pickupSystem(w, stats)
    const [hid] = hazards(w)
    expect(Position.x[hid!]).toBe(405)
    expect(Position.y[hid!]).toBe(298)
  })

  it('émet powerupPicked au contact, pour le suivi des power-ups déjà rencontrés', () => {
    const w = setup()
    const stats = createRunStats()
    const eid = spawnPickup(w)
    Position.x[eid] = 400
    Position.y[eid] = 300
    Pickup.kind[eid] = POWERUP_ID.dash
    pickupSystem(w, stats)
    expect(w.events.some((e) => e.type === 'powerupPicked' && e.kind === POWERUP_ID.dash)).toBe(
      true,
    )
  })

  it('ignore une pastille hors de portée — elle reste au sol, intacte', () => {
    const w = setup()
    const stats = createRunStats()
    const eid = spawnPickup(w)
    Position.x[eid] = 780
    Position.y[eid] = 580
    pickupSystem(w, stats)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
    expect(hazards(w)).toHaveLength(0)
  })

  it("fait apparaître une nouvelle pastille automatiquement après l'intervalle configuré", () => {
    const w = setup()
    const stats = createRunStats()
    expect(pickups(w).length).toBe(0)
    // Avancer au-delà de PICKUP_SPAWN_INTERVAL_MS en pas fixes.
    const steps = Math.ceil(7000 / 16) + 1
    for (let i = 0; i < steps; i++) {
      pickupSystem(w, stats)
    }
    expect(pickups(w).length).toBeGreaterThanOrEqual(1)
  })

  it('ne ramasse rien une fois le joueur mort', () => {
    const w = setup()
    const stats = createRunStats()
    const eid = spawnPickup(w)
    Position.x[eid] = 400
    Position.y[eid] = 300
    w.alive = false
    pickupSystem(w, stats)
    // Preuve que le système s'est bien arrêté au early-return, pas que la
    // pastille était simplement hors de portée : elle est pile sur le joueur.
    expect(hasComponent(w, Doomed, eid)).toBe(false)
    expect(hazards(w)).toHaveLength(0)
  })

  /**
   * Le joueur se tient exactement sur la pastille au moment du ramassage : un
   * Bombe activé là s'agrandit donc pile sous ses pieds. Preuve d'intégration
   * dans l'ordre réel (hazardSystem puis collisionSystem, comme dans
   * stepWorld) que ça ne le tue jamais — trois bugs distincts dans ce projet
   * ont déjà fait qu'un power-up tue son propre utilisateur.
   */
  it('ramasser un Bombe pile sur soi ne tue jamais le joueur', () => {
    const w = setup()
    const stats = createRunStats()
    const eid = spawnPickup(w)
    Position.x[eid] = 400
    Position.y[eid] = 300
    Pickup.kind[eid] = POWERUP_ID.blast

    pickupSystem(w, stats)
    expect(w.alive).toBe(true)

    for (let i = 0; i < 200 && w.alive; i++) {
      hazardSystem(w)
      collisionSystem(w)
    }
    expect(w.alive).toBe(true)
  })
})
