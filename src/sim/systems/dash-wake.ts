import { addComponent, addEntity, hasComponent } from 'bitecs'

import { Dashing, Hazard, Lifetime, Position } from '../components'
import { HAZARD_TRAIL, POWERUP_BASE } from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * Le sillage de la ruée : des taches d'encre mortelles déposées le long du
 * parcours. C'est aussi tout le visuel de la Plume — le couloir affiché EST le
 * couloir qui tue, donc la portée et la largeur se lisent à l'écran sans qu'un
 * indicateur séparé puisse diverger de la réalité (spec §4.2).
 *
 * Il réutilise `HAZARD_TRAIL`, qui retrouve ici son sens : la constante
 * désignait jusqu'ici une zone collée au joueur qui ne traînait rien.
 */
export function dashWakeSystem(world: SimWorld, stats: RunStats): SimWorld {
  const player = world.playerEid
  if (player < 0 || !hasComponent(world, Dashing, player)) {
    // Remis à zéro hors ruée : sinon le temps écoulé entre deux ruées ferait
    // déposer un segment dès le premier pas de la suivante ET un autre juste
    // après, doublant le premier point du sillage.
    world.dashWakeAccMs = 0
    return world
  }

  world.dashWakeAccMs += FIXED_DT * world.timeScale
  const interval = POWERUP_BASE.dash.wakeIntervalMs
  if (world.dashWakeAccMs < interval) {
    return world
  }
  // Soustraction plutôt que remise à zéro : la cadence reste juste même quand un
  // pas dépasse l'intervalle, au lieu de dériver d'un peu à chaque segment.
  world.dashWakeAccMs -= interval

  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = Position.x[player]!
  Position.y[eid] = Position.y[player]!
  Hazard.kind[eid] = HAZARD_TRAIL
  Hazard.radius[eid] = stats.dashRadius
  Hazard.maxRadius[eid] = stats.dashRadius
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = POWERUP_BASE.dash.wakeLifeMs
  return world
}
