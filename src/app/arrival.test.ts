import { describe, expect, it } from 'vitest'

import { Movement, Position, Velocity } from '@/sim/components'
import { spawnPlayer } from '@/sim/spawn'
import { integrationSystem } from '@/sim/systems/integration'
import { playerMovementSystem } from '@/sim/systems/player-movement'
import { ARENA, createWorld } from '@/sim/world'
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
function runToTarget(startDistance: number, startSpeed: number) {
  const world = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  const player = spawnPlayer(world)
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
// 15 px à pleine vitesse, quand il en faut 10,8 pour s'arrêter.
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
      expect(finalDistance).toBeLessThan(5)
      expect(finalSpeed).toBeLessThan(5)
    })
  }
})
