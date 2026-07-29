import { addComponent, addEntity, defineQuery, hasComponent } from 'bitecs'

import { Doomed, Hazard, Lifetime, Position } from '../components'
import { HAZARD_AFTERBURN, HAZARD_BLAST, RULE_TUNING } from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

const timed = defineQuery([Lifetime])

/**
 * Rémanence : à l'expiration d'une Bombe, laisse une braise (kind à part,
 * HAZARD_AFTERBURN — pas HAZARD_BLAST, sinon sa propre expiration relancerait
 * une braise à l'infini). Rayon dérivé du rayon max de la Bombe éteinte, donc
 * profite déjà de « Rayon de bombe » sans dial séparé.
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

/**
 * Marque pour suppression toute entité dont le sursis (`Lifetime.remaining`)
 * est écoulé. `stats` est optionnel : les tests existants appellent
 * `lifetimeSystem(w)` sans lui, et sans carte « Rémanence » active le
 * comportement reste celui d'avant cette tâche.
 */
export function lifetimeSystem(world: SimWorld, stats?: RunStats): SimWorld {
  const dt = FIXED_DT * world.timeScale
  const afterburnActive = stats?.rules.has('afterburn') ?? false

  // Photographie fixe : `addComponent(world, Lifetime, …)` dans spawnAfterburn
  // pousserait la braise dans ce même tableau dense si on itérait la requête
  // vive (bitECS renvoie le tableau interne, pas une copie) — elle serait
  // alors traitée dans cette même passe selon un ordre qui dépend de détails
  // internes de la bibliothèque plutôt que du seul état du monde. Elle
  // attendra le pas suivant, comme toute entité qui vient de naître.
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
