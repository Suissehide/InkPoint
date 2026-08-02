import { addComponent, addEntity, defineQuery } from 'bitecs'

import { DelayedPowerUp, Doomed, Position } from '../components'
import { POWERUP_BY_ID, RULE_TUNING } from '../data/powerups'
import { activatePowerUp } from '../powerups/activate'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * « Double trait » : chaque power-up ramassé se déclenche une seconde fois,
 * `delayMs` plus tard, **à la position du joueur à cet instant**.
 *
 * C'est ce décalage qui fait la carte, et non le doublement : la première salve
 * tombe où l'on était, la seconde où l'on va. Une Bombe devient deux Bombes qui
 * se recouvrent à moitié, une Bavure part dans une autre direction. Rejouer la
 * seconde au point de ramassage donnerait deux zones parfaitement confondues —
 * un simple « ×2 » de dégâts, sans rien à jouer entre les deux.
 *
 * La carte améliore **tout** le sac, y compris les power-ups qu'on trouvera
 * plus tard : elle n'ajoute pas un effet, elle change la règle du ramassage.
 */

const pending = defineQuery([DelayedPowerUp])

/**
 * Programme la seconde salve. **Seul `pickupSystem` doit appeler cette
 * fonction.**
 *
 * C'est la garde anti-récursion, et elle est structurelle : `activatePowerUp`
 * n'en programme jamais, donc la salve déclenchée ici ne peut pas en programmer
 * une troisième. Déplacer l'appel dans `activatePowerUp` — ou en ajouter un
 * ci-dessous — ferait doubler indéfiniment le nombre de salves toutes les
 * 400 ms, une bombe à retardement au sens propre. `delayed-powerup.test.ts`
 * monte la garde sur ce point précis.
 */
export function scheduleDelayedPowerUp(world: SimWorld, kind: number): number {
  const eid = addEntity(world)
  addComponent(world, DelayedPowerUp, eid)
  DelayedPowerUp.kind[eid] = kind
  DelayedPowerUp.remaining[eid] = RULE_TUNING.doubleStroke.delayMs
  return eid
}

/**
 * Placé **juste avant `pickupSystem`** dans `step.ts` : la seconde activation
 * traverse ainsi exactement les mêmes systèmes que la première, dans le même
 * pas — `hazardSystem`, `freezeSystem`, `collisionSystem` la voient au même
 * point de l'ordre. Après `pickupSystem`, une zone posée par une seconde salve
 * attendrait le pas suivant pour être éprouvée, et deux Bombes issues du même
 * ramassage n'auraient pas la même latence.
 */
export function delayedPowerUpSystem(world: SimWorld, stats: RunStats): SimWorld {
  // Comme `pickupSystem` : un joueur mort ne déclenche rien. Sans cette garde,
  // la salve en attente poserait une zone sur un cadavre après l'écran de fin.
  if (!world.alive || world.playerEid < 0) {
    return world
  }

  const dt = FIXED_DT * world.timeScale

  // Photographie fixe : `activatePowerUp` crée des entités, et bitECS rend le
  // tableau interne de la requête. Même précaution que `ricochetSystem`.
  for (const eid of [...pending(world)]) {
    const remaining = DelayedPowerUp.remaining[eid]! - dt
    if (remaining > 0) {
      DelayedPowerUp.remaining[eid] = remaining
      continue
    }

    const kind = POWERUP_BY_ID[DelayedPowerUp.kind[eid]!]
    if (kind) {
      // La position du joueur MAINTENANT, jamais celle du ramassage — c'est
      // tout l'intérêt de la carte. Elle n'est d'ailleurs stockée nulle part :
      // l'entité en attente ne porte pas de `Position`, précisément pour qu'il
      // n'y ait rien à lire par erreur.
      activatePowerUp(
        world,
        kind,
        stats,
        Position.x[world.playerEid]!,
        Position.y[world.playerEid]!,
      )
    }
    // Marquée plutôt que supprimée sur place : `deathSystem` applique les morts
    // en une passe, en fin de pas, sans invalider les requêtes en cours.
    addComponent(world, Doomed, eid)
  }

  return world
}
