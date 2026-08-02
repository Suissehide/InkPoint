import { FIXED_DT, type SimWorld } from '../world'

/** Durée du gel d'image sur un kill. */
export const HITSTOP_MS = 60

/**
 * Cadence minimale entre deux gels, mesurée depuis le déclenchement du
 * précédent. Sans elle une vague dense hacherait l'image en continu.
 */
export const HITSTOP_CADENCE_MS = 200

/**
 * Écrit `world.timeScale` pour ce pas, à partir des kills du pas précédent.
 *
 * Il doit tourner **avant** la purge de `world.events` en tête de `stepWorld`.
 * Ce décalage d'un pas n'est pas un défaut : c'est exactement le comportement
 * qu'avait `game.ts`, qui appelait `timeScaleFor(juice, FIXED_DT)` avant
 * `stepWorld` et lisait donc les événements déjà émis. Le déplacer après la
 * purge ferait gagner un pas au gel et déplacerait l'équilibrage.
 */
export function hitstopSystem(world: SimWorld): void {
  // Décompte indépendant de l'état du gel : mesuré en temps de pas et non en
  // temps simulé, sinon il ne s'écoulerait jamais tant qu'un gel est actif —
  // `timeScale` valant zéro, le temps simulé est à l'arrêt.
  if (world.hitstopCooldownRemaining > 0) {
    world.hitstopCooldownRemaining -= FIXED_DT
  }
  if (world.hitstopRemaining > 0) {
    world.hitstopRemaining -= FIXED_DT
  }

  let kills = 0
  for (const event of world.events) {
    if (event.type === 'enemyKilled') {
      kills++
    }
  }

  // Le plancher de cadence ne s'applique qu'au déclenchement, jamais à un kill
  // isolé : un kill pendant le refroidissement ne fait rien, il ne repousse pas
  // non plus l'échéance.
  if (kills > 0 && world.hitstopCooldownRemaining <= 0) {
    world.hitstopRemaining = HITSTOP_MS
    world.hitstopCooldownRemaining = HITSTOP_CADENCE_MS
  }

  world.timeScale = world.hitstopRemaining > 0 ? 0 : 1
}
