import * as bitecs from 'bitecs'
import { describe, expect, it, vi } from 'vitest'

/**
 * `bitecs.resetGlobals` est remplacé par un espion qui appelle quand même la
 * vraie fonction (`vi.fn(actual.resetGlobals)`) : la remise à zéro doit
 * continuer à avoir lieu, seul le nombre d'appels nous intéresse ici.
 *
 * Fichier Node uniquement — voir l'exclusion dans `vitest.browser.config.ts` :
 * `vi.mock` sur un module tiers (`bitecs`) n'est pas intercepté sous le
 * lanceur navigateur de cette configuration (Vitest 2.1, mode navigateur) ;
 * mesuré, la fabrique du mock n'est jamais atteinte et `bitecs.resetGlobals`
 * reste la vraie fonction, sans `.mockClear`. La propriété comportementale que
 * `resetGlobals` doit garantir (deux replays différents ne se contaminent
 * pas) est testée ailleurs, dans `run.reset.test.ts`, sans mock — et tourne
 * donc dans les trois moteurs.
 */
vi.mock('bitecs', async (importOriginal) => {
  // `resetGlobals` existe dans le module bitECS chargé mais pas dans ses types
  // publiés — même situation que le cast de `run.ts`.
  const actual = (await importOriginal()) as unknown as { resetGlobals: () => void }
  return { ...actual, resetGlobals: vi.fn(actual.resetGlobals) }
})

import { createRng } from '../rng'
import { SIM_VERSION } from '../version.generated'
import type { Replay } from './format'
import { replayRun } from './run'

const { resetGlobals } = bitecs as unknown as { resetGlobals: ReturnType<typeof vi.fn> }

function buildReplay(seed: number, steps: number): Replay {
  const rng = createRng(seed)
  const inputs = new Int16Array(steps * 2)
  for (let i = 0; i < inputs.length; i++) {
    inputs[i] = Math.round(rng.range(-1, 1) * 128)
  }
  return { simVersion: SIM_VERSION, seed, inputs, choices: [] }
}

describe('remise à zéro de bitECS entre deux rejeux (espion)', () => {
  it('appelle resetGlobals à chaque replayRun, pas une fois au chargement du module', () => {
    resetGlobals.mockClear()
    replayRun(buildReplay(1, 50))
    replayRun(buildReplay(2, 50))
    // Supprimer l'appel dans `run.ts` fait tomber ce compte à 0 — vérifié
    // manuellement, voir le rapport.
    expect(resetGlobals).toHaveBeenCalledTimes(2)
  })
})
