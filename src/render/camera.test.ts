import { describe, expect, it } from 'vitest'

import { createCamera, kickFor, MAX_AMPLITUDE, traumaAmplitude } from './camera'

describe('createCamera', () => {
  it('reste immobile au repos', () => {
    const cam = createCamera()
    expect(cam.update(16)).toEqual({ x: 0, y: 0 })
  })

  it('se décale après une secousse', () => {
    const cam = createCamera()
    cam.shake(20)
    const o = cam.update(16)
    expect(Math.hypot(o.x, o.y)).toBeGreaterThan(0)
  })

  it("revient au repos en moins d'une seconde", () => {
    const cam = createCamera()
    cam.shake(20)
    for (let i = 0; i < 70; i++) {
      cam.update(16)
    }
    const o = cam.update(16)
    expect(Math.hypot(o.x, o.y)).toBeLessThan(0.5)
  })

  it('cumule les secousses sans dépasser le plafond', () => {
    const cam = createCamera()
    for (let i = 0; i < 50; i++) {
      cam.shake(20)
    }
    const o = cam.update(16)
    expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(30)
  })
})

describe('traumaAmplitude', () => {
  it('ne déplace rien au repos', () => {
    expect(traumaAmplitude(0)).toBe(0)
  })

  it('laisse le plafond intact', () => {
    expect(traumaAmplitude(MAX_AMPLITUDE)).toBeCloseTo(MAX_AMPLITUDE, 10)
  })

  it('écrase les petites secousses plus que les grosses', () => {
    // Le carré est ce qui rend la retombée nerveuse : à mi-amplitude, on ne
    // ressent qu'un quart du déplacement, pas la moitié.
    expect(traumaAmplitude(MAX_AMPLITUDE / 2)).toBeCloseTo(MAX_AMPLITUDE / 4, 10)
  })

  it('reste monotone croissante', () => {
    expect(traumaAmplitude(10)).toBeGreaterThan(traumaAmplitude(5))
  })
})

describe('kickFor', () => {
  it('ne pousse nulle part sans direction', () => {
    expect(kickFor(20, 0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('pousse dans la direction donnée, proportionnellement à la secousse', () => {
    const kick = kickFor(20, 1, 0)
    expect(kick.x).toBeGreaterThan(0)
    expect(kick.y).toBe(0)
    expect(kickFor(10, 1, 0).x).toBeLessThan(kick.x)
  })

  it('normalise la direction : seule son orientation compte', () => {
    expect(kickFor(20, 3, 0)).toEqual(kickFor(20, 1, 0))
  })
})
