import type { SimWorld } from '@sim/world'

import { ACHIEVEMENTS, type AchievementDef } from './catalog'
import { readUnlocked, unlock } from './store'
import { advanceTrace, createTrace, type RunTrace } from './trace'

export interface Tracker {
  /**
   * Avance la trace et évalue. Rend les succès ouverts à ce pas — y compris
   * ceux de mort : `playerDied` arrive dans les événements du pas courant, il
   * n'y a pas de passe finale à faire après.
   */
  step(world: SimWorld): AchievementDef[]
  reset(spawnX: number, spawnY: number): void
  /** La trace de la partie en cours — `game.ts` y lit les genres rencontrés. */
  readonly trace: RunTrace
}

export function createTracker(): Tracker {
  let trace: RunTrace = createTrace(0, 0)
  /** Ce qui reste à gagner. Un succès acquis n'est plus évalué. */
  let pending: AchievementDef[] = []

  const evaluate = (): AchievementDef[] => {
    const opened: AchievementDef[] = []
    for (const def of pending) {
      if (def.done(trace)) {
        opened.push(def)
      }
    }
    if (opened.length > 0) {
      pending = pending.filter((def) => !opened.includes(def))
      for (const def of opened) {
        // Écrit tout de suite, pas à la fin de la partie : un onglet fermé en
        // pleine partie ne doit rien coûter au joueur.
        unlock(def.id)
      }
    }
    return opened
  }

  return {
    get trace(): RunTrace {
      return trace
    },

    reset(spawnX: number, spawnY: number): void {
      trace = createTrace(spawnX, spawnY)
      const unlocked = readUnlocked()
      pending = ACHIEVEMENTS.filter((def) => !unlocked.has(def.id))
    },

    step(world: SimWorld): AchievementDef[] {
      advanceTrace(trace, world)
      return evaluate()
    },
  }
}
