import { addComponent, addEntity, defineQuery, hasComponent } from 'bitecs'

import { Doomed, Hazard, Lifetime, Position } from '../components'
import { HAZARD_AFTERBURN, HAZARD_BLAST, RULE_TUNING } from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

const timed = defineQuery([Lifetime])

/**
 * Rémanence : à l'expiration d'une Bombe, laisse une braise (kind à part,
 * HAZARD_AFTERBURN, jamais HAZARD_BLAST — sinon sa propre expiration
 * relancerait une braise à l'infini). Rayon dérivé du rayon max de la Bombe éteinte.
 */
function spawnAfterburn(world: SimWorld, hazardEid: number): void {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = Position.x[hazardEid]!
  Position.y[eid] = Position.y[hazardEid]!
  Hazard.kind[eid] = HAZARD_AFTERBURN
  const radius = Hazard.maxRadius[hazardEid]! * RULE_TUNING.afterburn.radiusRatio
  Hazard.radius[eid] = radius
  Hazard.maxRadius[eid] = radius
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = RULE_TUNING.afterburn.lifeMs
}

/** Marque pour suppression toute entité dont le sursis (`Lifetime.remaining`) est écoulé. */
export function lifetimeSystem(world: SimWorld, stats?: RunStats): SimWorld {
  const dt = FIXED_DT * world.timeScale
  const afterburnActive = stats?.rules.has('afterburn') ?? false

  // Photographie fixe : bitECS renvoie le tableau interne, pas une copie.
  // spawnAfterburn pousserait sinon la braise dans ce même tableau et la
  // traiterait dans la même passe selon l'ordre interne de la bibliothèque.
  for (const eid of [...timed(world)]) {
    const remaining = Lifetime.remaining[eid]! - dt
    if (remaining <= 0) {
      if (
        afterburnActive &&
        hasComponent(world, Hazard, eid) &&
        Hazard.kind[eid] === HAZARD_BLAST
      ) {
        spawnAfterburn(world, eid)
      }
      addComponent(world, Doomed, eid)
    } else {
      Lifetime.remaining[eid] = remaining
    }
  }

  return world
}
