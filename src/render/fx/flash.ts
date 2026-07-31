import { type Container, Graphics } from 'pixi.js'

export interface Flash {
  /** `alpha` est le pic ; il retombe linéairement à 0 sur `durationMs`. */
  flash(color: number, alpha: number, durationMs?: number): void
  resize(width: number, height: number): void
  update(dtMs: number): void
  destroy(): void
}

const DEFAULT_DURATION_MS = 120

/** En `Graphics` plutôt qu'en shader : continue de fonctionner filtres coupés, sans ajouter d'uniforme à la vignette. */
export function createFlash(container: Container, width: number, height: number): Flash {
  const gfx = new Graphics()
  gfx.alpha = 0
  container.addChild(gfx)

  let peak = 0
  let remaining = 0
  let total = DEFAULT_DURATION_MS

  // Rectangle blanc dessiné une fois, chaque flash n'en changeant que la teinte
  // (`gfx.tint`) — évite de retesseller à chaque kill.
  const redraw = (w: number, h: number): void => {
    gfx.clear()
    gfx.rect(0, 0, w, h).fill({ color: 0xffffff })
  }
  redraw(width, height)

  return {
    flash(color, alpha, durationMs = DEFAULT_DURATION_MS): void {
      gfx.tint = color
      // Ni le pic ni la durée ne redescendent en cours de retombée : un flash
      // plus faible ou plus court ne doit jamais assombrir/tronquer un flash en cours.
      peak = Math.max(gfx.alpha, alpha)
      total = Math.max(remaining, durationMs)
      remaining = total
      gfx.alpha = peak
    },

    resize(width, height): void {
      redraw(width, height)
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
