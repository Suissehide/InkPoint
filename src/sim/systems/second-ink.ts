import { addComponent, hasComponent } from 'bitecs'

import { Halo, SecondInkSpent } from '../components'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'

/**
 * Seconde encre : garantit un Halo au joueur tant que la règle est active et
 * n'a pas encore rendu son service. Réutilise le Halo existant (absorbe un
 * coup mortel, tue l'ennemi qui l'a brisé, accorde une seconde d'invulnérabilité).
 *
 * Placé juste après collisionSystem dans stepWorld : seul point où réagir à
 * `haloBroken` la même image, avant que `world.events` ne soit vidé au pas
 * suivant, sans introduire de minuteur séparé qui décalerait d'un pas.
 */
export function secondInkSystem(world: SimWorld, stats: RunStats): SimWorld {
  const player = world.playerEid
  if (player < 0 || !stats.rules.has('secondInk')) {
    return world
  }

  for (const event of world.events) {
    if (event.type === 'haloBroken') {
      // Peu importe l'origine du Halo : la promesse « une fois par run » est
      // tenue dès qu'il absorbe un coup, et ne se renouvelle plus.
      addComponent(world, SecondInkSpent, player)
      break
    }
  }

  if (!hasComponent(world, SecondInkSpent, player) && !hasComponent(world, Halo, player)) {
    addComponent(world, Halo, player)
  }

  return world
}
