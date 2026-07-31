import { type Container, Graphics } from 'pixi.js'

interface Ring {
  gfx: Graphics
  color: number
  maxRadius: number
  thickness: number
  life: number
  maxLife: number
  fromRadius: number
  needles: number
  delayMs: number
}

export interface ShockwaveOptions {
  color: number
  radius: number
  durationMs?: number
  thickness?: number
  /** Rayon de départ ; au-delà de `radius`, l'anneau se contracte. Par défaut 0. */
  fromRadius?: number
  /** Dessine l'onde en N aiguilles radiales plutôt qu'en cercle. */
  needles?: number
  /** Délai avant que l'anneau ne commence à vivre, en ms. */
  delayMs?: number
}

export interface Shockwaves {
  emit(x: number, y: number, opts: ShockwaveOptions): void
  update(dtMs: number): void
  destroy(): void
}

const DEFAULT_DURATION_MS = 300
const DEFAULT_THICKNESS = 3
/** Borne dure : un gros combo peut demander plusieurs anneaux par frame. */
const RING_LIMIT = 24
/** Rayon intérieur des aiguilles de givre, en fraction du rayon de l'onde. */
const NEEDLE_INNER = 0.78
/** Dépassement d'une aiguille sur deux. */
const NEEDLE_OVERSHOOT = 1.14

/**
 * Rayon d'un anneau qui va de `fromRadius` à `toRadius` à `progress` (0 → 1).
 * Même courbe ease-out cubique que `ringRadius`, dont elle est la
 * généralisation : l'onde part vite puis freine, qu'elle s'étende ou se
 * contracte.
 */
export function ringRadiusBetween(progress: number, fromRadius: number, toRadius: number): number {
  return fromRadius + (toRadius - fromRadius) * (1 - (1 - progress) ** 3)
}

/**
 * Rayon d'un anneau à `progress` (0 → 1). Courbe ease-out cubique : l'onde
 * part vite puis freine, comme une onde de choc réelle qui perd son énergie.
 */
export function ringRadius(progress: number, maxRadius: number): number {
  return ringRadiusBetween(progress, 0, maxRadius)
}

/**
 * Rayon extérieur de l'aiguille `index`. Une sur deux dépasse : une onde de
 * givre dont toutes les pointes s'arrêtent au même rayon se relit comme un
 * cercle, exactement ce qu'on cherche à éviter (spec §4.2).
 */
export function needleOuter(index: number, radius: number): number {
  return radius * (index % 2 === 0 ? 1 : NEEDLE_OVERSHOOT)
}

/**
 * Index de l'anneau à sacrifier quand `RING_LIMIT` est atteint. Priorité à un
 * anneau déjà rendu (délai épuisé, `delayMs <= 0`) ; si tous attendent
 * encore leur délai, on retombe sur le plus ancien (FIFO). Sans cette
 * priorité, une seconde onde retardée peut être évincée avant d'avoir
 * jamais été affichée.
 */
export function evictionIndex(delaysMs: readonly number[]): number {
  const index = delaysMs.findIndex((delay) => delay <= 0)
  return index === -1 ? 0 : index
}

/** Anneaux d'onde de choc. Même couche que les particules, au-dessus des entités. */
export function createShockwaves(container: Container): Shockwaves {
  const rings: Ring[] = []

  return {
    emit(x, y, opts): void {
      if (rings.length >= RING_LIMIT) {
        const index = evictionIndex(rings.map((ring) => ring.delayMs))
        const [evicted] = rings.splice(index, 1)
        evicted?.gfx.destroy()
      }
      const gfx = new Graphics()
      gfx.x = x
      gfx.y = y
      const delayMs = opts.delayMs ?? 0
      gfx.visible = delayMs <= 0
      container.addChild(gfx)
      const maxLife = opts.durationMs ?? DEFAULT_DURATION_MS
      rings.push({
        gfx,
        color: opts.color,
        maxRadius: opts.radius,
        thickness: opts.thickness ?? DEFAULT_THICKNESS,
        life: maxLife,
        maxLife,
        fromRadius: opts.fromRadius ?? 0,
        needles: opts.needles ?? 0,
        delayMs,
      })
    },

    update(dtMs): void {
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]
        if (!ring) {
          continue
        }
        if (ring.delayMs > 0) {
          ring.delayMs -= dtMs
          if (ring.delayMs > 0) {
            continue
          }
          ring.gfx.visible = true
        }
        ring.life -= dtMs
        if (ring.life <= 0) {
          ring.gfx.destroy()
          rings.splice(i, 1)
          continue
        }
        const progress = 1 - ring.life / ring.maxLife
        const radius = ringRadiusBetween(progress, ring.fromRadius, ring.maxRadius)
        const width = Math.max(0.5, ring.thickness * (1 - progress))
        const alpha = 1 - progress
        // L'anneau s'affine et s'efface en même temps qu'il s'étend : sans les
        // deux, il finit en gros cercle net qui reste plaqué sur l'image.
        ring.gfx.clear()
        if (ring.needles > 0) {
          for (let n = 0; n < ring.needles; n++) {
            const angle = (n / ring.needles) * Math.PI * 2
            const inner = radius * NEEDLE_INNER
            const outer = needleOuter(n, radius)
            ring.gfx
              .moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
              .lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
          }
          ring.gfx.circle(0, 0, radius * NEEDLE_INNER).stroke({ color: ring.color, width, alpha })
        } else {
          ring.gfx.circle(0, 0, radius).stroke({ color: ring.color, width, alpha })
        }
      }
    },

    destroy(): void {
      for (const ring of rings) {
        ring.gfx.destroy()
      }
      rings.length = 0
    },
  }
}
