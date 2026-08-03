import * as bitecs from 'bitecs'

import { INPUT_FIELDS, QUANTUM } from '../input'
import { spawnPlayer } from '../spawn'
import { offerUpgrades } from '../upgrades/offer'
import { createRunProgress, takeUpgrade } from '../upgrades/progress'
import { createRunStats } from '../upgrades/stats'
import { SIM_VERSION } from '../version.generated'
import { arenaById, createWorld } from '../world'
import type { Replay } from './format'
import { stepAndAbsorb } from './step-with-progress'

/**
 * bitECS alloue les `eid` depuis un compteur **global au module**, ce que ses
 * propres types ne déclarent pas mais que son build JS exporte.
 *
 * L'effet ne se voit **pas** forcément sur le *score* d'un rejeu isolé : mesuré
 * en interne, deux replays différents à la suite, avec et sans l'appel,
 * rendent le même score — le décalage des `eid` ne perturbe rien dans ce
 * chemin de calcul précis. Il se voit en revanche sur les `eid` eux-mêmes
 * (`run.reset.test.ts` le pingle : sans cet appel, un second rejeu hérite du
 * compteur laissé par le premier). Ce que la remise à zéro évite d'abord,
 * c'est la fuite : sans elle, le compteur ne redescend jamais, et un serveur
 * de vérification qui tourne longtemps (un processus qui rejoue des scores un
 * par un, sans jamais redémarrer) verrait ses tableaux internes bitECS
 * grossir sans fin au fil des replays. `resetGlobals` borne ce compteur à
 * chaque entrée dans `replayRun`, jamais une seule fois au chargement du
 * module.
 *
 * **Conséquence pour l'étape 3 : `replayRun` n'est pas réentrant.** Ce compteur
 * est global au *processus*, pas à l'appel : `resetGlobals` remet aussi à zéro
 * `removed` et `recycled`, et détruirait donc tout autre monde bitECS vivant
 * dans le même processus. Les appels séquentiels ne sont sûrs aujourd'hui que
 * parce qu'il n'y a aucun `await` dans la boucle de rejeu. Le premier qu'on y
 * ajoutera — remontée de progression, streaming, un `yield` pour ne pas bloquer
 * la boucle d'événements — fera se corrompre deux rejeux entrelacés, sans que
 * rien ne le signale. « Un rejeu à la fois par processus » est une contrainte
 * d'ingestion du worker de vérification, pas un détail d'implémentation.
 */
const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

export interface ReplayResult {
  score: number
  wave: number
  steps: number
  alive: boolean
}

/**
 * Refus diagnostiqué par le rejeu, par opposition à une panne : le serveur en
 * fait un `422`, alors qu'un bug de simulation — une exception qui échappe à
 * `offerUpgrades`, une assertion bitECS, un `TypeError` sans rapport — doit
 * rester un `500`. `verify.ts` ne reclasse que cette classe en `Refusal` et
 * laisse tout le reste remonter tel quel : distinguer par le *type* de l'erreur,
 * jamais en cherchant un mot dans son message, qui se romprait en silence à la
 * moindre reformulation.
 */
export class ReplayRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReplayRejected'
  }
}

export interface ReplayOptions {
  /**
   * Nombre de pas au-delà duquel le replay est refusé.
   *
   * Requis, jamais optionnel avec une valeur par défaut : 4 octets d'entrée
   * achètent un pas complet de simulation, soit une amplification de l'ordre
   * du million. Un envoi de 100 Mo vaudrait 25 millions de pas, c'est-à-dire
   * des heures de calcul. Une valeur par défaut se contournerait en oubliant
   * l'argument ; un argument requis ne s'oublie pas.
   */
  maxSteps: number
}

