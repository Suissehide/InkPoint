import { FIXED_DT, type SimWorld } from '../world'

const SURVIVAL_POINTS_PER_SEC = 10
const KILL_POINTS = 25
const COMBO_WINDOW_MS = 2500
const COMBO_MAX_MULTIPLIER = 10

export function comboMultiplier(combo: number): number {
  return Math.min(COMBO_MAX_MULTIPLIER, 1 + Math.floor(combo / 5))
}

export function scoreSystem(world: SimWorld): SimWorld {
  if (!world.alive) {
    return world
  }
  const dt = FIXED_DT * world.timeScale

  world.score += (SURVIVAL_POINTS_PER_SEC * dt) / 1000

  let kills = 0
  for (const event of world.events) {
    if (event.type === 'enemyKilled') {
      kills++
    }
  }

  if (kills > 0) {
    for (let i = 0; i < kills; i++) {
      world.score += KILL_POINTS * comboMultiplier(world.combo)
      world.combo += 1
    }
    world.comboTimer = COMBO_WINDOW_MS
  } else if (world.combo > 0) {
    world.comboTimer -= dt
    if (world.comboTimer <= 0) {
      world.combo = 0
      world.comboTimer = 0
    }
  }

  return world
}
