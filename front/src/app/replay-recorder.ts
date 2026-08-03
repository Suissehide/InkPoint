import { INPUT_FIELDS, type InputState, QUANTUM } from '@sim/input'
import { type CardChoice, encodeReplay, type Replay } from '@sim/replay/format'
import { SIM_VERSION } from '@sim/version.generated'
import type { ArenaId } from '@sim/world'

/**
 * Accumule de quoi rejouer la partie en cours : la graine, l'id de l'arène
 * choisie (`sim/world.ts`, `ARENA_BY_ID`), un couple d'entiers par pas, et les
 * cartes choisies.
 *
 * L'id vient de `game.ts`, déjà résolu depuis `coarsePointer` — ce module ne
 * regarde jamais lui-même de quelle arène il s'agit : il ne fait qu'observer
 * la partie et ne doit jamais écrire dans le monde (voir l'appel dans
 * `game.ts`).
 *
 * Les entrées sont déjà sur la grille `1/128` quand elles arrivent ici
 * (`app/mouse.ts`), donc `round(v / QUANTUM)` est une conversion exacte et non
 * une quantification : le jeu ne change pas d'un iota parce qu'on enregistre.
 *
 * Tourne **toujours**, y compris en production : le tableau `inputs` tient en
 * mémoire un `number` par champ d'`InputState` et par pas — à 60 Hz sur dix
 * minutes (36 000 pas) et deux champs, 36 000 × 2 × 8 octets ≈ 576 Ko (un
 * `number` JS occupe 8 octets, contrairement à l'entier encodé qui, lui,
 * tient sur 2 — voir `sim/replay/format.ts`). Toujours négligeable, mais
 * 4× le chiffre qu'affichait cette docstring (144 Ko, celui de
 * l'*encodage*, pas de ce tableau) — et c'est justement le chiffre qui
 * justifie de tourner en production qu'il faut avoir juste. Seul le
 * *téléchargement* est réservé au développement.
 */
export interface ReplayRecorder {
  /** À appeler juste après `writeInto` et avant `stepWorld`. */
  step(input: InputState): void
  choose(index: number): void
  reset(seed: number, arenaId: ArenaId): void
  build(): Replay
}

export function createReplayRecorder(seed: number, arenaId: ArenaId): ReplayRecorder {
  let currentSeed = seed
  let currentArenaId = arenaId
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
    reset(nextSeed: number, nextArenaId: ArenaId): void {
      currentSeed = nextSeed
      currentArenaId = nextArenaId
      inputs = []
      choices = []
    },
    build(): Replay {
      return {
        simVersion: SIM_VERSION,
        seed: currentSeed,
        arenaId: currentArenaId,
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
