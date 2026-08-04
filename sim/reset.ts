import * as bitecs from 'bitecs'

const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

/**
 * Remet à zéro l'allocateur d'entités de bitECS, **avant chaque partie**.
 *
 * bitECS alloue les `eid` depuis un compteur global au PROCESSUS, et recycle
 * les identifiants libérés dans l'ordre des décès. L'état de cet allocateur
 * n'est donc pas le même à la première partie d'une session qu'à la
 * quatrième — et il ne figure nulle part dans un replay.
 *
 * Ce n'est pas une précaution théorique : mesuré sur une partie réelle
 * (graine 703692027, 8 382 pas, 3 cartes), rejouer les mêmes entrées avec un
 * allocateur neuf donne une fin de vague au pas 2476 et 6 404 points ; avec
 * 1 500 identifiants consommés puis recyclés, la même partie n'atteint
 * AUCUNE fin de vague et meurt à 4 188. L'ordre d'itération des requêtes
 * bitECS suit les `eid`, et assez de systèmes en dépendent — qui meurt en
 * premier quand deux ennemis se chevauchent, qui ramasse un power-up — pour
 * que la trajectoire entière change.
 *
 * `replayRun` (`sim/replay/run.ts`) appelle ceci en entrée. Le jeu ne le
 * faisait pas, donc **seule la première partie d'une session se rejouait** :
 * les suivantes étaient refusées par le serveur, en production, avec des
 * messages qui accusaient le replay plutôt que cette asymétrie.
 *
 * Global au processus, donc destructeur pour tout autre monde bitECS vivant :
 * à n'appeler qu'au démarrage d'une partie, quand la précédente est jetée.
 */
export function resetEntityAllocator(): void {
  resetGlobals()
}
