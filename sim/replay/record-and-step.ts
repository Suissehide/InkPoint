import { type InputState, quantizeInput } from '../input'
import type { RunProgress } from '../upgrades/progress'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'
import { stepAndAbsorb } from './step-with-progress'

/**
 * Ce que `recordAndStep` demande à un enregistreur : la seule méthode qu'elle
 * appelle. Une interface structurelle, et non le `ReplayRecorder` concret de
 * `front/src/app/replay-recorder.ts` — `sim/` ne connaît pas `app/` (voir
 * `noRestrictedImports`, `biome.json`) — mais le `ReplayRecorder` du jeu la
 * satisfait déjà par sa seule forme, sans import ni conversion.
 */
export interface StepRecorder {
  step(input: InputState): void
}

/**
 * Quantifie, enregistre, avance — dans CET ordre, en un seul appel.
 *
 * La tâche 5 a cherché à prouver qu'inverser `recorder.step` et l'avancée de
 * la simulation casse un rejeu, et n'a trouvé aucun test capable de le voir :
 * `world.input` n'est jamais réécrit par `stepWorld`/`absorbEvents` (balayage
 * de `sim/` confirmé), donc `recorder.step` capture la même valeur avant ou
 * après. Le défaut ne vit pas là — il vit dans `recorder.choose`
 * (`front/src/app/replay-recorder.ts`), qui rattache un choix de carte au
 * DERNIER pas enregistré (`inputs.length / INPUT_FIELDS.length - 1`).
 * Enregistrer après avoir avancé décale cet indice d'un cran, et `replayRun`
 * refuse alors le replay entier avec « choix annoncé au pas X, vague
 * terminée au pas Y ». Un échec net — mais seulement sur une run qui atteint
 * une fin de vague, et aucune run scriptée du dépôt n'y arrive (810 pas au
 * plus sur 60 graines, contre environ 2400 pour finir la vague 1). Rien
 * n'aurait donc jamais rougi si cet ordre se rouvrait à l'appel — c'est
 * exactement le trou que `stepAndAbsorb` a déjà fermé pour la paire
 * `stepWorld`/`absorbEvents`, et qu'`offerUpgrades` a fermé pour l'offre de
 * cartes : un seul point d'appel, plutôt qu'un ordre tenu par un commentaire.
 *
 * L'entrée doit aussi être QUANTIFIÉE avant l'enregistrement, et pas
 * seulement avant l'avancée : la tâche 5 l'a éprouvé (falsification 2) — sans
 * `quantizeInput`, la simulation directe consomme la valeur brute mais
 * `recorder.step` arrondit quand même à l'enregistrement, donc le rejeu
 * consomme une trajectoire différente de celle réellement jouée.
 *
 * Vit dans `sim/` et non à côté de `createReplayRecorder`
 * (`front/src/app/replay-recorder.ts`) : `stepAndAbsorb` ne devient
 * réellement obligatoire, côté jeu, qu'en interdisant l'import direct de
 * `@sim/step` depuis `front/src/**` (`noRestrictedImports`, `biome.json`) —
 * le même mécanisme ferme ici l'accès direct à `quantizeInput`
 * (`@sim/input`) et à `stepAndAbsorb` (`@sim/replay/step-with-progress`)
 * depuis `front/`, ce qui n'est possible que si cette fonction vit du côté
 * `sim/` de cette frontière de lint.
 */
export function recordAndStep(
  recorder: StepRecorder,
  world: SimWorld,
  stats: RunStats,
  progress: RunProgress,
): void {
  quantizeInput(world.input)
  recorder.step(world.input)
  stepAndAbsorb(world, stats, progress)
}
