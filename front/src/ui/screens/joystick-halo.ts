import type { Point } from '@/app/input-source'
import { JOYSTICK_RADIUS } from '@/app/joystick'

export interface JoystickHalo {
  /** `null` : le halo retourne à son ancrage de repos, en bas à gauche. */
  setOrigin(point: Point | null): void
  setVisible(visible: boolean): void
  destroy(): void
}

/** Marge de l'ancrage de repos par rapport au coin bas-gauche de la fenêtre. */
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

  return {
    setOrigin(point: Point | null): void {
      if (point === null) {
        // Ancrage de repos : mesuré sur `root`, donc déjà dans le repère
        // pivoté. `offsetWidth`/`offsetHeight` et non `window.inner*`, qui
        // désignent l'écran non pivoté.
        place(ANCHOR_MARGIN, root.offsetHeight - ANCHOR_MARGIN)
        el.style.opacity = '0.5'
        return
      }
      place(point.x, point.y)
      el.style.opacity = '1'
    },

    setVisible(visible: boolean): void {
      el.classList.toggle('hidden', !visible)
    },

    destroy(): void {
      el.remove()
    },
  }
}
