import { describe, expect, it } from 'vitest'

import { FORMATION_KINDS, formationOffsets } from './formations'

describe('formationOffsets', () => {
  it.each(FORMATION_KINDS)('%s produit exactement le nombre demandé', (kind) => {
    expect(formationOffsets(kind, 7, 30)).toHaveLength(7)
  })

  it.each(FORMATION_KINDS)('%s reste dans une enveloppe raisonnable', (kind) => {
    for (const p of formationOffsets(kind, 12, 30)) {
      expect(Math.hypot(p.x, p.y)).toBeLessThan(30 * 12)
    }
  })

  it('line aligne tout sur y = 0', () => {
    for (const p of formationOffsets('line', 5, 30)) {
      expect(p.y).toBe(0)
    }
  })

  it("line centre la formation sur l'origine", () => {
    const pts = formationOffsets('line', 4, 30)
    const sum = pts.reduce((acc, p) => acc + p.x, 0)
    expect(sum).toBeCloseTo(0, 5)
  })

  it('circle place tous les points à la même distance du centre', () => {
    const pts = formationOffsets('circle', 8, 30)
    const dists = pts.map((p) => Math.hypot(p.x, p.y))
    for (const d of dists) {
      expect(d).toBeCloseTo(dists[0]!, 3)
    }
  })

  it('square remplit une grille et ne superpose aucun point', () => {
    const pts = formationOffsets('square', 9, 30)
    const keys = new Set(pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`))
    expect(keys.size).toBe(9)
  })

  it('spiral éloigne progressivement du centre', () => {
    const pts = formationOffsets('spiral', 6, 30)
    for (let i = 1; i < pts.length; i++) {
      expect(Math.hypot(pts[i]!.x, pts[i]!.y)).toBeGreaterThan(
        Math.hypot(pts[i - 1]!.x, pts[i - 1]!.y),
      )
    }
  })

  it('accepte un compte de 1 sans planter', () => {
    expect(formationOffsets('vee', 1, 30)).toHaveLength(1)
  })
})
