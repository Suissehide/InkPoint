import { describe, expect, it } from 'vitest'

import { computeViewport } from './viewport'

describe('computeViewport', () => {
  it('remplit exactement une fenêtre au même ratio', () => {
    expect(computeViewport(1600, 900, 1600, 900)).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('réduit sans marge quand la fenêtre est homothétique', () => {
    expect(computeViewport(800, 450, 1600, 900)).toEqual({ scale: 0.5, x: 0, y: 0 })
  })

  it('laisse une marge latérale sur une fenêtre plus large que l’arène', () => {
    expect(computeViewport(2100, 900, 1600, 900)).toEqual({ scale: 1, x: 250, y: 0 })
  })

  it('laisse une marge haute et basse sur une fenêtre plus haute que l’arène', () => {
    expect(computeViewport(1600, 1200, 1600, 900)).toEqual({ scale: 1, x: 0, y: 150 })
  })

  it('centre l’arène sur une fenêtre au ratio quelconque', () => {
    const v = computeViewport(1297, 924, 1600, 900)
    expect(v.scale).toBeCloseTo(0.8106, 4)
    expect(v.x).toBe(0)
    expect(v.y).toBeCloseTo(97.219, 3)
  })

  it('rétrécit sans jamais déborder sur une fenêtre minuscule', () => {
    const v = computeViewport(320, 240, 1600, 900)
    expect(v.scale).toBeLessThan(1)
    expect(1600 * v.scale).toBeLessThanOrEqual(320)
    expect(900 * v.scale).toBeLessThanOrEqual(240)
  })
})
