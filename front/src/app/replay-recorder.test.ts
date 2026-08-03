import { INPUT_FIELDS, QUANTUM } from '@sim/input'
import { SIM_VERSION } from '@sim/version.generated'
import { describe, expect, it } from 'vitest'

import { createReplayRecorder } from './replay-recorder'

describe('enregistreur de replay', () => {
  it('convertit les entrées en entiers, sans perte', () => {
    const rec = createReplayRecorder(42, 0)
    rec.step({ moveX: 1, moveY: -1, speedCap: 1 })
    rec.step({ moveX: 0, moveY: 0, speedCap: 1 })
    rec.step({ moveX: 64 * QUANTUM, moveY: -64 * QUANTUM, speedCap: 32 * QUANTUM })
    const replay = rec.build()
    // Trois champs depuis que le manche virtuel a ajouté `speedCap` ; l'attente
    // se construit depuis `INPUT_FIELDS`, donc elle a suivi toute seule.
    expect(replay.inputs.length).toBe(3 * INPUT_FIELDS.length)
    expect(replay.inputs[0]).toBe(128)
    expect(replay.inputs[1]).toBe(-128)
    expect(replay.inputs[2]).toBe(128)
    expect(replay.inputs[INPUT_FIELDS.length]).toBe(0)
    // `speedCap` traverse la même grille que les axes : 32/128 se réencode
    // exactement, sans quoi une partie au manche divergerait dès le premier pas.
    expect(replay.inputs[2 * INPUT_FIELDS.length + 2]).toBe(32)
    expect(replay.seed).toBe(42)
    expect(replay.arenaId).toBe(0)
    expect(replay.simVersion).toBe(SIM_VERSION)
  })

  it('associe un choix au pas courant', () => {
    const rec = createReplayRecorder(1, 0)
    rec.step({ moveX: 0, moveY: 0, speedCap: 1 })
    rec.step({ moveX: 0, moveY: 0, speedCap: 1 })
    rec.choose(2)
    expect(rec.build().choices).toEqual([{ step: 1, index: 2 }])
  })

  it('repart de zéro à la remise à zéro, arène comprise', () => {
    const rec = createReplayRecorder(1, 0)
    rec.step({ moveX: 1, moveY: 1, speedCap: 1 })
    rec.choose(0)
    rec.reset(7, 1)
    const replay = rec.build()
    expect(replay.seed).toBe(7)
    // Arène distincte de celle du premier appel (0 puis 1) : sans reprise
    // explicite de `nextArenaId` dans `reset`, cette assertion resterait
    // vraie par accident (l'ancienne valeur y suffirait).
    expect(replay.arenaId).toBe(1)
    expect(replay.inputs.length).toBe(0)
    expect(replay.choices).toEqual([])
  })
})
