import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import {
  Collider,
  Dashing,
  Enemy,
  Frozen,
  Invulnerable,
  Pickup,
  Player,
  Position,
} from './components'
import { POWERUP_ID } from './data/powerups'
import { spawnEnemy, spawnPlayer } from './spawn'
import { stepWorld } from './step'
import { spawnPickup } from './systems/pickup'
import { createRunStats } from './upgrades/stats'
import { createWorld, FIXED_DT } from './world'

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

describe('stepWorld — ordre fixe des systèmes', () => {
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
