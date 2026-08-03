import { INPUT_FIELDS, QUANTUM } from '@sim/input'
import { SIM_VERSION } from '@sim/version.generated'
import { describe, expect, it } from 'vitest'

import { createReplayRecorder } from './replay-recorder'

describe('enregistreur de replay', () => {
  it('convertit les entrées en entiers, sans perte', () => {
    const rec = createReplayRecorder(42)
    rec.step({ moveX: 1, moveY: -1 })
    rec.step({ moveX: 0, moveY: 0 })
    rec.step({ moveX: 64 * QUANTUM, moveY: -64 * QUANTUM })
    const replay = rec.build()
    // Deux champs aujourd'hui (`moveX`, `moveY`) ; l'attente se construit depuis
    // `INPUT_FIELDS` pour ne pas casser le jour où un champ s'ajoute.
    expect(replay.inputs.length).toBe(3 * INPUT_FIELDS.length)
    expect(replay.inputs[0]).toBe(128)
    expect(replay.inputs[1]).toBe(-128)
    expect(replay.inputs[INPUT_FIELDS.length]).toBe(0)
    expect(replay.seed).toBe(42)
    expect(replay.simVersion).toBe(SIM_VERSION)
  })

  it('associe un choix au pas courant', () => {
    const rec = createReplayRecorder(1)
    rec.step({ moveX: 0, moveY: 0 })
    rec.step({ moveX: 0, moveY: 0 })
    rec.choose(2)
    expect(rec.build().choices).toEqual([{ step: 1, index: 2 }])
  })

  it('repart de zéro à la remise à zéro', () => {
    const rec = createReplayRecorder(1)
    rec.step({ moveX: 1, moveY: 1 })
    rec.choose(0)
    rec.reset(7)
    const replay = rec.build()
    expect(replay.seed).toBe(7)
    expect(replay.inputs.length).toBe(0)
    expect(replay.choices).toEqual([])
  })
})
