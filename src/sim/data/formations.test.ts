import { describe, expect, it } from 'vitest'

import { ARENA } from '@/sim/world'
import {
  CROSSING_SPACING,
  crossingLayout,
  FORMATION_KINDS,
  type FormationKind,
  formationOffsets,
  MIN_CROSSING_SPACING,
} from './formations'

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

  it('square trace un périmètre sans superposer aucun point', () => {
    const pts = formationOffsets('square', 9, 30)
    const keys = new Set(pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`))
    expect(keys.size).toBe(9)
  })

  it('square garde chaque point entre le milieu et le coin du carré', () => {
    const spacing = 30
    const count = 9
    const halfSide = (spacing * count) / 8
    for (const p of formationOffsets('square', count, spacing)) {
      const d = Math.hypot(p.x, p.y)
      expect(d).toBeGreaterThanOrEqual(halfSide - 1e-6)
      expect(d).toBeLessThanOrEqual(halfSide * Math.SQRT2 + 1e-6)
    }
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

describe('crossingLayout', () => {
  /** Les trois figures que `spawnCrossingFormation` (waves.ts) fait traverser l'arène. */
  const CROSSING_KINDS: readonly FormationKind[] = ['line', 'vee', 'spiral']
  /** Effectifs plausibles, puis très au-delà : la difficulté n'a plus de plafond. */
  const COUNTS = [8, 22, 38, 68, 100, 500]
  /** Les deux étendues possibles : hauteur pour une entrée latérale, largeur pour une entrée verticale. */
  const EXTENTS = [ARENA.height, ARENA.width]

  /** Envergure réelle de la figure, perpendiculairement à sa marche (axe local x). */
  const span = (kind: FormationKind, count: number, extent: number): number => {
    const layout = crossingLayout(kind, count, extent)
    const xs = formationOffsets(kind, layout.count, layout.spacing).map((o) => o.x)
    return Math.max(...xs) - Math.min(...xs)
  }

  it.each(CROSSING_KINDS)('%s ne déborde jamais de son étendue, à aucun effectif', (kind) => {
    for (const extent of EXTENTS) {
      for (const count of COUNTS) {
        expect(
          span(kind, count, extent),
          `${kind}, ${count} membres sur ${extent} px`,
        ).toBeLessThanOrEqual(extent + 1e-9)
      }
    }
  })

  it.each(CROSSING_KINDS)("%s ne descend jamais sous le plancher d'espacement", (kind) => {
    for (const extent of EXTENTS) {
      for (const count of COUNTS) {
        expect(crossingLayout(kind, count, extent).spacing).toBeGreaterThanOrEqual(
          MIN_CROSSING_SPACING,
        )
      }
    }
  })

  it.each(CROSSING_KINDS)("%s ne rend jamais plus d'effectif qu'on ne lui en demande", (kind) => {
    for (const extent of EXTENTS) {
      for (const count of COUNTS) {
        expect(crossingLayout(kind, count, extent).count).toBeLessThanOrEqual(count)
      }
    }
  })

  it("garde l'espacement nominal tant que la figure tient dans l'étendue", () => {
    const layout = crossingLayout('line', 8, ARENA.height)
    expect(layout.spacing).toBe(CROSSING_SPACING)
    expect(layout.count).toBe(8)
  })

  it("resserre l'espacement sans toucher à l'effectif tant que le plancher le permet", () => {
    // 38 membres sur la hauteur (entrée latérale) : l'envergure nominale
    // vaudrait 1292 px pour 720 disponibles. C'est l'espacement qui cède.
    const layout = crossingLayout('line', 38, ARENA.height)
    expect(layout.count).toBe(38)
    expect(layout.spacing).toBeLessThan(CROSSING_SPACING)
    expect(layout.spacing * 37).toBeCloseTo(ARENA.height, 6)
  })

  it("ne borne l'effectif qu'une fois le plancher d'espacement atteint", () => {
    const layout = crossingLayout('line', 500, ARENA.height)
    expect(layout.count).toBeLessThan(500)
    // Ce qui cède alors, c'est l'effectif : la figure barre toujours toute
    // l'étendue, aussi dense que le plancher l'autorise.
    expect(layout.spacing).toBeGreaterThanOrEqual(MIN_CROSSING_SPACING)
    expect(span('line', 500, ARENA.height)).toBeCloseTo(ARENA.height, 6)
  })

  it('accorde plus de membres à une entrée verticale, qui dispose de la largeur', () => {
    // Ne pas borner par la plus petite des deux dimensions : une entrée par le
    // haut ou le bas a droit à toute la largeur de l'arène.
    expect(crossingLayout('line', 500, ARENA.width).count).toBeGreaterThan(
      crossingLayout('line', 500, ARENA.height).count,
    )
  })

  it("l'effectif rendu reste monotone croissant avec l'effectif demandé", () => {
    let previous = 0
    for (let count = 1; count <= 200; count++) {
      const kept = crossingLayout('spiral', count, ARENA.width).count
      expect(kept).toBeGreaterThanOrEqual(previous)
      previous = kept
    }
  })

  it('reste défini pour un membre unique', () => {
    const layout = crossingLayout('vee', 1, ARENA.height)
    expect(layout).toEqual({ count: 1, spacing: CROSSING_SPACING })
  })
})
