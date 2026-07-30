import { addComponent, defineQuery, Not, removeComponent } from 'bitecs'

import { Bursting, Enemy, Frozen, Homing, Materializing, Velocity } from '../components'
import { ENEMIES, ENEMY_TYPE_BY_ID } from '../data/enemies'
import { FIXED_DT, type SimWorld } from '../world'

// Mêmes exclusions que `formationSystem` et `homingSystem`, pour les mêmes
// raisons : un Bursting gelé doit rester parfaitement immobile (son minuteur
// ne progresse simplement pas tant qu'il est gelé, il reprend le sursaut là où
// il l'avait laissé une fois dégelé) ; Materializing ne devrait jamais
// coexister avec Bursting en pratique (le sursaut n'est posé qu'à la
// dislocation d'une formation déjà matérialisée), exclu par cohérence défensive.
const bursting = defineQuery([Bursting, Velocity, Enemy, Not(Materializing), Not(Frozen)])

/**
 * Sursaut vers le joueur à la dislocation d'une figure traversante (Ligne, V,
 * Spirale — spec pacing-pass v2 §Traversantes) : trajectoire figée, comme la
 * charge de l'Éclat (shardSystem) ou la ruée du joueur (Dashing) — un mobile
 * dont la vélocité est gouvernée par un minuteur dédié, pas par `Homing`,
 * pendant sa durée. `Homing` reprend, avec le délai propre au type, une fois
 * le sursaut épuisé.
 */
export function burstSystem(world: SimWorld): SimWorld {
  const dt = FIXED_DT * world.timeScale

  for (const eid of bursting(world)) {
    const remaining = Bursting.remaining[eid]! - dt
    if (remaining <= 0) {
      removeComponent(world, Bursting, eid)
      addComponent(world, Homing, eid)
      const type = ENEMY_TYPE_BY_ID[Enemy.type[eid] ?? 0] ?? 'point'
      Homing.delayMs[eid] = ENEMIES[type].homingDelayMs
      continue
    }

    Bursting.remaining[eid] = remaining
    Velocity.x[eid] = Bursting.vx[eid]!
    Velocity.y[eid] = Bursting.vy[eid]!
  }

  return world
}
