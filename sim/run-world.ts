import { resetEntityAllocator } from './reset'
import { spawnPlayer } from './spawn'
import { type Arena, createWorld, type SimWorld } from './world'

/**
 * Le monde d'une partie : allocateur remis à zéro, monde créé, joueur posé —
 * dans cet ordre, en un seul appel.
 *
 * **La seule porte d'entrée**, et c'est le point. bitECS alloue les `eid`
 * depuis un compteur global au processus et recycle les identifiants libérés
 * dans l'ordre des décès ; l'ordre d'itération des requêtes suit ces `eid`, et
 * assez de systèmes en dépendent — qui meurt en premier quand deux ennemis se
 * chevauchent, qui ramasse un power-up — pour que la trajectoire entière
 * change. Cet état n'est écrit dans aucun replay.
 *
 * Le rejeu serveur repartait d'un allocateur neuf ; le jeu, lui, enchaînait
 * les parties sans jamais le remettre à zéro. **Seule la première partie
 * d'une session était donc vérifiable** : les suivantes étaient refusées en
 * production, avec des messages qui accusaient le replay plutôt que cette
 * asymétrie. Mesuré sur une partie réelle (graine 703692027, 8 382 pas, trois
 * cartes) : allocateur neuf, la vague 1 finit au pas 2476 et le score atteint
 * 6 404 ; avec 1 500 identifiants consommés puis recyclés, la même partie
 * n'atteint aucune fin de vague et meurt à 4 188.
 *
 * Un ordre tenu par un commentaire se rouvre — c'est arrivé ici. D'où cette
 * fonction unique, et la règle `noRestrictedImports` de `biome.json` qui
 * interdit à `front/src/**` d'appeler `createWorld` ou `resetEntityAllocator`
 * directement : le même mécanisme que `recordAndStep` pour l'ordre
 * quantifier/enregistrer/avancer, et qu'`offerUpgrades` pour l'offre de cartes.
 */
export function createRunWorld(options: { seed: number; arena: Arena }): SimWorld {
  resetEntityAllocator()
  const world = createWorld({
    seed: options.seed,
    width: options.arena.width,
    height: options.arena.height,
    rangeScale: options.arena.rangeScale,
  })
  spawnPlayer(world)
  return world
}
