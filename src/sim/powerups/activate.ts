import { addComponent, addEntity } from 'bitecs'

import { Attractor, Dashing, Facing, Halo, Hazard, Lifetime, Position } from '../components'
import {
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_FREEZE,
  POWERUP_BASE,
  POWERUP_ID,
  type PowerUpKind,
} from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'

function createHazard(
  world: SimWorld,
  kind: number,
  x: number,
  y: number,
  opts: { radius: number; maxRadius: number; growthRate: number; lifeMs: number },
): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = kind
  Hazard.radius[eid] = opts.radius
  Hazard.maxRadius[eid] = opts.maxRadius
  Hazard.growthRate[eid] = opts.growthRate
  Lifetime.remaining[eid] = opts.lifeMs
  return eid
}

/**
 * Déclenche un power-up. `x`/`y` est la position d'activation — celle de la
 * pastille ramassée, puisqu'il n'y a plus d'inventaire : toucher l'objet,
 * c'est l'utiliser, sur place (spec §3.4). Elle ne sert qu'aux effets centrés
 * sur un point (Bombe, Gel, Buvard) : la Plume et le Halo n'ont besoin
 * d'aucune position.
 */
export function activatePowerUp(
  world: SimWorld,
  kind: PowerUpKind,
  stats: RunStats,
  x: number,
  y: number,
): void {
  const player = world.playerEid
  if (player < 0) {
    return
  }

  switch (kind) {
    case 'blast': {
      const growth = POWERUP_BASE.blast.growthRate
      createHazard(world, HAZARD_BLAST, x, y, {
        radius: 12,
        maxRadius: stats.blastRadius,
        growthRate: growth,
        // La zone persiste après avoir atteint son rayon max (spec §3.4).
        lifeMs: (stats.blastRadius / growth) * 1000 + stats.blastLingerMs,
      })
      break
    }
    case 'freeze':
      createHazard(world, HAZARD_FREEZE, x, y, {
        radius: stats.freezeRadius,
        maxRadius: stats.freezeRadius,
        growthRate: 0,
        lifeMs: POWERUP_BASE.freeze.zoneLifeMs,
      })
      break

    case 'blotter': {
      const eid = createHazard(world, HAZARD_BLOTTER, x, y, {
        radius: stats.blotterRadius,
        maxRadius: stats.blotterRadius,
        growthRate: 0,
        lifeMs: POWERUP_BASE.blotter.lifeMs,
      })
      addComponent(world, Attractor, eid)
      Attractor.strength[eid] = POWERUP_BASE.blotter.strength
      break
    }

    case 'dash': {
      // Un seul minuteur. Une première version accordait aussi `Invulnerable`
      // pour la même durée : les deux composants étaient décrémentés par des
      // systèmes différents, décalaient d'un pas, et le joueur mourait sur la
      // dernière image de sa ruée — alors qu'il se déplaçait encore à pleine
      // vitesse. La Plume étant le recours quand on est encerclé, elle tuait
      // dans la situation même où on l'active. `collisionSystem` traite
      // désormais la présence de `Dashing` comme une invulnérabilité, donc les
      // deux états ne peuvent plus diverger.
      const angle = Facing.angle[player] ?? 0
      addComponent(world, Dashing, player)
      Dashing.remaining[player] = stats.dashDurationMs
      Dashing.vx[player] = Math.cos(angle) * POWERUP_BASE.dash.speed
      Dashing.vy[player] = Math.sin(angle) * POWERUP_BASE.dash.speed
      break
    }

    case 'halo':
      addComponent(world, Halo, player)
      break
  }

  world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x, y })
}
