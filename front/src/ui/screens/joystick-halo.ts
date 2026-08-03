import type { Point } from '@/app/input-source'
import { JOYSTICK_RADIUS } from '@/app/joystick'
import type { Viewport } from '@/render/viewport'

export interface JoystickHalo {
  /** `null` : le halo retourne à son ancrage de repos, en bas à gauche. */
  setOrigin(point: Point | null): void
  /** Rebranché par `game.ts` à chaque `applyLayout` : l'ancrage de repos suit l'arène. */
  setViewport(viewport: Viewport): void
  setVisible(visible: boolean): void
  destroy(): void
}

/** Marge de l'ancrage de repos par rapport au coin bas-gauche de l'aire de jeu. */
const ANCHOR_MARGIN = 92

/**
 * Repère visuel du joystick. `pointer-events-none` : il ne doit rien
 * intercepter — c'est `#app` qui écoute, sur toute la zone de capture, dont le
 * halo n'est que la partie visible.
 *
 * Monté sur `#ui`, donc à l'intérieur de `#app` : il subit la rotation avec le
 * reste et n'a aucune correction d'axes à faire.
 */
export function createJoystickHalo(root: HTMLElement): JoystickHalo {
  const el = document.createElement('div')
  el.className =
    'pointer-events-none absolute hidden rounded-full border-2 border-paper/30 bg-paper/5'
  el.style.width = `${JOYSTICK_RADIUS * 2}px`
  el.style.height = `${JOYSTICK_RADIUS * 2}px`
  root.appendChild(el)

  const place = (x: number, y: number): void => {
    el.style.left = `${x - JOYSTICK_RADIUS}px`
    el.style.top = `${y - JOYSTICK_RADIUS}px`
  }

  // Ancrage de repos, recalculé à chaque `setViewport` et non à chaque image :
  // le lire depuis le DOM en boucle de rendu forcerait un recalcul de mise en
  // page par image tant que le doigt n'est pas posé.
  let anchorX = ANCHOR_MARGIN
  let anchorY = ANCHOR_MARGIN

  return {
    setOrigin(point: Point | null): void {
      if (point === null) {
        place(anchorX, anchorY)
        el.style.opacity = '0.5'
        return
      }
      place(point.x, point.y)
      el.style.opacity = '1'
    },

    setViewport(viewport: Viewport): void {
      // Dérivé de l'aire de jeu, pas du cadre : c'est l'arène que la zone de
      // capture écoute, et un halo posé dans la marge de letterbox
      // désignerait du vide.
      anchorX = viewport.x + ANCHOR_MARGIN
      anchorY = viewport.y + viewport.arenaHeight * viewport.scale - ANCHOR_MARGIN
    },

    setVisible(visible: boolean): void {
      el.classList.toggle('hidden', !visible)
    },

    destroy(): void {
      el.remove()
    },
  }
}
