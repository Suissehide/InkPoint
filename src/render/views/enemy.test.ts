import { describe, expect, it } from 'vitest'

import { INK } from '../ink'
import {
  enemyBodyColor,
  facetPoints,
  TELEGRAPH_RING_START,
  telegraphFade,
  telegraphRingRadius,
} from './enemy'

describe('enemyBodyColor', () => {
  it("donne à l'Éclat une encre à lui", () => {
    expect(enemyBodyColor('shard', false, 0)).toBe(INK.shard)
    expect(enemyBodyColor('shard', false, 0)).not.toBe(enemyBodyColor('point', false, 0))
  })

  it('laisse le Point et le Blot en rouge', () => {
    expect(enemyBodyColor('point', false, 0)).toBe(INK.danger)
    expect(enemyBodyColor('blot', false, 0)).toBe(INK.danger)
  })

  it("fait passer le gel avant l'espèce : un Éclat gelé est bleu comme les autres", () => {
    expect(enemyBodyColor('shard', true, 0)).toBe(INK.frost)
    expect(enemyBodyColor('shard', true, 0)).toBe(enemyBodyColor('point', true, 0))
  })

  it('blanchit complètement à la mort, gelé ou non', () => {
    expect(enemyBodyColor('shard', false, 1)).toBe(INK.paper)
    expect(enemyBodyColor('shard', true, 1)).toBe(INK.paper)
  })
})

describe('facetPoints', () => {
  it('rend trois sommets, soit six coordonnées', () => {
    expect(facetPoints(6, 0)).toHaveLength(6)
  })

  it('pose le premier sommet sur l’angle demandé', () => {
    const [x, y] = facetPoints(6, 0)
    expect(x).toBeCloseTo(6, 10)
    expect(y).toBeCloseTo(0, 10)
  })

  it('pose tous les sommets sur le cercle du rayon donné', () => {
    const pts = facetPoints(6, 0.7)
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i] ?? 0, pts[i + 1] ?? 0)).toBeCloseTo(6, 10)
    }
  })

  it('espace les sommets de 120°', () => {
    const pts = facetPoints(6, 0)
    const angles = [0, 2, 4].map((i) => Math.atan2(pts[i + 1] ?? 0, pts[i] ?? 0))
    const ecart = ((angles[1] ?? 0) - (angles[0] ?? 0) + Math.PI * 2) % (Math.PI * 2)
    expect(ecart).toBeCloseTo((Math.PI * 2) / 3, 10)
  })

  it('creuse la moitié du rayon en milieu d’arête, ce qui est ce qui rend la facette visible', () => {
    const pts = facetPoints(6, 0)
    const milieu = {
      x: ((pts[0] ?? 0) + (pts[2] ?? 0)) / 2,
      y: ((pts[1] ?? 0) + (pts[3] ?? 0)) / 2,
    }
    expect(Math.hypot(milieu.x, milieu.y)).toBeCloseTo(3, 10)
  })

  it('tourne avec l’angle', () => {
    const [x, y] = facetPoints(6, Math.PI / 2)
    expect(x).toBeCloseTo(0, 10)
    expect(y).toBeCloseTo(6, 10)
  })
})

describe('telegraphRingRadius', () => {
  it('part à quatre fois le rayon du corps', () => {
    expect(telegraphRingRadius(6, 0)).toBe(6 * TELEGRAPH_RING_START)
  })

  it('touche EXACTEMENT le corps à la fin : c’est le contact qui annonce le tir', () => {
    expect(telegraphRingRadius(6, 1)).toBe(6)
  })

  it('se contracte sans jamais repartir en arrière', () => {
    let precedent = Number.POSITIVE_INFINITY
    for (let k = 0; k <= 1; k += 0.01) {
      const r = telegraphRingRadius(6, k)
      expect(r).toBeLessThanOrEqual(precedent + 1e-9)
      precedent = r
    }
  })

  it('reste borné si l’avancement sort de [0, 1]', () => {
    expect(telegraphRingRadius(6, -1)).toBe(6 * TELEGRAPH_RING_START)
    expect(telegraphRingRadius(6, 2)).toBe(6)
  })
})

describe('telegraphFade', () => {
  it('rend ses bornes aux extrémités', () => {
    expect(telegraphFade(0, 0.5, 0.9)).toBeCloseTo(0.5, 10)
    expect(telegraphFade(1, 0.5, 0.9)).toBeCloseTo(0.9, 10)
  })

  it('ne sort jamais de l’intervalle, même hors de [0, 1]', () => {
    for (let k = -0.5; k <= 1.5; k += 0.05) {
      const a = telegraphFade(k, 0, 0.7)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(0.7)
    }
  })
})
