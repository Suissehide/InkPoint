import { describe, expect, it } from 'vitest'

import {
  COUNTDOWN_DIGITS,
  COUNTDOWN_MS,
  COUNTDOWN_STEP_MS,
  countdownDigitAt,
  createCountdown,
} from './countdown'

describe('countdownDigitAt', () => {
  it('part du plus grand chiffre', () => {
    expect(countdownDigitAt(0)).toBe(COUNTDOWN_DIGITS)
  })

  it('tient un chiffre pendant tout son palier', () => {
    expect(countdownDigitAt(COUNTDOWN_STEP_MS - 1)).toBe(3)
    expect(countdownDigitAt(COUNTDOWN_STEP_MS)).toBe(2)
    expect(countdownDigitAt(COUNTDOWN_STEP_MS * 2 - 1)).toBe(2)
    expect(countdownDigitAt(COUNTDOWN_STEP_MS * 2)).toBe(1)
  })

  // 0 et non 3 : la vue distingue « plus rien à afficher » de « ça recommence ».
  it('tombe à zéro une fois le décompte fini', () => {
    expect(countdownDigitAt(COUNTDOWN_MS)).toBe(0)
    expect(countdownDigitAt(COUNTDOWN_MS * 10)).toBe(0)
  })
})

describe('createCountdown', () => {
  it('naît terminé, pour ne rien afficher avant le premier start', () => {
    expect(createCountdown().done).toBe(true)
  })

  it('affiche le premier chiffre dès le démarrage', () => {
    const c = createCountdown()
    c.start()
    expect(c.done).toBe(false)
    expect(c.digit).toBe(COUNTDOWN_DIGITS)
  })

  it('descend chiffre par chiffre puis se termine', () => {
    const c = createCountdown()
    c.start()
    const vus: number[] = [c.digit]
    for (let i = 0; i < COUNTDOWN_DIGITS; i++) {
      c.update(COUNTDOWN_STEP_MS)
      vus.push(c.digit)
    }
    expect(vus).toEqual([3, 2, 1, 0])
    expect(c.done).toBe(true)
  })

  // Un onglet remis au premier plan livre son retard en une fois. `game.ts`
  // plafonne déjà `dt`, mais le module ne s'y fie pas : il doit terminer,
  // jamais sauter dans un état incohérent.
  it('termine proprement sur un pas de temps énorme', () => {
    const c = createCountdown()
    c.start()
    c.update(60_000)
    expect(c.done).toBe(true)
    expect(c.digit).toBe(0)
  })

  it('ignore un pas de temps négatif', () => {
    const c = createCountdown()
    c.start()
    c.update(-5_000)
    expect(c.digit).toBe(COUNTDOWN_DIGITS)
    expect(c.done).toBe(false)
  })

  it('se relance à neuf après un start', () => {
    const c = createCountdown()
    c.start()
    c.update(COUNTDOWN_MS)
    c.start()
    expect(c.done).toBe(false)
    expect(c.digit).toBe(COUNTDOWN_DIGITS)
  })
})
