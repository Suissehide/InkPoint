import type { Camera } from '@/render/camera'
import { INK } from '@/render/ink'
import type { Particles } from '@/render/particles'
import type { SimWorld } from '@/sim/world'

export const HITSTOP_MS = 60
export const DEATH_SLOWMO_MS = 800
export const DEATH_SLOWMO_SCALE = 0.15

export interface JuiceState {
  hitstopRemaining: number
  deathSlowmoRemaining: number
}

export function createJuiceState(): JuiceState {
  return { hitstopRemaining: 0, deathSlowmoRemaining: 0 }
}

/**
 * Traduit les événements d'un pas de simulation en effets ressentis.
 * Le hitstop est ce qui fait qu'un kill *se sent* — c'est le seul effet de
 * cette liste dont l'absence se remarque immédiatement (spec §3.8).
 *
 * `fx.camera` et `fx.particles` sont des objets de `src/render/` : on les
 * pilote depuis ici (lecture de `world.events`), mais rien ne repart en sens
 * inverse vers la simulation — ce module n'écrit jamais dans `world`, à part
 * l'accumulation d'état purement local (`state`).
 */
export function applyJuice(
  world: SimWorld,
  state: JuiceState,
  fx: { camera: Camera; particles: Particles; enabled: boolean },
): void {
  let kills = 0

  for (const event of world.events) {
    switch (event.type) {
      case 'enemyKilled':
        kills++
        if (fx.enabled) {
          fx.particles.emitBurst(event.x, event.y, INK.danger, 7)
        }
        break
      case 'powerupUsed':
        if (fx.enabled) {
          fx.camera.shake(6)
          fx.particles.emitBurst(event.x, event.y, INK.blast, 12)
        }
        break
      case 'haloBroken':
        if (fx.enabled) {
          fx.camera.shake(14)
          fx.particles.emitBurst(event.x, event.y, INK.paper, 24)
        }
        break
      case 'playerDied':
        state.deathSlowmoRemaining = DEATH_SLOWMO_MS
        if (fx.enabled) {
          fx.camera.shake(24)
          fx.particles.emitBurst(event.x, event.y, INK.paper, 40)
        }
        break
      default:
        break
    }
  }

  if (kills > 0) {
    state.hitstopRemaining = HITSTOP_MS
    if (fx.enabled) {
      fx.camera.shake(Math.min(18, 2 + kills * 1.5))
    }
  }
}

/** Facteur de temps à appliquer à la simulation pour ce pas. */
export function timeScaleFor(state: JuiceState, dtMs: number): number {
  if (state.hitstopRemaining > 0) {
    state.hitstopRemaining -= dtMs
    return 0
  }
  if (state.deathSlowmoRemaining > 0) {
    state.deathSlowmoRemaining -= dtMs
    return DEATH_SLOWMO_SCALE
  }
  return 1
}
