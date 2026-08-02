import { addComponent, addEntity, defineQuery, hasComponent, removeEntity } from 'bitecs'

import { Doomed, Enemy, Hazard, Lifetime, Position, Velocity } from '../components'
import { ENEMIES, ENEMY_TYPE_BY_ID } from '../data/enemies'
import { HAZARD_INK_TRAIL, RULE_TUNING } from '../data/powerups'
import { spawnEnemy } from '../spawn'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'

const doomed = defineQuery([Doomed])

/**
 * La tache de « Le papier boit ». Réutilise `HAZARD_INK_TRAIL`, le genre créé
 * pour la trace de la Bavure : une tache d'encre mortelle est exactement la
 * même chose, avec d'autres réglages, et le rendu n'a pas à savoir qui l'a
 * semée.
 *
 * Pas de `PrevPosition` : la tache ne bouge pas, et `stage.ts` n'interpole que
 * ce qui en porte.
 */
function spawnInkStain(world: SimWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = HAZARD_INK_TRAIL
  Hazard.radius[eid] = RULE_TUNING.thirstyPaper.radius
  Hazard.maxRadius[eid] = RULE_TUNING.thirstyPaper.radius
  // Zéro : `hazardSystem` fait grossir le rayon dès que `growthRate` est positif.
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = RULE_TUNING.thirstyPaper.lifeMs
  return eid
}

/**
 * Applique les morts marquées pendant le pas. Passe unique et différée :
 * supprimer une entité au milieu d'une itération de requête invaliderait
 * les autres systèmes du même pas.
 *
 * `stats` est optionnel comme pour `hazardSystem` : la trentaine d'appels de
 * test qui n'éprouvent que la suppression n'ont rien à monter pour cela. En
 * jeu, `step.ts` le passe toujours — sans quoi « Le papier boit » serait inerte.
 */
export function deathSystem(world: SimWorld, stats?: RunStats): SimWorld {
  const thirstyPaper = stats?.rules.has('thirstyPaper') ?? false
  for (const eid of doomed(world)) {
    const x = Position.x[eid] ?? 0
    const y = Position.y[eid] ?? 0

    if (hasComponent(world, Enemy, eid)) {
      const type = ENEMY_TYPE_BY_ID[Enemy.type[eid] ?? 0] ?? 'point'
      const split = ENEMIES[type].splitsInto

      world.events.push({ type: 'enemyKilled', eid, x, y })

      // « Le papier boit », posée ici et nulle part ailleurs : c'est le seul
      // endroit qui connaît TOUTES les morts, quelle qu'en soit la cause —
      // zone, sillage de Ruée, noyau de Buvard, ou une autre tache. La poser
      // dans `hazardSystem` en manquerait la moitié.
      //
      // **La cascade est assumée** : une tache tue un voisin, qui laisse la
      // sienne, qui en tue un autre. C'est le comportement voulu — les grappes
      // deviennent des réactions en chaîne. Elle est bornée par le nombre
      // d'ennemis vivants et ne peut donc pas s'emballer : chaque maillon
      // consomme un ennemi, et rien n'en fait naître. Le maillon suivant
      // attend d'ailleurs le pas d'après (`hazardSystem` tourne avant
      // `deathSystem`), la chaîne se déroule donc image par image, jamais
      // d'un coup. Ni plafond ni compteur de génération, volontairement :
      // les brider retirerait à la carte ce qui la rend mythique.
      if (thirstyPaper) {
        spawnInkStain(world, x, y)
      }

      if (split) {
        const vx = Velocity.x[eid] ?? 0
        const vy = Velocity.y[eid] ?? 0
        // L'ordre et la vitesse des enfants ne dépendent que de l'état du
        // parent (x, y, vx, vy, count) : aucune itération de Set/Map ni
        // aucun aléa n'entre ici, condition nécessaire au déterminisme.
        for (let i = 0; i < split.count; i++) {
          const angle = (i / split.count) * Math.PI * 2
          const child = spawnEnemy(world, {
            type: split.type,
            x: x + Math.cos(angle) * 18,
            y: y + Math.sin(angle) * 18,
            materializeMs: 0,
          })
          // Les enfants héritent d'une partie de l'élan du parent (spec §3.3).
          Velocity.x[child] = vx * 0.5 + Math.cos(angle) * 60
          Velocity.y[child] = vy * 0.5 + Math.sin(angle) * 60
        }
      }
    }

    removeEntity(world, eid)
  }

  return world
}
