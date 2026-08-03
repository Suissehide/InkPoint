import { onLocaleChange, t } from '@/i18n'
import type { Viewport } from '@/render/viewport'

export interface TouchPause {
  setViewport(viewport: Viewport): void
  setVisible(visible: boolean): void
  destroy(): void
}

/** Écart au coin de l'arène, en pixels de fenêtre. */
const INSET = 16
/** Côté de la cible. 48 px : au-dessus du minimum tactile usuel de 44. */
const SIZE = 48

/**
 * Il n'y a pas d'`Échap` sur téléphone. Posée sur `#ui` et non dans le HUD :
 * celui-ci est `pointer-events-none` et mis à l'échelle par un `transform`,
 * qui deviendrait le repère de tout enfant.
 *
 * Coin bas-droit : le HUD tient déjà les trois zones hautes, et c'est là que
 * repose le pouce droit — symétrique du joystick, hors de sa zone de capture.
 */
export function createTouchPause(root: HTMLElement, onPause: () => void): TouchPause {
  const el = document.createElement('button')
  el.type = 'button'
  el.className =
    'pointer-events-auto absolute hidden items-center justify-center rounded-full border border-paper/40 bg-ink-deep/60 text-paper opacity-70'
  el.style.width = `${SIZE}px`
  el.style.height = `${SIZE}px`
  // Le contenu visible est un pictogramme, mais l'étiquette lue par les
  // technologies d'assistance est du texte : elle doit suivre la langue, que
  // les Réglages peuvent changer en cours de session.
  const label = (): void => el.setAttribute('aria-label', t('hud.pause'))
  label()
  onLocaleChange(label)
  el.innerHTML = '<span class="ui-sm tracking-widest">| |</span>'
  el.addEventListener('click', onPause)
  root.appendChild(el)

  return {
    setViewport(viewport: Viewport): void {
      const right = viewport.x + viewport.arenaWidth * viewport.scale
      const bottom = viewport.y + viewport.arenaHeight * viewport.scale
      el.style.left = `${right - SIZE - INSET}px`
      el.style.top = `${bottom - SIZE - INSET}px`
    },

    setVisible(visible: boolean): void {
      el.classList.toggle('hidden', !visible)
      el.classList.toggle('flex', visible)
    },

    destroy(): void {
      el.removeEventListener('click', onPause)
      el.remove()
    },
  }
}