export function replayRun(replay: Replay, options: ReplayOptions): ReplayResult {
  if (replay.simVersion !== SIM_VERSION) {
    throw new ReplayRejected(
      `replay enregistré sous la version ${replay.simVersion}, ` +
        `simulation actuelle ${SIM_VERSION} — rejeu impossible`,
    )
  }
  // `decodeReplay` ne peut pas produire un id inconnu (elle refuse déjà), mais
  // `replayRun` est le point d'entrée exposé au serveur : un `Replay`
  // reconstruit à la main depuis du JSON y arrive directement, comme pour
  // `steps` plus bas. Refuser ici plutôt que de retomber sur une arène par
  // défaut, qui rejouerait en silence sur une arène différente de celle
  // réellement soumise.
  const arena = arenaById(replay.arenaId)
  if (arena === undefined) {
    throw new ReplayRejected(
      `id d'arène ${replay.arenaId} inconnu de ARENA_BY_ID — rejeu impossible`,
    )
  }

  resetGlobals()
  const world = createWorld({
    seed: replay.seed,
    width: arena.width,
    height: arena.height,
    rangeScale: arena.rangeScale,
  })
  spawnPlayer(world)
  const stats = createRunStats()
  const progress = createRunProgress()

  const steps = replay.inputs.length / INPUT_FIELDS.length
  // `decodeReplay` ne peut pas produire ce cas (son en-tête porte `steps` déjà
  // entier), mais `replayRun` est le point d'entrée exposé au serveur : un
  // `Replay` reconstruit à la main depuis du JSON — ou une longueur d'`inputs`
  // corrompue en route — y arrive directement. Sans ce garde-fou, `steps`
  // fractionnaire fait lire `replay.inputs` au-delà de sa fin (`undefined`),
  // et `undefined! * QUANTUM` écrit un `NaN` silencieux dans `world.input` :
  // mesuré, un `ReplayResult` du genre `{ score: 0.91…, steps: 10.5, alive:
  // true }`, sans la moindre erreur.
  if (!Number.isInteger(steps)) {
    throw new ReplayRejected(
      `${replay.inputs.length} entrées n’est pas un multiple de ${INPUT_FIELDS.length} ` +
        '(INPUT_FIELDS.length) — nombre de pas non entier',
    )
  }

  // Refusé **avant** la boucle : le nombre de pas est dans l'en-tête, donc le
  // plafond se contrôle sans avoir dépensé une milliseconde de simulation.
  if (steps > options.maxSteps) {
    throw new ReplayRejected(`replay de ${steps} pas au-delà du plafond de ${options.maxSteps} pas`)
  }

  let nextChoice = 0

  for (let i = 0; i < steps; i++) {
    // Tous les champs d'`InputState`, dans l'ordre d'`INPUT_FIELDS` : le jour où
    // le chantier du manche virtuel ajoute `speedCap`, cette boucle le rejoue
    // sans qu'on ait à y revenir.
    for (let f = 0; f < INPUT_FIELDS.length; f++) {
      world.input[INPUT_FIELDS[f]!] = replay.inputs[i * INPUT_FIELDS.length + f]! * QUANTUM
    }
    // `stepWorld` puis `absorbEvents`, jamais l'inverse : voir la docstring
    // de `stepAndAbsorb` (sim/replay/step-with-progress.ts), qui tient
    // désormais cette paire pour `game.ts` autant que pour `replayRun`.
    stepAndAbsorb(world, stats, progress)

    for (const event of world.events) {
      if (event.type !== 'waveEnded') {
        continue
      }
      const choice = replay.choices[nextChoice]
      if (choice === undefined) {
        throw new ReplayRejected(`vague ${event.wave} terminée au pas ${i} sans choix enregistré`)
      }
      if (choice.step !== i) {
        throw new ReplayRejected(
          `choix ${nextChoice} annoncé au pas ${choice.step}, vague terminée au pas ${i}`,
        )
      }
      const cards = offerUpgrades(replay.seed, event.wave, progress)
      const card = cards[choice.index]
      if (card === undefined) {
        throw new ReplayRejected(
          `indice ${choice.index} hors des ${cards.length} cartes proposées à la vague ${event.wave}`,
        )
      }
      takeUpgrade(card, stats, progress)
      nextChoice++
    }
  }

  if (nextChoice !== replay.choices.length) {
    throw new ReplayRejected(
      `${replay.choices.length} choix enregistrés, ${nextChoice} fins de vague rencontrées`,
    )
  }

  return { score: world.score, wave: world.wave, steps, alive: world.alive }
}
