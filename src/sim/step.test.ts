import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import {
  Collider,
  Dashing,
  Enemy,
  Frozen,
  Inventory,
  Invulnerable,
  Pickup,
  Player,
  Position,
} from './components'
import { MAX_ENEMIES } from './data/difficulty'
import { POWERUP_ID } from './data/powerups'
import { spawnEnemy, spawnPlayer } from './spawn'
import { stepWorld } from './step'
import { createRunStats } from './upgrades/stats'
import { createWorld, FIXED_DT } from './world'

const enemiesQuery = defineQuery([Enemy, Position, Collider])
const frozenQuery = defineQuery([Frozen, Position])
const pickupsQuery = defineQuery([Pickup, Position])
const playersQuery = defineQuery([Player, Position])

/**
 * Bot scripté et déterministe : fuit les ennemis proches (une simple somme
 * vectorielle de répulsion), va chercher le power-up au sol le plus proche à
 * défaut de menace, sinon balaie une direction fixe. Toujours déterministe
 * puisqu'il ne lit que l'état du monde (donc du RNG à graine fixe), jamais
 * une horloge ni un aléa externe.
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
        // Aucune menace ni power-up en vue : balaie une direction fixe, qui
        // change périodiquement — la consigne « varier la direction ».
        const dir = Math.floor(step / 45) % 8
        const angle = (dir / 8) * Math.PI * 2
        moveX = Math.cos(angle)
        moveY = Math.sin(angle)
      }
    }
  }

  world.input.moveX = moveX
  world.input.moveY = moveY
  // Déclenche les 3 emplacements à des cadences différentes et déphasées,
  // pour exercer les power-ups sans dépendre de leur nature (tirée par RNG).
  world.input.slots = [step % 30 < 3, step % 47 < 2, step % 61 < 2]
}

describe('stepWorld — ordre fixe des systèmes', () => {
  it('tient les invariants de composition sur une partie scriptée de plusieurs milliers de pas', () => {
    // « Plusieurs centaines de pas » ne suffit pas à exercer la grâce de
    // début de vague (40 s, cf. WAVE_START_INVULN_MS) : on pousse à 6000 pas
    // (100 s) pour traverser au moins une transition de vague et plusieurs
    // apparitions de power-up, sans quoi l'invariant Invulnerable/Dashing ne
    // serait jamais mis à l'épreuve.
    const STEPS = 6000
    const world = createWorld({ seed: 7, width: 800, height: 600 })
    spawnPlayer(world)
    const stats = createRunStats()

    // Positions connues des ennemis gelés au pas précédent, pour vérifier
    // qu'ils n'ont pas bougé. Purgée à chaque pas des entités qui ne sont
    // plus gelées ou plus vivantes, pour ne jamais comparer une position
    // fraîche à celle d'une entité recyclée par bitecs sous le même eid.
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

      // 1. Le joueur ne meurt jamais alors qu'il entrait dans le pas protégé
      //    par une grâce (Invulnerable) ou une ruée (Dashing) avec une marge
      //    confortable — pas juste sur le point d'expirer ce pas-ci, ce qui
      //    est un comportement voulu (spec §3.4), pas un bug.
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

      // 3. Aucune entité référencée après suppression : toute entité rendue
      //    par la requête courante doit porter des données saines (pas de
      //    NaN issu d'un slot recyclé ou d'un tableau désynchronisé).
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

      // 5. Le nombre d'ennemis simultanés ne dépasse jamais le plafond.
      expect(enemiesQuery(world).length).toBeLessThanOrEqual(MAX_ENEMIES)
    }
  })

  // Scénario minimal isolant le défaut de composition découvert en écrivant
  // le test ci-dessus : voir le rapport de la tâche 13 pour le détail.
  const setupPointBlankBlast = () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const player = spawnPlayer(world)
    // Assez loin pour ne pas toucher le joueur (rayon 9 + 7 = 16 < 40), mais
    // assez proche pour que le blast l'atteigne en quelques pas.
    spawnEnemy(world, { type: 'point', x: 440, y: 300, materializeMs: 0 })
    Inventory.slots[player]![0] = POWERUP_ID.blast
    return world
  }

  it('sanity : le blast tue bien un ennemi proche mais non collé au joueur', () => {
    const world = setupPointBlankBlast()
    const stats = createRunStats()
    let killed = false
    for (let step = 0; step < 20 && !killed; step++) {
      world.input.slots = [step === 0, false, false]
      stepWorld(world, stats)
      killed = world.events.some((event) => event.type === 'enemyKilled')
    }
    expect(killed).toBe(true)
  })

  it('un kill en jeu reel incremente bien le score et le combo (scoreSystem tourne apres deathSystem)', () => {
    const world = setupPointBlankBlast()
    const stats = createRunStats()
    const scoreBefore = world.score
    for (let step = 0; step < 20; step++) {
      world.input.slots = [step === 0, false, false]
      stepWorld(world, stats)
    }
    // deathSystem est le seul emetteur de enemyKilled ; scoreSystem doit
    // tourner apres lui pour voir l'evenement dans le meme pas et faire
    // progresser le score au-dela du seul filet de survie, et avancer le
    // combo.
    expect(world.combo).toBeGreaterThan(0)
    expect(world.score).toBeGreaterThan(scoreBefore + 25)
  })
})
