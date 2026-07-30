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
import { FIXED_DT, type SimWorld } from '../world'

// `Not(Frozen)` : un membre de formation gelé doit rester parfaitement immobile
// comme n'importe quel autre ennemi (même invariant que homingSystem) — sans
// cette exclusion, cette chorégraphie réécrirait sa vélocité malgré le gel et
// le ferait dériver pendant qu'il est affiché comme figé. Son minuteur interne
// (`elapsed`) ne progresse simplement pas tant qu'il est exclu : il reprend la
// chorégraphie exactement où il l'avait laissée une fois dégelé.
const members = defineQuery([Formation, Position, Velocity, Enemy, Not(Materializing), Not(Frozen)])

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Fait avancer la chorégraphie d'une formation : le bloc tient sa forme et se
 * déplace ensemble (translation, resserrement, rotation additionnelle, selon
 * la figure — voir data/formations.ts) jusqu'à ce que sa durée s'écoule, puis
 * se disloque — chaque membre retrouve `Homing` avec le délai propre à son
 * type, et reprend une poursuite normale au pas suivant.
 *
 * Positionnement scripté via la vélocité plutôt qu'une écriture directe de
 * `Position` : `integrationSystem` (qui s'exécute juste après) applique déjà
 * le blocage aux murs de l'arène et tient PrevPosition à jour pour
 * l'interpolation du rendu — en profiter gratuitement plutôt que dupliquer
 * cette logique ici.
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
      // Dislocation. Les figures traversantes (Ligne, V, Spirale —
      // travelSpeed > 0) se jettent sur le joueur (spec pacing-pass v2
      // §Traversantes) : le joueur les a vues traverser en formation, elles
      // doivent se retourner sur lui, pas simplement reprendre un Homing qui
      // ré-accélère depuis zéro. Les figures enveloppantes (Cercle, Carré —
      // travelSpeed === 0) reprennent directement une poursuite normale,
      // avec le délai de visée propre à leur type (pas celui, potentiellement
      // nul, laissé par un ancien passage dans Homing — même piège documenté
      // dans shardSystem pour la charge de l'Éclat).
      const travelSpeed = Formation.travelSpeed[eid]!
      removeComponent(world, Formation, eid)

      if (travelSpeed > 0 && world.playerEid >= 0) {
        const dx = Position.x[world.playerEid]! - Position.x[eid]!
        const dy = Position.y[world.playerEid]! - Position.y[eid]!
        const d = Math.hypot(dx, dy) || 1
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
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const ox = Formation.offsetX[eid]!
    const oy = Formation.offsetY[eid]!
    const rx = (ox * cos - oy * sin) * shrink
    const ry = (ox * sin + oy * cos) * shrink

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
