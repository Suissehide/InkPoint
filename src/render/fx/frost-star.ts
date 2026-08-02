import { type Container, Graphics } from 'pixi.js'

interface Spike {
  angle: number
  length: number
}

interface Star {
  gfx: Graphics
  color: number
  spikes: Spike[]
  halfWidth: number
  life: number
  maxLife: number
}

export interface FrostStarOptions {
  color: number
  /** Portée réelle du gel : le pic garanti (indice 0) l'atteint exactement. */
  radius: number
}

export interface FrostStars {
  emit(x: number, y: number, opts: FrostStarOptions): void
  update(dtMs: number): void
  destroy(): void
}

/** Impair : aucune symétrie accidentelle d'un pic à son opposé. */
export const SPIKE_COUNT = 13
/** Longueur plancher, en fraction du rayon : l'écart de longueur doit se voir. */
export const SPIKE_MIN_RATIO = 0.45
/** Demi-largeur de la base d'un pic, en fraction du rayon (≈ 7 px à 130, donc 14 px de base : un pic, pas un cheveu). */
export const SPIKE_HALF_WIDTH_RATIO = 0.055
/**
 * Fraction de la demi-tranche dont un angle peut s'écarter. Des angles
 * uniformément aléatoires produiraient des paquets et de grands arcs vides —
 * ça se lit comme un bug, pas comme du givre. Borné à 0,75, l'écart entre
 * deux voisins ne descend jamais sous 25 % de la tranche nominale, donc aucun
 * pic n'en croise un autre (`frost-star.test.ts` le tient).
 */
export const ANGLE_JITTER = 0.75
export const STAR_DURATION_MS = 450
/** Opacité de départ du remplissage. */
const FILL_ALPHA = 0.85
/** Borne dure, plus basse que les 24 anneaux de `shockwave.ts` : une étoile coûte 13 triangles. */
const STAR_LIMIT = 8

/** Angle du pic `index` : répartition régulière plus un écart borné ; `jitter01` dans [0, 1]. */
export function spikeAngle(index: number, count: number, jitter01: number): number {
  const tranche = (Math.PI * 2) / count
  return index * tranche + (jitter01 * 2 - 1) * (tranche / 2) * ANGLE_JITTER
}

/**
 * Longueur du pic `index`. L'indice 0 vaut `radius` exactement quel que soit
 * le tirage : sans ce pic garanti, une étoile pourrait être entièrement plus
 * courte que la portée réelle. Même exigence que le disque de vérité tracé
 * partout ailleurs — le dessin ne promet jamais moins ni plus que ce qui agit.
 */
export function spikeLength(index: number, radius: number, rand01: number): number {
  if (index === 0) {
    return radius
  }
  return radius * (SPIKE_MIN_RATIO + rand01 * (1 - SPIKE_MIN_RATIO))
}

/** Fondu et affinement, de 1 à 0. Borné : `progress` peut sortir de [0, 1] sur une image longue. */
export function starTaper(progress: number): number {
  return Math.min(1, Math.max(0, 1 - progress))
}

/**
 * Étoiles de givre du Gel. Même couche que les anneaux d'onde de choc.
 *
 * `Math.random()` est autorisé ici (`src/render/`), mais il ne sert qu'à
 * l'émission : les fonctions de géométrie reçoivent leur tirage en paramètre
 * et restent pures, donc testables — même parti que `death-sequence.ts`.
 */
export function createFrostStars(container: Container): FrostStars {
  const stars: Star[] = []

  return {
    emit(x, y, opts): void {
      if (stars.length >= STAR_LIMIT) {
        // FIFO simple : contrairement aux anneaux, une étoile n'a pas de délai
        // d'entrée, donc aucune ne risque d'être évincée avant d'avoir été vue.
        const [evicted] = stars.splice(0, 1)
        evicted?.gfx.destroy()
      }
      const gfx = new Graphics()
      gfx.x = x
      gfx.y = y
      container.addChild(gfx)

      // Tirée une seule fois : la géométrie ne bouge plus de toute la vie de
      // l'étoile. Un pic qui pousserait vers l'extérieur décrirait une onde qui
      // met du temps à arriver — le mensonge même qu'on retire au Gel.
      const spikes: Spike[] = []
      for (let i = 0; i < SPIKE_COUNT; i++) {
        spikes.push({
          angle: spikeAngle(i, SPIKE_COUNT, Math.random()),
          length: spikeLength(i, opts.radius, Math.random()),
        })
      }

      stars.push({
        gfx,
        color: opts.color,
        spikes,
        halfWidth: opts.radius * SPIKE_HALF_WIDTH_RATIO,
        life: STAR_DURATION_MS,
        maxLife: STAR_DURATION_MS,
      })
    },

    update(dtMs): void {
      for (let i = stars.length - 1; i >= 0; i--) {
        const star = stars[i]
        if (!star) {
          continue
        }
        star.life -= dtMs
        if (star.life <= 0) {
          star.gfx.destroy()
          stars.splice(i, 1)
          continue
        }
        const taper = starTaper(1 - star.life / star.maxLife)
        // La base s'affine, la longueur ne bouge pas : la portée reste lisible
        // jusqu'au bout, sans que l'étoile finisse en tache nette plaquée sur
        // l'image (le piège documenté dans `shockwave.ts`).
        const half = star.halfWidth * taper

        star.gfx.clear()
        for (const spike of star.spikes) {
          const cos = Math.cos(spike.angle)
          const sin = Math.sin(spike.angle)
          // Triangle isocèle : pointe sur l'axe du pic, deux coins de base
          // posés sur le point d'explosion lui-même, écartés perpendiculairement.
          star.gfx
            .moveTo(cos * spike.length, sin * spike.length)
            .lineTo(-sin * half, cos * half)
            .lineTo(sin * half, -cos * half)
            .closePath()
        }
        // Un seul `fill` pour les 13 triangles : ils se recouvrent tous au
        // centre, et treize remplissages successifs y empileraient l'opacité
        // en une tache opaque au lieu d'un noyau dense.
        star.gfx.fill({ color: star.color, alpha: FILL_ALPHA * taper })
      }
    },

    destroy(): void {
      for (const star of stars) {
        star.gfx.destroy()
      }
      stars.length = 0
    },
  }
}
