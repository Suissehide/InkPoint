import { type Container, Graphics } from 'pixi.js'

interface Ring {
  gfx: Graphics
  color: number
  maxRadius: number
  thickness: number
  life: number
  maxLife: number
}

export interface ShockwaveOptions {
  color: number
  radius: number
  durationMs?: number
  thickness?: number
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

/**
 * Rayon d'un anneau à `progress` (0 → 1). Courbe ease-out cubique : l'onde
 * part vite puis freine, comme une onde de choc réelle qui perd son énergie.
 */
export function ringRadius(progress: number, maxRadius: number): number {
  return maxRadius * (1 - (1 - progress) ** 3)
}

/** Anneaux d'onde de choc. Même couche que les particules, au-dessus des entités. */
export function createShockwaves(container: Container): Shockwaves {
  const rings: Ring[] = []

  return {
    emit(x, y, opts): void {
      if (rings.length >= RING_LIMIT) {
        const oldest = rings.shift()
        oldest?.gfx.destroy()
      }
      const gfx = new Graphics()
      gfx.x = x
      gfx.y = y
      container.addChild(gfx)
      const maxLife = opts.durationMs ?? DEFAULT_DURATION_MS
      rings.push({
        gfx,
        color: opts.color,
        maxRadius: opts.radius,
        thickness: opts.thickness ?? DEFAULT_THICKNESS,
        life: maxLife,
        maxLife,
      })
    },

    update(dtMs): void {
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]
        if (!ring) {
          continue
        }
        ring.life -= dtMs
        if (ring.life <= 0) {
          ring.gfx.destroy()
          rings.splice(i, 1)
          continue
        }
        const progress = 1 - ring.life / ring.maxLife
        const radius = ringRadius(progress, ring.maxRadius)
        // L'anneau s'affine et s'efface en même temps qu'il s'étend : sans les
        // deux, il finit en gros cercle net qui reste plaqué sur l'image.
        ring.gfx.clear()
        ring.gfx.circle(0, 0, radius).stroke({
          color: ring.color,
          width: Math.max(0.5, ring.thickness * (1 - progress)),
          alpha: 1 - progress,
        })
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
