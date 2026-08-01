import { defineQuery, hasComponent, removeEntity } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Collider, Doomed, Halo, Hazard, Lifetime, Pickup, Position } from '../components'
import {
  PICKUP_LIFE_MS,
  PICKUP_RADIUS,
  POWERUP_BY_ID,
  POWERUP_ID,
  POWERUP_KINDS,
  POWERUP_WEIGHT,
  type PowerUpKind,
} from '../data/powerups'
import { spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { ARENA, createWorld } from '../world'
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
    // Déterminisme : un rejet géométrique ferait dépendre le nombre de
    // tirages de la position, désynchronisant deux runs par ailleurs
    // identiques. On enveloppe world.rng pour compter les appels réels.
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

  it('hiérarchise les poids : quatre courants, puis le Halo, puis la Ronce', () => {
    const courants: PowerUpKind[] = ['blast', 'freeze', 'blotter', 'dash']
    for (const kind of courants) {
      expect(POWERUP_WEIGHT[kind]).toBeGreaterThan(POWERUP_WEIGHT.halo)
    }
    // La Ronce passe sous le Halo : c'est le power-up le plus rare du jeu.
    expect(POWERUP_WEIGHT.halo).toBeGreaterThan(POWERUP_WEIGHT.bramble)
    // Aucun poids nul : un genre à 0 ne sortirait jamais et rendrait
    // inatteignables les cartes qui en dépendent.
    for (const kind of POWERUP_KINDS) {
      expect(POWERUP_WEIGHT[kind]).toBeGreaterThan(0)
    }
  })

  it('tire les genres à leur poids, et pas uniformément', () => {
    const w = createWorld({ seed: 7, width: ARENA.width, height: ARENA.height })
    spawnPlayer(w)
    const counts = new Map<PowerUpKind, number>()
    const draws = 4000
    for (let i = 0; i < draws; i++) {
      const eid = spawnPickup(w)
      const kind = POWERUP_BY_ID[Pickup.kind[eid]!]
      if (!kind) {
        throw new Error('genre de pastille inconnu')
      }
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
      removeEntity(w, eid)
    }

    const total = [...POWERUP_KINDS].reduce((s, k) => s + POWERUP_WEIGHT[k], 0)
    for (const kind of POWERUP_KINDS) {
      const expected = POWERUP_WEIGHT[kind] / total
      const actual = (counts.get(kind) ?? 0) / draws
      // Marge large : ce test porte sur la forme de la distribution, pas sur
      // la qualité statistique du générateur. Il doit échouer si les poids ne
      // sont pas appliqués du tout (le Halo remonterait à ~1/6), pas frémir
      // sur du bruit d'échantillonnage.
      expect(Math.abs(actual - expected)).toBeLessThan(0.04)
    }
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
   * Le joueur se tient exactement sur la pastille au ramassage : une Bombe
   * activée là s'agrandit pile sous ses pieds. Preuve d'intégration dans
   * l'ordre réel (hazardSystem puis collisionSystem) que ça ne le tue jamais.
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
