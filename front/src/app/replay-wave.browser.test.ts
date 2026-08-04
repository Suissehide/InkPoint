import { Enemy, Position } from '@sim/components'
import { recordAndStep } from '@sim/replay/record-and-step'
import { replayRun } from '@sim/replay/run'
import { createRunWorld } from '@sim/run-world'
import { offerUpgrades } from '@sim/upgrades/offer'
import { createRunProgress, takeUpgrade } from '@sim/upgrades/progress'
import { createRunStats } from '@sim/upgrades/stats'
import { ARENA, type SimWorld } from '@sim/world'
import * as bitecs from 'bitecs'
import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { createReplayRecorder } from './replay-recorder'

const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }
const enemies = defineQuery([Enemy])

/**
 * La graine qui débloque le chemin des cartes, et pourquoi il a fallu la chercher.
 *
 * Le joueur n'a **aucune arme permanente** : il ne tue qu'en ramassant un power-up, et
 * une vague se termine sur un minuteur de 40 s (`WAVE_DURATION_MS`), soit 2 400 pas.
 * Une politique d'entrées scriptée doit donc *survivre* 40 secondes pour qu'une seule
 * carte soit proposée — ce qu'aucune n'avait réussi jusqu'ici : les notes du chantier
 * mesuraient 810 pas au mieux, et une répulsion pondérée plafonne encore à 1 761.
 *
 * Sur 80 graines balayées avec la politique ci-dessous, **une seule** franchit le cap :
 * la 17, à 2 428 pas. Tout le chemin des cartes — l'offre reproduite des deux côtés, le
 * pas auquel un choix est rattaché, le décompte choix/fins de vague — tenait donc sur
 * une vérification humaine avant ce test.
 */
const SEED_WITH_WAVE_END = 17

/** Répulsion pondérée par la distance, plus répulsion des murs : ne tue rien, esquive. */
function dodge(world: SimWorld): void {
  const px = Position.x[world.playerEid] ?? 0
  const py = Position.y[world.playerEid] ?? 0
  let fx = 0
  let fy = 0
  for (const eid of enemies(world)) {
    const dx = px - (Position.x[eid] ?? 0)
    const dy = py - (Position.y[eid] ?? 0)
    const d2 = dx * dx + dy * dy
    if (d2 < 1 || d2 > 320 * 320) {
      continue
    }
    const w = 1 / d2
    fx += dx * w
    fy += dy * w
  }
  const wall = 90
  const { width, height } = world.arena
  fx += (1 / Math.max(px, 1) - 1 / Math.max(width - px, 1)) * wall
  fy += (1 / Math.max(py, 1) - 1 / Math.max(height - py, 1)) * wall
  const len = Math.hypot(fx, fy)
  world.input.moveX = len > 0 ? fx / len : 0
  world.input.moveY = len > 0 ? fy / len : 0
  world.input.speedCap = 1
  // Pas de `quantizeInput` ici : `recordAndStep` s'en charge, et l'importer
  // depuis `front/` est interdit par `biome.json` — c'est le garde qui empêche
  // de reconstituer à la main l'ordre quantifier/enregistrer/avancer.
}

describe('replay d’une partie qui prend une carte', () => {
  it('se rejoue à l’identique, choix compris', () => {
    resetGlobals()
    const world = createRunWorld({ seed: SEED_WITH_WAVE_END, arena: ARENA })
    const stats = createRunStats(ARENA.rangeScale)
    const progress = createRunProgress()
    const recorder = createReplayRecorder(SEED_WITH_WAVE_END, 0)

    let choices = 0
    let steps = 0
    for (; steps < 6000 && world.alive; steps++) {
      dodge(world)
      // Le chemin de `game.ts` : quantifier, enregistrer, avancer — en un appel.
      recordAndStep(recorder, world, stats, progress)
      // Puis ce que fait `handleSimEvents` : l'offre est tirée du même point
      // d'entrée partagé que le rejeu, et le choix rattaché au pas courant.
      for (const event of world.events) {
        if (event.type !== 'waveEnded') {
          continue
        }
        const cards = offerUpgrades(SEED_WITH_WAVE_END, event.wave, progress)
        const card = cards[0]
        if (card === undefined) {
          throw new Error('offre vide : le tirage doit toujours proposer au moins une carte')
        }
        recorder.choose(0)
        takeUpgrade(card, stats, progress)
        choices += 1
      }
    }

    // La garde de la garde : sans fin de vague atteinte, ce test ne prouverait
    // rien de plus que ceux qui existaient déjà.
    expect(choices).toBeGreaterThan(0)
    expect(world.alive).toBe(false)

    const verified = replayRun(recorder.build(), { maxSteps: 72_000 })
    expect(verified.score).toBe(world.score)
    expect(verified.wave).toBe(world.wave)
    expect(verified.steps).toBe(steps)
    expect(verified.alive).toBe(false)
  }, 120000)
})
