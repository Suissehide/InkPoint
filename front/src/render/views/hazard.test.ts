import { POWERUP_BASE } from '@sim/data/powerups'
import { describe, expect, it } from 'vitest'

import {
  blobAt,
  DRY_FILL_FLOOR,
  DRY_MS,
  dryFillAlpha,
  dryness,
  inkBlobRadius,
  inkTrailAlpha,
  inkTrailWetness,
} from './hazard'

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

describe("l'assèchement des zones qui durent", () => {
  it('rend 1 tant que la fin est loin, 0 à la mort', () => {
    expect(dryness(DRY_MS)).toBe(1)
    expect(dryness(DRY_MS * 10)).toBe(1)
    expect(dryness(0)).toBe(0)
  })

  it('descend continûment sur la fenêtre, sans palier ni cassure', () => {
    let precedent = dryness(DRY_MS)
    for (let restant = DRY_MS; restant >= 0; restant -= 5) {
      const valeur = dryness(restant)
      expect(valeur, `remonté à ${restant} ms`).toBeLessThanOrEqual(precedent)
      precedent = valeur
    }
    expect(dryness(DRY_MS / 2)).toBeCloseTo(0.5, 10)
  })

  /**
   * L'invariant qui compte : `stage.ts` passe `Number.POSITIVE_INFINITY` pour
   * une zone sans `Lifetime` (le calque), et un pas de simulation en avance
   * peut rendre un restant négatif. Ni l'un ni l'autre ne doit sortir de
   * [0, 1] — une opacité `Infinity` ou négative n'est pas une opacité.
   */
  it('ne sort jamais de [0, 1], quelle que soit la valeur reçue', () => {
    const cas = [
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NaN,
      -1,
      -1e9,
      0,
      1e9,
      DRY_MS,
      DRY_MS + 1,
      DRY_MS - 1,
    ]
    for (const valeur of cas) {
      const d = dryness(valeur)
      expect(d, `dryness(${valeur})`).toBeGreaterThanOrEqual(0)
      expect(d, `dryness(${valeur})`).toBeLessThanOrEqual(1)
    }
    // Le calque, sans `Lifetime`, ne finit jamais : il reste humide.
    expect(dryness(Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('dryFillAlpha', () => {
  /**
   * Le plancher n'est pas zéro, et c'est l'invariant de sûreté du dessin : la
   * zone tue jusqu'à sa dernière image. Un remplissage éteint avant la mort en
   * ferait une zone mortelle invisible.
   */
  it('va de son opacité pleine au plancher, sans jamais s’éteindre', () => {
    expect(dryFillAlpha(DRY_MS)).toBe(1)
    expect(dryFillAlpha(Number.POSITIVE_INFINITY)).toBe(1)
    expect(dryFillAlpha(0)).toBeCloseTo(DRY_FILL_FLOOR, 10)
    expect(dryFillAlpha(0)).toBeGreaterThan(0)
  })

  it('reste entre le plancher et 1 sur toute la fenêtre', () => {
    for (let restant = -100; restant <= DRY_MS * 2; restant += 7) {
      const a = dryFillAlpha(restant)
      expect(a, `à ${restant} ms`).toBeGreaterThanOrEqual(DRY_FILL_FLOOR)
      expect(a, `à ${restant} ms`).toBeLessThanOrEqual(1)
    }
  })
})

describe("le périmètre de l'assèchement", () => {
  /**
   * La goutte de Bavure est la seule zone assez longue pour qu'un
   * avertissement de `DRY_MS` veuille dire quelque chose. Sa trace, elle, vit
   * moins longtemps que la fenêtre elle-même : l'y appliquer reviendrait à la
   * faire naître déjà sèche, et « avertir tout le temps » n'est pas avertir.
   * C'est pourquoi la trace garde son propre séchage (`inkTrailWetness`).
   */
  it('laisse la goutte largement humide avant sa fenêtre, et la trace hors de portée', () => {
    expect(POWERUP_BASE.splatter.lifeMs).toBeGreaterThan(DRY_MS * 4)
    expect(POWERUP_BASE.splatter.trailLifeMs).toBeLessThan(DRY_MS * 1.5)
  })
})
