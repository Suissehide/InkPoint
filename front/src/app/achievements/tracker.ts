import type { SimWorld } from '@sim/world'

import { ACHIEVEMENTS, type AchievementDef } from './catalog'
import { nearestActiveEnemyDistance } from './proximity'
import { readUnlocked, unlock } from './store'
import { advanceTrace, createTrace, type RunTrace } from './trace'

/**
 * Cadence de la mesure de proximité, en pas. À 15 Hz, l'écart entre le joueur
 * (240 px/s) et un ennemi (150 px/s au plus) ne peut se réduire que de 26 px
 * entre deux mesures, contre un seuil de 60 px : une approche doit durer moins
 * de 66 ms pour passer entre les mailles, ce qui suppose une trajectoire
 * tangente au bord exact du disque. Limite assumée, et généreuse — au pire un
 * joueur garde un immaculé qu'il a frôlé.
 *
 * Privé au module : la cadence est un détail de `step`, personne au-dehors
 * n'a à la connaître.
 */
const PROXIMITY_EVERY = 4

/** Les deux seuls succès qui dépendent de la mesure de proximité. */
const PROXIMITY_IDS = ['clean-wave', 'clean-three']

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
  /**
   * Vrai tant que `clean-wave` ou `clean-three` reste à acquérir.
   *
   * **Point d'observation de test, assumé comme tel** : aucun appelant de
   * production ne le lit — `step` consulte la fonction locale du même nom.
   * Il est là parce que « la mesure s'arrête quand les deux immaculés sont
   * acquis » est une propriété qu'on veut voir vérifiée, et qui ne se lit
   * autrement qu'en comptant les appels à `nearestActiveEnemyDistance`. La
   * spec §6 l'inscrit d'ailleurs dans l'interface.
   */
  readonly needsProximity: boolean
}

export function createTracker(): Tracker {
  let trace: RunTrace = createTrace(0, 0)
  /** Ce qui reste à gagner. Un succès acquis n'est plus évalué. */
  let pending: AchievementDef[] = []

  /** Fonction locale plutôt que `this` : `step` s'en sert, et un objet
   *  littéral rendu par `createTracker` ne garantit pas son `this` à l'appel. */
  const needsProximity = (): boolean => pending.some((def) => PROXIMITY_IDS.includes(def.id))

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
    get needsProximity(): boolean {
      return needsProximity()
    },

    get trace(): RunTrace {
      return trace
    },

    reset(spawnX: number, spawnY: number): void {
      trace = createTrace(spawnX, spawnY)
      const unlocked = readUnlocked()
      pending = ACHIEVEMENTS.filter((def) => !unlocked.has(def.id))
    },

    step(world: SimWorld): AchievementDef[] {
      const measure = needsProximity() && trace.steps % PROXIMITY_EVERY === 0
      advanceTrace(
        trace,
        world,
        measure ? nearestActiveEnemyDistance(world) : Number.POSITIVE_INFINITY,
      )
      return evaluate()
    },
  }
}
