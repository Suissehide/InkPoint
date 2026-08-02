import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import {
  Collider,
  Dashing,
  Enemy,
  Facing,
  Frozen,
  Invulnerable,
  Movement,
  Pickup,
  Player,
  Position,
} from './components'
import { ENEMIES } from './data/enemies'
import { POWERUP_BASE, POWERUP_ID } from './data/powerups'
import { UPGRADES } from './data/upgrades'
import { PLAYER_SPEED, spawnEnemy, spawnPlayer } from './spawn'
import { stepWorld } from './step'
import { spawnPickup } from './systems/pickup'
import { launchSplatter } from './systems/ricochet'
import { createRunStats } from './upgrades/stats'
import { ARENA, createWorld, FIXED_DT } from './world'

const enemiesQuery = defineQuery([Enemy, Position, Collider])
const frozenQuery = defineQuery([Frozen, Position])
const pickupsQuery = defineQuery([Pickup, Position])
const playersQuery = defineQuery([Player, Position])

/**
 * Bot scripté : fuit les ennemis proches, sinon va vers le power-up le plus
 * proche. Déterministe car il ne lit que l'état du monde (RNG à graine
 * fixe), jamais une horloge ni un aléa externe.
 */
function scriptedInput(world: ReturnType<typeof createWorld>, step: number): void {
  const player = playersQuery(world)[0]
  let moveX = 0
  let moveY = 0

  if (player !== undefined) {
    const px = Position.x[player]!
    const py = Position.y[player]!

    let threatX = 0
    let threatY = 0
    let threatCount = 0
    for (const eid of enemiesQuery(world)) {
      const dx = px - Position.x[eid]!
      const dy = py - Position.y[eid]!
      const dist = Math.hypot(dx, dy)
      if (dist < 150) {
        const weight = (150 - dist) / 150
        threatX += (dx / (dist || 1)) * weight
        threatY += (dy / (dist || 1)) * weight
        threatCount += 1
      }
    }

    if (threatCount > 0) {
      const len = Math.hypot(threatX, threatY) || 1
      moveX = threatX / len
      moveY = threatY / len
    } else {
      let nearest = -1
      let nearestDistSq = Number.POSITIVE_INFINITY
      for (const eid of pickupsQuery(world)) {
        const dx = Position.x[eid]! - px
        const dy = Position.y[eid]! - py
        const distSq = dx * dx + dy * dy
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq
          nearest = eid
        }
      }
      if (nearest >= 0) {
        const dx = Position.x[nearest]! - px
        const dy = Position.y[nearest]! - py
        const len = Math.hypot(dx, dy) || 1
        moveX = dx / len
        moveY = dy / len
      } else {
        const dir = Math.floor(step / 45) % 8
        const angle = (dir / 8) * Math.PI * 2
        moveX = Math.cos(angle)
        moveY = Math.sin(angle)
      }
    }
  }

  world.input.moveX = moveX
  world.input.moveY = moveY
  // Les power-ups s'activent au ramassage : aucune touche à simuler ici.
}

describe('vitesse du joueur pilotée par ses statistiques', () => {
  it('reporte moveSpeed sur le composant à chaque pas', () => {
    const world = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
    const player = spawnPlayer(world)
    const stats = createRunStats()

    // Applique la carte elle-même, pas une constante recopiée à la main :
    // sans ça, un futur changement du taux de « Pas léger » resterait vert
    // ici tout en cassant la carte, et rien d'autre dans le dépôt ne
    // verrouille le lien carte → stats (spec §2.3).
    const lightStep = UPGRADES.find((u) => u.id === 'light-step')
    if (!lightStep) {
      throw new Error("carte 'light-step' introuvable dans UPGRADES")
    }
    lightStep.apply(stats)
    stepWorld(world, stats)

    expect(Movement.maxSpeed[player]).toBeCloseTo(stats.moveSpeed, 4)
  })

  it('laisse la vitesse de base intacte sans amélioration', () => {
    const world = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
    const player = spawnPlayer(world)
    const stats = createRunStats()

    stepWorld(world, stats)

    expect(Movement.maxSpeed[player]).toBeCloseTo(PLAYER_SPEED, 4)
  })
})

