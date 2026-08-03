import { describe, expect, it } from 'vitest'

import { allowedVoices, killPitch, VOICE_CAP_PER_FRAME, volumeFor } from './curves'

describe('volumeFor', () => {
  it('rend un gain nul à zéro', () => {
    expect(volumeFor(0)).toBe(0)
  })

  it('rend le gain plein à cent', () => {
    expect(volumeFor(100)).toBeCloseTo(1, 10)
  })

  it('est monotone croissante', () => {
    for (let v = 0; v < 100; v += 5) {
      expect(volumeFor(v + 5)).toBeGreaterThan(volumeFor(v))
    }
  })

  it('borne les valeurs hors de [0, 100]', () => {
    expect(volumeFor(-30)).toBe(0)
    expect(volumeFor(400)).toBeCloseTo(1, 10)
  })
})

describe('killPitch', () => {
  it('monte avec le multiplicateur de combo', () => {
    expect(killPitch(6)).toBeGreaterThan(killPitch(1))
  })

  it('reste bornée aux deux extrémités', () => {
    const bas = killPitch(1)
    const haut = killPitch(10)
    expect(killPitch(-5)).toBe(bas)
    expect(killPitch(9999)).toBe(haut)
  })

  it('reste dans une plage audible', () => {
    for (let m = 1; m <= 10; m++) {
      expect(killPitch(m)).toBeGreaterThan(80)
      expect(killPitch(m)).toBeLessThan(4000)
    }
  })
})

describe('allowedVoices', () => {
  it('laisse passer un événement isolé', () => {
    expect(allowedVoices(1, 0, VOICE_CAP_PER_FRAME)).toBe(1)
  })

  it('plafonne une salve', () => {
    expect(allowedVoices(20, 0, VOICE_CAP_PER_FRAME)).toBe(VOICE_CAP_PER_FRAME)
  })

  it('tient compte de ce qui a déjà été joué dans l’image', () => {
    expect(allowedVoices(5, VOICE_CAP_PER_FRAME - 1, VOICE_CAP_PER_FRAME)).toBe(1)
  })

  it('ne rend jamais un nombre négatif', () => {
    expect(allowedVoices(5, 99, VOICE_CAP_PER_FRAME)).toBe(0)
  })
})
