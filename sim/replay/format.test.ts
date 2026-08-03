import { describe, expect, it } from 'vitest'

import { INPUT_FIELDS } from '../input'
import { SIM_VERSION } from '../version.generated'
import { decodeReplay, encodeReplay, type Replay } from './format'

function sample(steps: number, choices: { step: number; index: number }[] = []): Replay {
  const inputs = new Int16Array(steps * INPUT_FIELDS.length)
  // Balaie toute la plage de `k`, bornes comprises, quel que soit le nombre de champs.
  for (let i = 0; i < inputs.length; i++) {
    inputs[i] = ((i % 257) - 128) as number
  }
  return { simVersion: SIM_VERSION, seed: 0x1234abcd, inputs, choices }
}

describe('format de replay', () => {
  it('fait un aller-retour identique', () => {
    const before = sample(500, [
      { step: 2400, index: 0 },
      { step: 4800, index: 2 },
    ])
    const after = decodeReplay(encodeReplay(before))
    expect(after.simVersion).toBe(before.simVersion)
    expect(after.seed).toBe(before.seed)
    expect(after.choices).toEqual(before.choices)
    expect(Array.from(after.inputs)).toEqual(Array.from(before.inputs))
  })

  it('tient les bornes de k, -128 et 128', () => {
    const r = sample(0)
    const inputs = new Int16Array([-128, 128, 128, -128])
    const after = decodeReplay(encodeReplay({ ...r, inputs }))
    expect(Array.from(after.inputs)).toEqual([-128, 128, 128, -128])
  })

  it('accepte une run vide et sans choix', () => {
    const after = decodeReplay(encodeReplay(sample(0)))
    expect(after.inputs.length).toBe(0)
    expect(after.choices).toEqual([])
  })

  it('refuse une magie invalide', () => {
    const bytes = encodeReplay(sample(10))
    bytes[0] = 0x58
    expect(() => decodeReplay(bytes)).toThrow(/magie/i)
  })

  it('refuse une version de format inconnue', () => {
    const bytes = encodeReplay(sample(10))
    bytes[4] = 99
    expect(() => decodeReplay(bytes)).toThrow(/version de format/i)
  })

  it('refuse un tampon tronqué', () => {
    const bytes = encodeReplay(sample(10))
    expect(() => decodeReplay(bytes.subarray(0, bytes.length - 3))).toThrow(/tronqu/i)
  })
})
