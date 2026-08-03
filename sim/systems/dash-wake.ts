import { addComponent, addEntity, hasComponent } from 'bitecs'

import { Dashing, Facing, Hazard, Lifetime, Position } from '../components'
import { HAZARD_TRAIL, POWERUP_BASE } from '../data/powerups'
import { atan2 } from '../math'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * Le sillage de la ruée : des taches d'encre mortelles déposées le long du
 * parcours. Le couloir affiché EST le couloir qui tue, portée et largeur se
 * lisent à l'écran sans indicateur séparé (spec §4.2).
 */
export function dashWakeSystem(world: SimWorld, stats: RunStats): SimWorld {
  const player = world.playerEid
  if (player < 0 || !hasComponent(world, Dashing, player)) {
    // Remis à zéro hors ruée, sinon le temps écoulé entre deux ruées ferait
    // déposer un segment en double au début de la suivante.
    world.dashWakeAccMs = 0
    return world
  }

  world.dashWakeAccMs += FIXED_DT * world.timeScale
  const interval = POWERUP_BASE.dash.wakeIntervalMs
  if (world.dashWakeAccMs < interval) {
    return world
  }
  // Soustraction plutôt que remise à zéro : évite une dérive de cadence
  // quand un pas dépasse l'intervalle.
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
  // Direction portée par `Facing`, pas un champ de `Hazard` qui « a l'air
  // libre » : `hazardSystem` lit ses champs sur toutes les zones.
  addComponent(world, Facing, eid)
  Facing.angle[eid] = atan2(Dashing.vy[player]!, Dashing.vx[player]!)
  return world
}
