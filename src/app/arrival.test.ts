import { describe, expect, it } from 'vitest'

import { Movement, Position, Velocity } from '@/sim/components'
import { spawnPlayer } from '@/sim/spawn'
import { integrationSystem } from '@/sim/systems/integration'
import { playerMovementSystem } from '@/sim/systems/player-movement'
import { ARENA, createWorld, FIXED_DT } from '@/sim/world'
import type { PlayerMotion } from './input-source'
import { aimInput } from './mouse'

/** Tolérance de dépassement, en pixels. Voir le commentaire de `runToTarget`. */
const OVERSHOOT_TOLERANCE = 1

/**
 * Rejoue une approche complète et rend de quoi juger les trois propriétés :
 * le point arrive, ne dépasse pas, s'immobilise.
 *
 * Le dépassement se mesure sur l'axe d'approche (+x) : `target.x - position.x`
 * part positif et ne doit jamais devenir négatif. C'est la définition même du
 * dépassement, et le cœur du défaut corrigé.
 *
 * La tolérance d'un pixel absorbe la quantification de l'entrée au 1/128 et le
 * pas fixe de 16,67 ms — le point ne peut pas s'arrêter entre deux images.
 */
function runToTarget(startDistance: number, startSpeed: number, maxSpeedMultiplier = 1) {
  const world = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  const player = spawnPlayer(world)
  // « Pas léger » multiplie `maxSpeed` sans toucher `accel` (empilable) : le
  // reproduire ici, plutôt que de ne poser `maxSpeed` qu'au spawn, est ce qui
  // manquait pour exercer la carte — voir le describe ci-dessous.
  Movement.maxSpeed[player] = (Movement.maxSpeed[player] ?? 0) * maxSpeedMultiplier
  const target = { x: ARENA.width / 2, y: ARENA.height / 2 }

  Position.x[player] = target.x - startDistance
  Position.y[player] = target.y
  Velocity.x[player] = startSpeed
  Velocity.y[player] = 0

  let worstSigned = Number.POSITIVE_INFINITY

  for (let step = 0; step < 600; step++) {
    const motion: PlayerMotion = {
      x: Position.x[player] ?? 0,
      y: Position.y[player] ?? 0,
      vx: Velocity.x[player] ?? 0,
      vy: Velocity.y[player] ?? 0,
      friction: Movement.friction[player] ?? 0,
      accel: Movement.accel[player] ?? 0,
      maxSpeed: Movement.maxSpeed[player] ?? 0,
    }
    const { moveX, moveY } = aimInput(motion, target)
    world.input.moveX = moveX
    world.input.moveY = moveY
    playerMovementSystem(world)
    integrationSystem(world)
    worstSigned = Math.min(worstSigned, target.x - (Position.x[player] ?? 0))
  }

  const finalDistance = Math.hypot(
    target.x - (Position.x[player] ?? 0),
    target.y - (Position.y[player] ?? 0),
  )
  const finalSpeed = Math.hypot(Velocity.x[player] ?? 0, Velocity.y[player] ?? 0)
  return { worstSigned, finalDistance, finalSpeed }
}

// Distance de départ, vitesse de départ. Le cas (15, 240) est le plus dur :
// 15 px à pleine vitesse, quand il en faut 14,4 pour s'arrêter (distance
// d'arrêt de la règle actuelle, contre 10,8 pour l'ancienne) — 0,6 px de marge.
const APPROACHES: [number, number][] = [
  [400, 240],
  [200, 240],
  [50, 240],
  [15, 240],
  [300, 0],
  [11, 100],
]

describe("l'arrivée sur le curseur", () => {
  for (const [distance, speed] of APPROACHES) {
    it(`ne dépasse jamais la cible depuis ${distance} px à ${speed} px/s`, () => {
      const { worstSigned } = runToTarget(distance, speed)
      expect(worstSigned).toBeGreaterThan(-OVERSHOOT_TOLERANCE)
    })

    it(`se pose sur la cible depuis ${distance} px à ${speed} px/s`, () => {
      const { finalDistance, finalSpeed } = runToTarget(distance, speed)
      // Sous la zone morte (`DEAD_ZONE = 3` dans mouse.ts), pas 5 : c'est elle
      // qui définit « posé » dans la spec. Les distances finales mesurées vont
      // de 0,42 à 0,83 px, largement en dessous.
      expect(finalDistance).toBeLessThan(3)
      expect(finalSpeed).toBeLessThan(5)
    })
  }
})

