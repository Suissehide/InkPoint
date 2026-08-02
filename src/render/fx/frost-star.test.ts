import { describe, expect, it } from 'vitest'

import {
  ANGLE_JITTER,
  SPIKE_COUNT,
  SPIKE_MIN_RATIO,
  spikeAngle,
  spikeLength,
  starTaper,
} from './frost-star'

describe('spikeAngle', () => {
  it('centre chaque pic sur sa tranche quand le tirage est neutre', () => {
    const tranche = (Math.PI * 2) / SPIKE_COUNT
    expect(spikeAngle(0, SPIKE_COUNT, 0.5)).toBeCloseTo(0)
    expect(spikeAngle(3, SPIKE_COUNT, 0.5)).toBeCloseTo(3 * tranche)
  })

  it('ne laisse jamais deux voisins se croiser, même au pire tirage', () => {
    // Le pire cas : un pic poussé au maximum vers son voisin, et le voisin
    // poussé au maximum vers lui. C'est exactement ce que borne ANGLE_JITTER.
    for (let i = 0; i < SPIKE_COUNT - 1; i++) {
      expect(spikeAngle(i + 1, SPIKE_COUNT, 0)).toBeGreaterThan(spikeAngle(i, SPIKE_COUNT, 1))
    }
  })

  it('garde un écart minimal égal à la fraction non jittérée de la tranche', () => {
    const tranche = (Math.PI * 2) / SPIKE_COUNT
    const ecart = spikeAngle(1, SPIKE_COUNT, 0) - spikeAngle(0, SPIKE_COUNT, 1)
    expect(ecart).toBeCloseTo(tranche * (1 - ANGLE_JITTER))
  })
})

describe('spikeLength', () => {
  it('force le premier pic au rayon exact, quel que soit le tirage', () => {
    // Sans ce pic garanti, un tirage malchanceux dessinerait une étoile
    // entièrement plus courte que la portée réelle, et le joueur apprendrait
    // une portée fausse.
    expect(spikeLength(0, 130, 0)).toBe(130)
    expect(spikeLength(0, 130, 1)).toBe(130)
  })

  it('tient les autres pics entre le plancher et le rayon', () => {
    expect(spikeLength(1, 130, 0)).toBeCloseTo(130 * SPIKE_MIN_RATIO)
    expect(spikeLength(1, 130, 1)).toBeCloseTo(130)
    expect(spikeLength(7, 130, 0.5)).toBeGreaterThan(130 * SPIKE_MIN_RATIO)
    expect(spikeLength(7, 130, 0.5)).toBeLessThan(130)
  })
})

describe('starTaper', () => {
  it('part de 1, finit à 0, et décroît', () => {
    expect(starTaper(0)).toBe(1)
    expect(starTaper(1)).toBe(0)
    expect(starTaper(0.25)).toBeGreaterThan(starTaper(0.75))
  })

  it('borne les dépassements des deux côtés', () => {
    // `update` dérive `progress` d'un temps restant qui peut sortir de [0, 1]
    // sur une image longue.
    expect(starTaper(-0.5)).toBe(1)
    expect(starTaper(1.5)).toBe(0)
  })
})
