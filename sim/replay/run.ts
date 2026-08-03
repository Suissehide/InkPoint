import * as bitecs from 'bitecs'

import { INPUT_FIELDS, QUANTUM } from '../input'
import { createRng } from '../rng'
import { spawnPlayer } from '../spawn'
import { stepWorld } from '../step'
import { drawUpgrades } from '../upgrades/draw'
import { absorbEvents, createRunProgress, takeUpgrade } from '../upgrades/progress'
import { createRunStats } from '../upgrades/stats'
import { SIM_VERSION } from '../version.generated'
import { ARENA, createWorld } from '../world'
import type { Replay } from './format'

/**
 * bitECS alloue les `eid` depuis un compteur **global au module**, ce que ses
 * propres types ne déclarent pas mais que son build JS exporte. Sans remise à
 * zéro, un second rejeu dans le même processus hérite du compteur du premier et
 * ses `eid` sont décalés — un serveur qui vérifie deux replays de suite
 * calculerait le second de travers.
 */
const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

export interface ReplayResult {
  score: number
  wave: number
  steps: number
  alive: boolean
}

export function replayRun(replay: Replay): ReplayResult {
  if (replay.simVersion !== SIM_VERSION) {
    throw new Error(
      `replay enregistré sous la version ${replay.simVersion}, ` +
        `simulation actuelle ${SIM_VERSION} — rejeu impossible`,
    )
  }

  resetGlobals()
  const world = createWorld({ seed: replay.seed, width: ARENA.width, height: ARENA.height })
  spawnPlayer(world)
  const stats = createRunStats()
  const progress = createRunProgress()

  const steps = replay.inputs.length / INPUT_FIELDS.length
  let nextChoice = 0

  for (let i = 0; i < steps; i++) {
    // Tous les champs d'`InputState`, dans l'ordre d'`INPUT_FIELDS` : le jour où
    // le chantier du manche virtuel ajoute `speedCap`, cette boucle le rejoue
    // sans qu'on ait à y revenir.
    for (let f = 0; f < INPUT_FIELDS.length; f++) {
      world.input[INPUT_FIELDS[f]!] = replay.inputs[i * INPUT_FIELDS.length + f]! * QUANTUM
    }
    stepWorld(world, stats)
    absorbEvents(progress, world)

    for (const event of world.events) {
      if (event.type !== 'waveEnded') {
        continue
      }
      const choice = replay.choices[nextChoice]
      if (choice === undefined) {
        throw new Error(`vague ${event.wave} terminée au pas ${i} sans choix enregistré`)
      }
      if (choice.step !== i) {
        throw new Error(
          `choix ${nextChoice} annoncé au pas ${choice.step}, vague terminée au pas ${i}`,
        )
      }
      const cards = drawUpgrades(createRng(replay.seed + event.wave), {
        wave: event.wave,
        ownedIds: progress.ownedIds,
        mythicTaken: progress.mythicTaken,
        seenPowerups: progress.seenPowerups,
      })
      const card = cards[choice.index]
      if (card === undefined) {
        throw new Error(
          `indice ${choice.index} hors des ${cards.length} cartes proposées à la vague ${event.wave}`,
        )
      }
      takeUpgrade(card, stats, progress)
      nextChoice++
    }
  }

  if (nextChoice !== replay.choices.length) {
    throw new Error(
      `${replay.choices.length} choix enregistrés, ${nextChoice} fins de vague rencontrées`,
    )
  }

  return { score: world.score, wave: world.wave, steps, alive: world.alive }
}