describe('stepWorld — ordre fixe des systèmes', () => {
  it('gèle le pas qui suit un kill, et non celui qui le produit', () => {
    const world = createWorld({ seed: 7, width: ARENA.width, height: ARENA.height })
    spawnPlayer(world)
    const stats = createRunStats()

    // Un kill émis « au pas précédent ». `stepWorld` commence par vider
    // `world.events` : si `hitstopSystem` tournait après cette purge, il ne
    // verrait jamais cet événement et le temps ne se figerait pas.
    world.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    stepWorld(world, stats)

    expect(world.timeScale).toBe(0)
  })

  it('tient les invariants de composition sur une partie scriptée de plusieurs milliers de pas', () => {
    // 6000 pas (100 s) pour traverser au moins une transition de vague et
    // plusieurs apparitions de power-up ; en dessous, l'invariant
    // Invulnerable/Dashing n'est jamais mis à l'épreuve.
    const STEPS = 6000
    const world = createWorld({ seed: 7, width: 800, height: 600 })
    spawnPlayer(world)
    const stats = createRunStats()

    // Purgée à chaque pas des entités qui ne sont plus gelées/vivantes, pour
    // ne jamais comparer une position fraîche à celle d'une entité recyclée
    // par bitecs sous le même eid.
    const lastFrozenPosition = new Map<number, { x: number; y: number }>()

    let prevScore = world.score
    let prevAlive = world.alive

    for (let step = 0; step < STEPS; step++) {
      const player = world.playerEid
      const protectedEnteringFrame =
        player >= 0 &&
        entityExists(world, player) &&
        ((hasComponent(world, Invulnerable, player) &&
          Invulnerable.remaining[player]! > FIXED_DT) ||
          (hasComponent(world, Dashing, player) && Dashing.remaining[player]! > FIXED_DT))

      scriptedInput(world, step)
      stepWorld(world, stats)

      // 1. Le joueur ne meurt jamais s'il entrait dans le pas protégé par
      //    une grâce (Invulnerable) ou une ruée (Dashing) avec une marge
      //    confortable (spec §3.4).
      if (protectedEnteringFrame) {
        expect(world.alive).toBe(true)
      }

      // 2. Un ennemi gelé ne bouge jamais, tant qu'il reste gelé et vivant.
      for (const eid of frozenQuery(world)) {
        const current = { x: Position.x[eid]!, y: Position.y[eid]! }
        const previous = lastFrozenPosition.get(eid)
        if (previous) {
          expect(current.x).toBeCloseTo(previous.x, 5)
          expect(current.y).toBeCloseTo(previous.y, 5)
        }
        lastFrozenPosition.set(eid, current)
      }
      for (const eid of Array.from(lastFrozenPosition.keys())) {
        if (!entityExists(world, eid) || !hasComponent(world, Frozen, eid)) {
          lastFrozenPosition.delete(eid)
        }
      }

      // 3. Toute entité rendue par la requête courante doit porter des
      //    données saines (pas de NaN issu d'un slot recyclé).
      for (const eid of enemiesQuery(world)) {
        expect(entityExists(world, eid)).toBe(true)
        expect(Number.isFinite(Position.x[eid])).toBe(true)
        expect(Number.isFinite(Position.y[eid])).toBe(true)
        expect(Collider.radius[eid]!).toBeGreaterThan(0)
      }

      // 4. Le score ne progresse que tant que le joueur est vivant.
      expect(world.score).toBeGreaterThanOrEqual(prevScore - 1e-9)
      if (!prevAlive) {
        expect(world.score).toBeCloseTo(prevScore, 6)
      }
      prevScore = world.score
      prevAlive = world.alive
    }
    // MAX_ENEMIES n'est pas vérifié ici : cette course n'approche jamais le
    // plafond, une assertion serait décorative. Il est réellement exercé par
    // `waves.test.ts` > "respecte le plafond d'ennemis simultanés".
  })

  // Le power-up est une pastille au sol posée sous le joueur : il s'active
  // seul au premier pas de stepWorld, sans entrée à simuler.
  const setupPointBlankBlast = () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const player = spawnPlayer(world)
    // Assez loin pour ne pas toucher le joueur (rayon 9 + 7 = 16 < 40), mais
    // assez proche pour que le blast l'atteigne en quelques pas.
    spawnEnemy(world, { type: 'point', x: 440, y: 300, materializeMs: 0 })
    const pickup = spawnPickup(world)
    Position.x[pickup] = Position.x[player]!
    Position.y[pickup] = Position.y[player]!
    Pickup.kind[pickup] = POWERUP_ID.blast
    return world
  }

  it('sanity : le blast tue bien un ennemi proche mais non collé au joueur, sans jamais tuer le joueur lui-même', () => {
    const world = setupPointBlankBlast()
    const stats = createRunStats()
    let killed = false
    for (let step = 0; step < 20 && !killed; step++) {
      stepWorld(world, stats)
      killed = world.events.some((event) => event.type === 'enemyKilled')
    }
    expect(killed).toBe(true)
    // Le blast est ramassé et activé pile sur le joueur (spec §3.4) : garde
    // qu'il ne se tue jamais lui-même. `stepWorld` tourne dans son ordre réel.
    expect(world.alive).toBe(true)
  })

  /**
   * `ricochetSystem` doit tourner AVANT `hazardSystem`, comme `dashWakeSystem`
   * et `seekerSystem` : la goutte de Bavure est mortelle par elle-même, donc
   * c'est sa position d'après ce pas qui doit être éprouvée. Dans l'ordre
   * inverse, le disque qui tue traînerait d'une image derrière le disque
   * dessiné — en permanence, et sur le power-up même dont toute la raison
   * d'être est que « le dessin contient ce qui tue » (spec §3.1).
   *
   * Un commentaire le disait dans `step.ts` ; rien ne le tenait. Le montage
   * ci-dessous fait échouer les deux ordres pour des raisons différentes :
   * l'ennemi est posé **hors de portée** de la goutte immobile, et **à portée**
   * de la goutte après un pas. Les deux distances sont dérivées des constantes,
   * jamais recopiées.
   */
  it('éprouve la goutte de Bavure là où elle ARRIVE, pas là où elle était (ricochetSystem avant hazardSystem)', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const player = spawnPlayer(world)
    Position.x[player] = 400
    Position.y[player] = 300
    Facing.angle[player] = 0

    const pas = (POWERUP_BASE.splatter.speed * FIXED_DT) / 1000
    const portee = POWERUP_BASE.splatter.radius + ENEMIES.point.radius
    const depart = 100
    // À mi-chemin entre « hors de portée sans le pas » et « à portée avec » :
    // la marge est de pas/2 des deux côtés, aucun des deux ordres n'est limite.
    const cible = spawnEnemy(world, {
      type: 'point',
      x: depart + portee + pas / 2,
      y: 300,
      materializeMs: 0,
    })

    launchSplatter(world, createRunStats(), depart, 300)

    // Le montage lui-même, avant toute conclusion : la goutte ne touche PAS
    // l'ennemi à sa position de départ (sinon le test passerait dans les deux
    // ordres), et elle le touchera après un pas.
    expect(Position.x[cible]! - depart).toBeGreaterThan(portee)
    expect(Position.x[cible]! - (depart + pas)).toBeLessThan(portee)

    stepWorld(world, createRunStats())

    expect(entityExists(world, cible)).toBe(false)
  })

  it('un kill en jeu reel incremente bien le score et le combo (scoreSystem tourne apres deathSystem)', () => {
    const world = setupPointBlankBlast()
    const stats = createRunStats()
    const scoreBefore = world.score
    for (let step = 0; step < 20; step++) {
      stepWorld(world, stats)
    }
    // Garde la régression où scoreSystem tournait avant deathSystem : le
    // score et le combo ne progressaient alors jamais sur un kill réel.
    expect(world.combo).toBeGreaterThan(0)
    expect(world.score).toBeGreaterThan(scoreBefore + 25)
  })
})
