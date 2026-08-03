import { addComponent, defineQuery, Not, removeComponent } from 'bitecs'

import {
  Bursting,
  Enemy,
  Formation,
  Frozen,
  Homing,
  Materializing,
  Position,
  Velocity,
} from '../components'
import { ENEMIES, ENEMY_TYPE_BY_ID } from '../data/enemies'
import {
  BURST_DURATION_MS,
  BURST_SPEED,
  FORMATION_CHOREO,
  FORMATION_KINDS,
} from '../data/formations'
import { cos, hypot, sin } from '../math'
import { FIXED_DT, type SimWorld } from '../world'

// `Not(Frozen)` : un membre gelé reste immobile (même invariant que
// homingSystem). Son `elapsed` ne progresse pas tant qu'il est exclu : il
// reprend la chorégraphie où il l'avait laissée au dégel.
const members = defineQuery([Formation, Position, Velocity, Enemy, Not(Materializing), Not(Frozen)])

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Fait avancer la chorégraphie d'une formation jusqu'à dislocation (voir
 * data/formations.ts), puis rend `Homing` à chaque membre.
 *
 * Positionnement via la vélocité, pas une écriture directe de `Position` :
 * `integrationSystem`, juste après, applique déjà le blocage aux murs et
 * tient PrevPosition à jour pour l'interpolation du rendu.
 */
export function formationSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale
  if (dt <= 0) {
    return world
  }

  for (const eid of members(world)) {
    const elapsedMs = Formation.elapsed[eid]! + dt * 1000
    Formation.elapsed[eid] = elapsedMs

    const durationMs = Formation.durationMs[eid]!
    if (elapsedMs >= durationMs) {
      // Dislocation. Figures traversantes (travelSpeed > 0, spec pacing-pass
      // v2 §Traversantes) : sursaut vers le joueur plutôt qu'un Homing qui
      // ré-accélère depuis zéro. Figures enveloppantes : Homing direct, avec
      // le délai propre au type (pas un reliquat d'un ancien Homing — même
      // piège que shardSystem pour la charge de l'Éclat).
      const travelSpeed = Formation.travelSpeed[eid]!
      removeComponent(world, Formation, eid)

      if (travelSpeed > 0 && world.playerEid >= 0) {
        const dx = Position.x[world.playerEid]! - Position.x[eid]!
        const dy = Position.y[world.playerEid]! - Position.y[eid]!
        const d = hypot(dx, dy) || 1
        addComponent(world, Bursting, eid)
        Bursting.remaining[eid] = BURST_DURATION_MS
        Bursting.vx[eid] = (dx / d) * BURST_SPEED
        Bursting.vy[eid] = (dy / d) * BURST_SPEED
      } else {
        addComponent(world, Homing, eid)
        const type = ENEMY_TYPE_BY_ID[Enemy.type[eid] ?? 0] ?? 'point'
        Homing.delayMs[eid] = ENEMIES[type].homingDelayMs
      }
      continue
    }

    const kind = FORMATION_KINDS[Formation.kind[eid]!]
    // Garde défensive : ne devrait jamais se produire (kind toujours écrit par
    // waveSystem depuis un index valide de FORMATION_KINDS à la création).
    if (kind === undefined) {
      continue
    }
    const cfg = FORMATION_CHOREO[kind]

    const t = elapsedMs / 1000
    const durationSec = durationMs / 1000

    const originX = Formation.originX[eid]! + Formation.dirX[eid]! * cfg.travelSpeed * t
    const originY = Formation.originY[eid]! + Formation.dirY[eid]! * cfg.travelSpeed * t

    const shrink =
      durationSec > 0 ? lerp(1, cfg.shrinkTo, Math.min(1, t / durationSec)) : cfg.shrinkTo
    const angle = Formation.rotationOffset[eid]! + cfg.spin * t
    const cosA = cos(angle)
    const sinA = sin(angle)
    const ox = Formation.offsetX[eid]!
    const oy = Formation.offsetY[eid]!
    const rx = (ox * cosA - oy * sinA) * shrink
    const ry = (ox * sinA + oy * cosA) * shrink

    const targetX = originX + rx
    const targetY = originY + ry

    // Correction exacte en un pas : integrationSystem applique Velocity * dt,
    // donc (target - position) / dt amène très exactement la position cible
    // cette même image (sous réserve du blocage aux murs, qui reste voulu).
    Velocity.x[eid] = (targetX - Position.x[eid]!) / dt
    Velocity.y[eid] = (targetY - Position.y[eid]!) / dt
  }

  return world
}
