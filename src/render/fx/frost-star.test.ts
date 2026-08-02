import { describe, expect, it } from 'vitest'

import {
  ANGLE_JITTER,
  FADE_IN_MS,
  SPIKE_COUNT,
  SPIKE_GROW_MAX_MS,
  SPIKE_GROW_MIN_MS,
  SPIKE_HALF_WIDTH_RATIO,
  SPIKE_MIN_RATIO,
  spikeAngle,
  spikeGrow01,
  spikeGrowMs,
  spikeLength,
  starFadeIn,
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

describe('SPIKE_HALF_WIDTH_RATIO', () => {
  it('laisse un pic plus étroit que l’écart à son voisin, à mi-longueur', () => {
    // Le seul garde-fou contre l'épaississement : un pic vaut `half` de large
    // à mi-longueur (la base s'affine linéairement vers la pointe), et deux
    // axes voisins y sont écartés d'une tranche d'arc. Passé cette largeur,
    // les pics se rejoignent avant leurs pointes et l'étoile redevient le
    // disque hérissé que `SPIKE_MIN_RATIO` a justement cessé de dessiner.
    //
    // Écart nominal, pas le pire tirage : près du centre les pics se
    // recouvrent de toute façon, et c'est le régime moyen qui décide de la
    // lecture. Plafond ≈ 0,242 ; on s'arrête volontairement en deçà.
    const rayon = 220
    const mi = rayon / 2
    const ecartVoisins = ((Math.PI * 2) / SPIKE_COUNT) * mi
    const largeurAMiLongueur = SPIKE_HALF_WIDTH_RATIO * rayon
    expect(largeurAMiLongueur).toBeLessThan(ecartVoisins)
  })
})

describe('spikeGrowMs', () => {
  it('donne au pic garanti la pousse la plus courte', () => {
    // Le pic 0 porte la portée réelle : c'est lui qui doit l'annoncer en
    // premier, sinon l'étoile passe ses deux premières images à promettre
    // moins que ce que le Gel vient de figer.
    expect(spikeGrowMs(0, 0)).toBe(SPIKE_GROW_MIN_MS)
    expect(spikeGrowMs(0, 1)).toBe(SPIKE_GROW_MIN_MS)
  })

  it('tient les autres entre le plancher et le plafond de pousse', () => {
    expect(spikeGrowMs(1, 0)).toBe(SPIKE_GROW_MIN_MS)
    expect(spikeGrowMs(1, 1)).toBe(SPIKE_GROW_MAX_MS)
    expect(spikeGrowMs(7, 0.5)).toBeGreaterThan(SPIKE_GROW_MIN_MS)
    expect(spikeGrowMs(7, 0.5)).toBeLessThan(SPIKE_GROW_MAX_MS)
  })

  it('reste très en deçà de la vie de l’étoile', () => {
    // Une pousse qui mordrait sur le fondu se lirait comme une onde qui
    // voyage — le mensonge que le Gel instantané a précisément retiré.
    expect(SPIKE_GROW_MAX_MS).toBeLessThan(250)
  })
})

describe('spikeGrow01', () => {
  it('part de 0, atteint 1 à la fin de la pousse, et n’y revient jamais', () => {
    expect(spikeGrow01(0, 100)).toBe(0)
    expect(spikeGrow01(100, 100)).toBe(1)
    expect(spikeGrow01(5000, 100)).toBe(1)
  })

  it('décélère : la moitié du temps a déjà posé plus de la moitié du pic', () => {
    // Arrivée douce plutôt que coup sec — c'est toute la différence entre un
    // pic qui se pose et un pic qui claque.
    expect(spikeGrow01(50, 100)).toBeGreaterThan(0.5)
    expect(spikeGrow01(50, 100)).toBeLessThan(1)
  })

  it('croît strictement pendant la pousse', () => {
    expect(spikeGrow01(25, 100)).toBeLessThan(spikeGrow01(75, 100))
  })

  it('borne un temps négatif à 0', () => {
    expect(spikeGrow01(-10, 100)).toBe(0)
  })
})

describe('starFadeIn', () => {
  it('part de 0 et sature à 1 après la montée', () => {
    expect(starFadeIn(0)).toBe(0)
    expect(starFadeIn(FADE_IN_MS)).toBe(1)
    expect(starFadeIn(FADE_IN_MS * 10)).toBe(1)
  })

  it('monte progressivement, sans marche', () => {
    expect(starFadeIn(FADE_IN_MS / 4)).toBeLessThan(starFadeIn(FADE_IN_MS / 2))
    expect(starFadeIn(FADE_IN_MS / 2)).toBeLessThan(1)
  })

  it('borne un temps négatif à 0', () => {
    expect(starFadeIn(-10)).toBe(0)
  })
})

describe('starTaper', () => {
  it('part de 1, finit à 0, et décroît', () => {
    expect(starTaper(0)).toBe(1)
    expect(starTaper(1)).toBe(0)
    expect(starTaper(0.25)).toBeGreaterThan(starTaper(0.75))
  })

  it('borne les dépassements des deux côtés', () => {
    // `update` ne fournit jamais que des progress dans [0, 1) ; ces bornes
    // protègent un appel direct à la fonction exportée, pas un chemin que
    // `update` emprunte.
    expect(starTaper(-0.5)).toBe(1)
    expect(starTaper(1.5)).toBe(0)
  })
})
