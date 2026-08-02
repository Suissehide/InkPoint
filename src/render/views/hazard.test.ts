import { describe, expect, it } from 'vitest'

import { POWERUP_BASE } from '@/sim/data/powerups'
import { blobAt, inkBlobRadius, inkTrailAlpha, inkTrailWetness } from './hazard'

/** Un balayage de positions plausibles dans l'arène, pas trois cas choisis. */
function positions(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let x = 0; x < 1280; x += 37) {
    for (let y = 0; y < 720; y += 41) {
      out.push({ x, y })
    }
  }
  return out
}

function pgcd(a: number, b: number): number {
  return b === 0 ? a : pgcd(b, a % b)
}

describe('inkBlobRadius', () => {
  /**
   * L'invariant de sûreté du fichier : une tache d'encre tue sur tout son
   * rayon, donc son contour ne doit jamais mordre en deçà. Un lobe négatif
   * laisserait une bande meurtrière hors du dessin.
   */
  it('ne descend jamais sous le rayon mortel, quelle que soit la forme tirée', () => {
    const r = POWERUP_BASE.splatter.trailRadius
    for (const { x, y } of positions()) {
      const blob = blobAt(x, y)
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2
        expect(inkBlobRadius(blob, r, t)).toBeGreaterThanOrEqual(r - 1e-9)
      }
    }
  })

  it('déborde vraiment quelque part : ce n’est pas un cercle déguisé', () => {
    const r = POWERUP_BASE.splatter.trailRadius
    for (const { x, y } of positions()) {
      const blob = blobAt(x, y)
      let max = 0
      for (let i = 0; i <= 64; i++) {
        max = Math.max(max, inkBlobRadius(blob, r, (i / 64) * Math.PI * 2))
      }
      expect(max).toBeGreaterThan(r * 1.02)
    }
  })
})

describe('blobAt', () => {
  /**
   * Une tache ne bouge plus une fois posée : sa forme doit être une pure
   * fonction de sa position, sans quoi elle scintillerait d'une image à l'autre.
   */
  it('redonne exactement la même forme pour la même position', () => {
    expect(blobAt(123, 456)).toEqual(blobAt(123, 456))
  })

  /**
   * Le défaut que ce redesign corrige : l'ancien contour ne faisait varier
   * qu'une phase, donc toutes les taches étaient la même silhouette pivotée.
   */
  it('donne des amplitudes franchement différentes d’une tache à l’autre', () => {
    const amps = positions().map(({ x, y }) => blobAt(x, y).ampA)
    expect(Math.max(...amps) - Math.min(...amps)).toBeGreaterThan(0.1)
  })

  it('emploie réellement les quatre couples de fréquences', () => {
    const couples = new Set(
      positions().map(({ x, y }) => {
        const b = blobAt(x, y)
        return `${b.freqA}-${b.freqB}`
      }),
    )
    expect(couples.size).toBe(4)
  })

  /**
   * Deux fréquences partageant un facteur rendraient une forme visiblement
   * symétrique — exactement la lecture « figure géométrique » qu'on fuit.
   */
  it('ne tire que des fréquences premières entre elles', () => {
    for (const { x, y } of positions()) {
      const b = blobAt(x, y)
      expect(pgcd(b.freqA, b.freqB)).toBe(1)
    }
  })
})

describe('le séchage de la trace', () => {
  it('naît humide et finit sec', () => {
    expect(inkTrailWetness(POWERUP_BASE.splatter.trailLifeMs)).toBe(1)
    expect(inkTrailWetness(0)).toBe(0)
  })

  /**
   * Le fondu que remplaçait `lifeRatio` tenait à plein puis cassait. Celui-ci
   * doit décroître sans jamais remonter ni faire de palier.
   */
  it('décroît continûment, sans marche', () => {
    let precedent = Number.POSITIVE_INFINITY
    let sautMax = 0
    for (let ms = POWERUP_BASE.splatter.trailLifeMs; ms >= 0; ms -= 5) {
      const a = inkTrailAlpha(ms)
      expect(a).toBeLessThanOrEqual(precedent + 1e-9)
      if (Number.isFinite(precedent)) {
        sautMax = Math.max(sautMax, precedent - a)
      }
      precedent = a
    }
    // Sur des pas de 5 ms, aucune image ne doit perdre plus de 1 % d'opacité.
    expect(sautMax).toBeLessThan(0.01)
  })

  /**
   * La tache tue jusqu'à sa dernière image : la faire disparaître avant sa
   * mort en ferait une zone mortelle invisible.
   */
  it('reste lisible jusqu’au bout, sans jamais s’éteindre avant de mourir', () => {
    expect(inkTrailAlpha(0)).toBeGreaterThan(0.2)
  })
})

describe('les réglages de la trace', () => {
  /**
   * Le séchage est calé sur la vie réelle de la tache : une fenêtre plus
   * longue que sa vie la ferait naître déjà pâle, et le ruban perdrait sa tête.
   */
  it('sèche sur presque toute la vie de la tache, jamais plus', () => {
    const vie = POWERUP_BASE.splatter.trailLifeMs
    expect(inkTrailWetness(vie)).toBe(1)
    expect(inkTrailWetness(vie * 0.5)).toBeLessThan(0.95)
  })
})
