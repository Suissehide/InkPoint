import { describe, expect, it } from 'vitest'

import { createRng } from '../rng'
import { SIM_VERSION } from '../version.generated'
import type { Replay } from './format'
import { replayRun } from './run'

/**
 * Un replay quelconque, valide — seule sa forme compte pour ces tests, pas son
 * contenu. Les entrées n'ont pas besoin de venir d'une vraie partie : `replayRun`
 * simule lui-même depuis `seed` + `inputs`, quels qu'ils soient.
 */
function buildReplay(seed: number, steps: number): Replay {
  const rng = createRng(seed)
  const inputs = new Int16Array(steps * 2)
  for (let i = 0; i < inputs.length; i++) {
    inputs[i] = Math.round(rng.range(-1, 1) * 128)
  }
  return { simVersion: SIM_VERSION, seed, inputs, choices: [] }
}

describe('remise à zéro de bitECS entre deux rejeux', () => {
  // Le compte d'appels à `resetGlobals` lui-même (Node seulement, `vi.mock`
  // n'atteint pas `bitecs` sous le lanceur navigateur) vit dans
  // `run.reset.spy.test.ts`. Ce test-ci n'a besoin d'aucun mock : il pose
  // directement la propriété que la remise à zéro doit garantir, et tourne
  // donc dans les trois moteurs.
  it('deux replays différents ne se contaminent pas, quel que soit l’ordre', () => {
    const a = buildReplay(11, 300)
    const b = buildReplay(22, 300)

    const aAlone = replayRun(a)
    const bAlone = replayRun(b)

    replayRun(b)
    const aAfterB = replayRun(a)

    replayRun(a)
    const bAfterA = replayRun(b)

    expect(aAfterB).toEqual(aAlone)
    expect(bAfterA).toEqual(bAlone)
  })
})
