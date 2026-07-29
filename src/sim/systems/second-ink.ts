import { addComponent, hasComponent } from 'bitecs'

import { Halo, SecondInkSpent } from '../components'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'

/**
 * Seconde encre : garantit un Halo au joueur tant que la règle est active et
 * n'a pas encore rendu son service. Pas de nouveau mécanisme — le Halo existe
 * déjà (power-up, Task 11) et absorbe un coup mortel, tue l'ennemi qui l'a
 * brisé et accorde une seconde d'invulnérabilité (collisionSystem).
 *
 * Placé juste après collisionSystem dans stepWorld : c'est le seul système,
 * hormis collisionSystem lui-même, à tourner avant que `world.events` ne soit
 * vidé au pas suivant — donc le seul point où réagir à `haloBroken` la même
 * image sans introduire de minuteur séparé (qui décalerait d'un pas, comme
 * l'a déjà appris le bug de la Plume).
 */
export function secondInkSystem(world: SimWorld, stats: RunStats): SimWorld {
  const player = world.playerEid
  if (player < 0 || !stats.rules.has('secondInk')) {
    return world
  }

  for (const event of world.events) {
    if (event.type === 'haloBroken') {
      // Peu importe que ce Halo précis vienne de cette règle ou d'un vrai
      // ramassage : le joueur a survécu à un coup mortel, la promesse « une
      // fois par run » est tenue. On ne la rend plus jamais dans cette run.
      addComponent(world, SecondInkSpent, player)
      break
    }
  }

  if (!hasComponent(world, SecondInkSpent, player) && !hasComponent(world, Halo, player)) {
    addComponent(world, Halo, player)
  }

  return world
}
