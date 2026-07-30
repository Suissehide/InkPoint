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

  let peak = 0
  let remaining = 0
  let total = DEFAULT_DURATION_MS

  // Rectangle BLANC dessiné une fois pour toutes, chaque flash n'en changeant
  // que la teinte : quinze kills dans le même pas retessellaient sinon quinze
  // fois le même rectangle. Et comme le redimensionnement le redessine, un
  // agrandissement en cours de flash ne peut plus laisser une bande à
  // découvert — le bug disparaît par construction au lieu d'être rattrapé.
  const redraw = (w: number, h: number): void => {
    gfx.clear()
    gfx.rect(0, 0, w, h).fill({ color: 0xffffff })
  }
  redraw(width, height)

  return {
    flash(color, alpha, durationMs = DEFAULT_DURATION_MS): void {
      gfx.tint = color
      // Le pic ne descend jamais en cours de retombée : un second flash plus
      // faible pendant qu'un fort s'efface ne doit pas assombrir l'image.
      peak = Math.max(gfx.alpha, alpha)
      // Ni le raccourcir : un kill juste après une mort tronquait sinon les
      // 260 ms du flash de mort à 120 ms.
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
