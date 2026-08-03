import { POWERUP_DRAWABLE } from '@sim/data/powerups'
import { describe, expect, it } from 'vitest'

import { ACHIEVEMENTS } from './catalog'
import { createTrace, type RunTrace } from './trace'

/** Une trace neutre, que chaque cas ne modifie que sur ce qu'il teste. */
function base(patch: Partial<RunTrace> = {}): RunTrace {
  return Object.assign(createTrace(640, 360), patch)
}

function done(id: string, trace: RunTrace): boolean {
  const def = ACHIEVEMENTS.find((a) => a.id === id)
  if (!def) {
    throw new Error(`succès inconnu : ${id}`)
  }
  return def.done(trace)
}

describe('prédicats', () => {
  it('wave-10 s’ouvre à la vague 10', () => {
    expect(done('wave-10', base({ wave: 9 }))).toBe(false)
    expect(done('wave-10', base({ wave: 10 }))).toBe(true)
  })

  it('score-1m s’ouvre au million', () => {
    expect(done('score-1m', base({ score: 999_999 }))).toBe(false)
    expect(done('score-1m', base({ score: 1_000_000 }))).toBe(true)
  })

  it('kills-2000 compte les ennemis de la partie', () => {
    expect(done('kills-2000', base({ kills: 1999 }))).toBe(false)
    expect(done('kills-2000', base({ kills: 2000 }))).toBe(true)
  })

  it('combo-750 lit le pic, pas le combo courant', () => {
    expect(done('combo-750', base({ maxCombo: 749 }))).toBe(false)
    expect(done('combo-750', base({ maxCombo: 750 }))).toBe(true)
  })

  it('burst-100 compte la fenêtre glissante', () => {
    expect(done('burst-100', base({ killTimestamps: new Array(99).fill(0) }))).toBe(false)
    expect(done('burst-100', base({ killTimestamps: new Array(100).fill(0) }))).toBe(true)
  })

  it('clean-wave demande une vague, clean-three en demande trois', () => {
    expect(done('clean-wave', base({ cleanWaveStreak: 0 }))).toBe(false)
    expect(done('clean-wave', base({ cleanWaveStreak: 1 }))).toBe(true)
    expect(done('clean-three', base({ cleanWaveStreak: 2 }))).toBe(false)
    expect(done('clean-three', base({ cleanWaveStreak: 3 }))).toBe(true)
  })

  // Ce test ne doit PAS construire son cas nominal depuis la liste que lit le
  // prédicat, sinon il passerait quel que soit le seuil comparé. Il part de ce
  // qu'une partie peut réellement produire : `pickup.ts` ne fait sortir que
  // `POWERUP_DRAWABLE`, donc ramasser exactement ces genres-là est le meilleur
  // qu'un joueur puisse faire — et cela doit suffire. Comparé à
  // `POWERUP_KINDS`, le prédicat exigerait en plus les genres désactivés et
  // cette assertion tomberait.
  it('full-kit s’ouvre sur les seuls genres qu’une partie peut faire sortir', () => {
    expect(done('full-kit', base({ powerupsPicked: new Set(POWERUP_DRAWABLE) }))).toBe(true)
  })

  it('full-kit reste fermé s’il manque un genre tirable', () => {
    const partiel = new Set(POWERUP_DRAWABLE.slice(0, POWERUP_DRAWABLE.length - 1))
    expect(done('full-kit', base({ powerupsPicked: partiel }))).toBe(false)
  })

  it('bare-hands tombe dès le premier power-up ramassé', () => {
    expect(done('bare-hands', base({ wave: 5, powerupCount: 0 }))).toBe(true)
    expect(done('bare-hands', base({ wave: 5, powerupCount: 1 }))).toBe(false)
    expect(done('bare-hands', base({ wave: 4, powerupCount: 0 }))).toBe(false)
  })

  it('no-halo ne regarde que le Halo', () => {
    expect(done('no-halo', base({ wave: 10, powerupsPicked: new Set(['blast']) }))).toBe(true)
    expect(done('no-halo', base({ wave: 10, powerupsPicked: new Set(['halo']) }))).toBe(false)
  })

  // Le score monte de 5 points par seconde tout seul : c'est le kill, pas le
  // point, qui fait la page blanche.
  it('blank-page exige la mort sans un seul kill', () => {
    expect(done('blank-page', base({ died: true, kills: 0 }))).toBe(true)
    expect(done('blank-page', base({ died: false, kills: 0 }))).toBe(false)
    expect(done('blank-page', base({ died: true, kills: 1 }))).toBe(false)
  })

  it('false-start exige une mort avant cinq secondes', () => {
    expect(done('false-start', base({ died: true, timeMs: 4999 }))).toBe(true)
    expect(done('false-start', base({ died: true, timeMs: 5000 }))).toBe(false)
  })

  it('still-life demande quinze secondes ancrées', () => {
    expect(done('still-life', base({ stillMs: 14_999 }))).toBe(false)
    expect(done('still-life', base({ stillMs: 15_000 }))).toBe(true)
  })

  it('pacifist et homebody lisent leur bilan de vague', () => {
    expect(done('pacifist', base({ hadPacifistWave: true }))).toBe(true)
    expect(done('pacifist', base({ hadPacifistWave: false }))).toBe(false)
    expect(done('homebody', base({ hadHomebodyWave: true }))).toBe(true)
  })

  it('grand-tour exige les quatre bords dans la même fenêtre', () => {
    expect(done('grand-tour', base({ edgeTouchedAt: [0, 1000, 2000, 4999] }))).toBe(true)
    expect(done('grand-tour', base({ edgeTouchedAt: [0, 1000, 2000, 5001] }))).toBe(false)
  })

  // Un bord jamais touché vaut `-Infinity` : l'écart est infini, jamais ≤ 5 s.
  it('grand-tour reste fermé tant qu’un bord n’a pas été touché', () => {
    expect(
      done('grand-tour', base({ edgeTouchedAt: [0, 1000, 2000, Number.NEGATIVE_INFINITY] })),
    ).toBe(false)
  })

  it('back-to-inkwell mesure la distance au point d’apparition', () => {
    expect(done('back-to-inkwell', base({ died: true, x: 640, y: 400 }))).toBe(true)
    expect(done('back-to-inkwell', base({ died: true, x: 640, y: 500 }))).toBe(false)
    expect(done('back-to-inkwell', base({ died: false, x: 640, y: 360 }))).toBe(false)
  })
})
