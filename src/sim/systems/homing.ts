import { defineQuery, Not } from 'bitecs'

import { Frozen, Homing, Materializing, Movement, Position, Velocity } from '../components'
import { POWERUP_BASE } from '../data/powerups'
import { createPositionHistory } from '../position-history'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * `Not(Frozen)` est structurel : la poursuite s'exécute avant l'intégration, qui
 * s'exécute avant le gel. Sans exclusion, un ennemi gelé se verrait attribuer une
 * vitesse, serait déplacé, puis remis à zéro — il dériverait d'une fraction de
 * pixel à chaque image tout en étant affiché comme figé. Le gel doit tenir par
 * construction, pas par l'ordre des systèmes.
 */
const hunters = defineQuery([Homing, Position, Velocity, Movement, Not(Materializing), Not(Frozen)])

/** Historique du joueur, par monde — jamais partagé entre deux simulations. */
const histories = new WeakMap<SimWorld, ReturnType<typeof createPositionHistory>>()

function historyFor(world: SimWorld) {
  let h = histories.get(world)
  if (!h) {
    // 64 échantillons à 60 Hz ≈ 1 s de mémoire, largement au-delà du délai max (400 ms).
    h = createPositionHistory(64)
    histories.set(world, h)
  }
  return h
}

export function homingSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale
  const history = historyFor(world)
  // Le Séchage ralentit les poursuivants sans passer par world.timeScale, qui
  // affecterait aussi le joueur (spec §3.4) : il agit sur le plafond de vitesse.
  const slowed = world.time < world.slowUntil
  const slowFactor = slowed ? POWERUP_BASE.dryspell.slowFactor : 1

  if (world.playerEid >= 0) {
    history.push(world.time, Position.x[world.playerEid]!, Position.y[world.playerEid]!)
  }

  for (const eid of hunters(world)) {
    const target = history.sample(world.time - Homing.delayMs[eid]!)
    const dx = target.x - Position.x[eid]!
    const dy = target.y - Position.y[eid]!
    const dist = Math.hypot(dx, dy)
    if (dist < 0.001) {
      continue
    }

    let vx = Velocity.x[eid]! + (dx / dist) * Movement.accel[eid]! * dt
    let vy = Velocity.y[eid]! + (dy / dist) * Movement.accel[eid]! * dt

    const maxSpeed = Movement.maxSpeed[eid]! * slowFactor
    const speed = Math.hypot(vx, vy)
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed
      vy = (vy / speed) * maxSpeed
    }

    Velocity.x[eid] = vx
    Velocity.y[eid] = vy
  }

  return world
}