describe("l'arrivée sur le curseur, avec « Pas léger » empilée", () => {
  // La carte multiplie `maxSpeed` sans toucher `accel` (empilable) : la
  // distance d'arrêt (`maxSpeed² / (2·accel)`) grandit au carré du nombre
  // d'exemplaires. Avant la compensation du délai d'un pas réintroduite dans
  // `aimInput`, l'invariant « ne dépasse jamais » cassait dès deux
  // exemplaires (×1,12² ≈ 301 px/s) sur la plupart des approches longues de
  // la liste ci-dessus — jamais exercé jusqu'ici, puisque ce fichier ne
  // posait `maxSpeed` qu'au spawn, sans jamais appliquer la carte.
  for (const stacks of [2, 5]) {
    const multiplier = 1.12 ** stacks
    for (const [distance, speed] of APPROACHES) {
      it(`ne dépasse jamais depuis ${distance} px à ${speed} px/s, avec ${stacks} exemplaires de Pas léger`, () => {
        const { worstSigned } = runToTarget(distance, speed, multiplier)
        expect(worstSigned).toBeGreaterThan(-OVERSHOOT_TOLERANCE)
      })
    }
  }
})

/**
 * Rejoue une poursuite où la cible bouge, et rend de quoi juger le suivi.
 * `moveTarget` reçoit le numéro de pas et rend la position du curseur.
 */
function chase(moveTarget: (step: number) => { x: number; y: number }, steps: number) {
  const world = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  const player = spawnPlayer(world)
  const start = moveTarget(0)
  Position.x[player] = start.x
  Position.y[player] = start.y
  Velocity.x[player] = 0
  Velocity.y[player] = 0

  let worstLag = 0
  for (let step = 0; step < steps; step++) {
    const target = moveTarget(step)
    const motion: PlayerMotion = {
      x: Position.x[player] ?? 0,
      y: Position.y[player] ?? 0,
      vx: Velocity.x[player] ?? 0,
      vy: Velocity.y[player] ?? 0,
      friction: Movement.friction[player] ?? 0,
      accel: Movement.accel[player] ?? 0,
      maxSpeed: Movement.maxSpeed[player] ?? 0,
    }
    const { moveX, moveY } = aimInput(motion, target)
    world.input.moveX = moveX
    world.input.moveY = moveY
    playerMovementSystem(world)
    integrationSystem(world)
    worstLag = Math.max(
      worstLag,
      Math.hypot(target.x - (Position.x[player] ?? 0), target.y - (Position.y[player] ?? 0)),
    )
  }

  const last = moveTarget(steps - 1)
  const settled = Math.hypot(last.x - (Position.x[player] ?? 0), last.y - (Position.y[player] ?? 0))
  return { worstLag, settled }
}

const CX = ARENA.width / 2
const CY = ARENA.height / 2

describe('la poursuite d’un curseur qui bouge', () => {
  it('suit un glissé horizontal sans se laisser distancer', () => {
    // 150 px/s pendant 2 s, puis immobile 1 s. Seuil resserré à 12 px : mesuré
    // contre l'ancienne règle (coupure + FULL_THROTTLE_RADIUS, commit f9eee1f),
    // ce scénario donne un pire écart de 16,81 px — au-dessus du seuil, donc
    // en échec — contre 6,94 px avec la règle actuelle.
    const { worstLag, settled } = chase(
      (s) => ({ x: CX + Math.min(s, 120) * 150 * (FIXED_DT / 1000), y: CY }),
      180,
    )
    expect(worstLag).toBeLessThan(12)
    expect(settled).toBeLessThan(3)
  })

  it('encaisse un virage sec sans dériver', () => {
    // Le geste décrit par le joueur : la cible part à droite, puis coupe vers
    // le haut au moment où le point la rejoint. Le virage est borné à 120 pas
    // (comme le glissé ci-dessus) : au-delà, la cible sortirait du haut de
    // l'arène, où le mur clampe le joueur — un écart qui grandirait alors
    // sans fin, sans rapport avec le suivi mesuré ici.
    //
    // Seuil resserré à 15 px : l'ancienne règle culmine à 25,83 px pendant le
    // virage lui-même (mesuré phase par phase, commit f9eee1f) — largement
    // au-dessus —, contre 7,84 px avec la règle actuelle. C'est la propriété
    // que cette tâche vise : un seuil large aurait laissé passer les deux
    // règles et n'aurait rien verrouillé.
    const { worstLag, settled } = chase(
      (s) =>
        s < 60
          ? { x: CX + s * 150 * (FIXED_DT / 1000), y: CY }
          : {
              x: CX + 60 * 150 * (FIXED_DT / 1000),
              y: CY - Math.min(s - 60, 120) * 150 * (FIXED_DT / 1000),
            },
      240,
    )
    expect(worstLag).toBeLessThan(15)
    expect(settled).toBeLessThan(3)
  })

  it('suit un cercle et s’y pose quand il s’arrête', () => {
    // Seuil resserré à 12 px : l'ancienne règle atteint 16,18 px, contre
    // 6,44 px avec la règle actuelle (mesuré contre f9eee1f).
    const R = 120
    const { worstLag, settled } = chase((s) => {
      const t = Math.min(s, 180) * 0.02
      return { x: CX + Math.cos(t) * R, y: CY + Math.sin(t) * R }
    }, 300)
    expect(worstLag).toBeLessThan(12)
    expect(settled).toBeLessThan(3)
  })
})
