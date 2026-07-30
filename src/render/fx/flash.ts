import { type Container, Graphics } from 'pixi.js'

export interface Flash {
  /** `alpha` est le pic ; il retombe linéairement à 0 sur `durationMs`. */
  flash(color: number, alpha: number, durationMs?: number): void
  resize(width: number, height: number): void
  update(dtMs: number): void
  destroy(): void
}

const DEFAULT_DURATION_MS = 120

/**
 * Voile plein écran qui flashe et retombe. En `Graphics` plutôt qu'en shader :
 * il continue de fonctionner filtres coupés, et n'ajoute aucun uniforme à la
 * vignette, dont l'intensité est déjà pilotée par la proximité du danger
 * (spec §5.3).
 */
export function createFlash(container: Container, width: number, height: number): Flash {
  const gfx = new Graphics()
  gfx.alpha = 0
  container.addChild(gfx)

  let w = width
  let h = height
  let peak = 0
  let remaining = 0
  let total = DEFAULT_DURATION_MS

  return {
    flash(color, alpha, durationMs = DEFAULT_DURATION_MS): void {
      gfx.clear()
      gfx.rect(0, 0, w, h).fill({ color })
      // Le pic ne descend jamais en cours de retombée : un second flash plus
      // faible pendant qu'un fort s'efface ne doit pas assombrir l'image.
      peak = Math.max(gfx.alpha, alpha)
      total = durationMs
      remaining = durationMs
      gfx.alpha = peak
    },

    resize(width, height): void {
      w = width
      h = height
    },

    update(dtMs): void {
      if (remaining <= 0) {
        return
      }
      remaining -= dtMs
      gfx.alpha = remaining <= 0 ? 0 : peak * (remaining / total)
    },

    destroy(): void {
      gfx.destroy()
    },
  }
}
