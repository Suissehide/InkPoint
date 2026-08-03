import { stepWorld } from '../step'
import { absorbEvents, type RunProgress } from '../upgrades/progress'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'

/**
 * `stepWorld` puis `absorbEvents`, et rien entre les deux : la paire que
 * `game.ts` et `replayRun` doivent exécuter dans le même ordre, pour la même
 * raison des deux côtés — un power-up ramassé au pas exact où une vague se
 * termine doit déjà être dans `progress.seenPowerups` quand l'offre de cartes
 * se tire (`onWaveEnded` côté jeu, la boucle de `replayRun` côté rejeu),
 * sans quoi le client et le serveur tirent des cartes différentes pour le
 * même run.
 *
 * Avant ce module, cet ordre n'était tenu que par un commentaire à l'appel
 * (`game.ts`) : rien ne l'empêchait de diverger de celui de `run.ts` au fil
 * d'un futur changement, et rien ne l'aurait détecté — `game.ts` n'est
 * importé que par `main.ts`, n'a pas de test, et n'est atteint par aucun.
 * Partager cette fonction ne suffit pourtant pas à fermer le trou : `stepWorld`
 * et `absorbEvents` restent exportés, donc un futur `game.ts` pourrait les
 * réimporter et rouvrir exactement la même divergence, toujours sans test pour
 * la voir. Ce qui la ferme vraiment est la règle `noRestrictedImports` de
 * `biome.json` qui interdit `@sim/step` et le `absorbEvents` de
 * `@sim/upgrades/progress` depuis `front/src/**` — le même mécanisme que le
 * dépôt emploie déjà pour tenir `render`, `ui`, `app` et `audio` hors de
 * `sim/`. La fonction donne le bon chemin ; la règle de lint supprime l'autre.
 */
export function stepAndAbsorb(world: SimWorld, stats: RunStats, progress: RunProgress): void {
  stepWorld(world, stats)
  absorbEvents(progress, world)
}
