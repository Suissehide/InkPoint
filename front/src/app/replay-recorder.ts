import { INPUT_FIELDS, type InputState, QUANTUM } from '@sim/input'
import { type CardChoice, encodeReplay, type Replay } from '@sim/replay/format'
import { SIM_VERSION } from '@sim/version.generated'

/**
 * Accumule de quoi rejouer la partie en cours : la graine, un couple d'entiers
 * par pas, et les cartes choisies.
 *
 * Les entrées sont déjà sur la grille `1/128` quand elles arrivent ici
 * (`app/mouse.ts`), donc `round(v / QUANTUM)` est une conversion exacte et non
 * une quantification : le jeu ne change pas d'un iota parce qu'on enregistre.
 *
 * Tourne **toujours**, y compris en production : 144 Ko en mémoire pour dix
 * minutes est sans conséquence, et l'étape 3 aura besoin du replay de n'importe
 * quelle partie. Seul le *téléchargement* est réservé au développement.
 */
export interface ReplayRecorder {
  /** À appeler juste après `writeInto` et avant `stepWorld`. */
  step(input: InputState): void
  choose(index: number): void
  reset(seed: number): void
  build(): Replay
}

export function createReplayRecorder(seed: number): ReplayRecorder {
  let currentSeed = seed
  let inputs: number[] = []
  let choices: CardChoice[] = []

  return {
    step(input: InputState): void {
      // Itère `INPUT_FIELDS` plutôt que de nommer les champs : un champ ajouté à
      // `InputState` est enregistré sans qu'on touche ici.
      for (const field of INPUT_FIELDS) {
        inputs.push(Math.round(input[field] / QUANTUM))
      }
    },
    choose(index: number): void {
      // Rattaché au dernier pas joué : la vague s'est terminée pendant lui, le
      // choix vient après. C'est ce pas que `replayRun` recoupe.
      choices.push({ step: inputs.length / INPUT_FIELDS.length - 1, index })
    },
    reset(nextSeed: number): void {
      currentSeed = nextSeed
      inputs = []
      choices = []
    },
    build(): Replay {
      return {
        simVersion: SIM_VERSION,
        seed: currentSeed,
        inputs: Int16Array.from(inputs),
        choices: [...choices],
      }
    },
  }
}

/**
 * Écrit le replay dans les téléchargements. Réservé au développement : en
 * production le fichier partira au serveur (étape 3), pas sur le disque.
 */
export async function downloadReplay(replay: Replay): Promise<void> {
  const bytes = encodeReplay(replay)
  const gzipped = await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer()
  const url = URL.createObjectURL(new Blob([gzipped], { type: 'application/gzip' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `partie-${replay.seed}.bin`
  link.click()
  URL.revokeObjectURL(url)
}
