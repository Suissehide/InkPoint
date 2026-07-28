import { addComponent, addEntity } from 'bitecs'

import {
  Attractor,
  Dashing,
  Facing,
  Halo,
  Hazard,
  Lifetime,
  Position,
  Velocity,
} from '../components'
import {
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_FREEZE,
  HAZARD_STRIKE,
  HAZARD_TRAIL,
  POWERUP_BASE,
  POWERUP_ID,
  type PowerUpKind,
} from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'
import { takeSlot } from './inventory'

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

export function activatePowerUp(world: SimWorld, kind: PowerUpKind, stats: RunStats): void {
  const player = world.playerEid
  if (player < 0) {
    return
  }
  const x = Position.x[player]!
  const y = Position.y[player]!

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

    case 'trail': {
      // La traînée est marquée sur le joueur : le système de mouvement dépose
      // des segments mortels tant qu'elle est active.
      const eid = createHazard(world, HAZARD_TRAIL, x, y, {
        radius: POWERUP_BASE.trail.radius,
        maxRadius: POWERUP_BASE.trail.radius,
        growthRate: 0,
        lifeMs: stats.trailDurationMs,
      })
      addComponent(world, Velocity, eid)
      // Le hazard suit le joueur : sa position est recopiée chaque pas par trailSystem.
      break
    }

    case 'strike': {
      const angle = Facing.angle[player] ?? 0
      const reach = Math.hypot(world.arena.width, world.arena.height)
      // Chaîne de zones le long de la ligne de visée : une « Rature » qui balaie l'arène.
      const stepPx = stats.strikeWidth * 0.8
      for (let d = 0; d < reach; d += stepPx) {
        createHazard(world, HAZARD_STRIKE, x + Math.cos(angle) * d, y + Math.sin(angle) * d, {
          radius: stats.strikeWidth / 2,
          maxRadius: stats.strikeWidth / 2,
          growthRate: 0,
          lifeMs: POWERUP_BASE.strike.lingerMs,
        })
      }
      break
    }

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

    case 'dryspell':
      world.slowUntil = world.time + stats.dryspellDurationMs
      break
  }

  world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x, y })
}

export function powerupInputSystem(world: SimWorld, stats: RunStats): SimWorld {
  if (!world.alive) {
    return world
  }
  for (let i = 0; i < 3; i++) {
    if (!world.input.slots[i]) {
      continue
    }
    const kind = takeSlot(world, i)
    if (kind) {
      activatePowerUp(world, kind, stats)
    }
  }
  return world
}
