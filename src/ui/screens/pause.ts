import { onLocaleChange, t } from '@/i18n'
import { createMenuNav, NAV_DOWN_CODES, NAV_UP_CODES, renderNavMarker } from '../menu-nav'
import { renderText } from '../numeral'

export interface PauseActions {
  onResume(): void
  onSettings(): void
  onQuit(): void
}

export interface PauseScreen {
  show(): void
  hide(): void
  handleKey(code: string): boolean
}

type Entry = 'resume' | 'settings' | 'quit'
const ENTRIES: readonly Entry[] = ['resume', 'settings', 'quit']
const LABEL_KEY: Record<Entry, string> = {
  resume: 'pause.resume',
  settings: 'pause.settings',
  quit: 'pause.quit',
}

/** `Échap` reprend toujours le jeu, quelle que soit l'entrée survolée (spec §4.2). */
export function createPauseScreen(root: HTMLElement, actions: PauseActions): PauseScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-6 bg-ink-deep/80 text-paper backdrop-blur-sm'
  root.appendChild(el)

  const nav = createMenuNav(ENTRIES.length)

  // `renderText` : « Réglages » et « Abandonner » sont accentués, invisibles
  // en `Ink Pen` telle quelle (voir `numeral.ts`).
  const render = (): void => {
    el.innerHTML = `
      <h2 class="font-display text-2xl tracking-wide">${renderText(t('pause.title'))}</h2>
      <div class="flex flex-col items-center gap-2">
        ${ENTRIES.map((entry, i) => {
          const active = i === nav.index
          return `<div class="flex items-center gap-2 text-lg tracking-[0.15em] transition-opacity ${active ? 'opacity-100' : 'opacity-45'}">${renderNavMarker(active)}<span>${renderText(t(LABEL_KEY[entry]))}</span></div>`
        }).join('')}
      </div>
    `
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  return {
    show(): void {
      nav.reset()
      el.classList.remove('hidden')
      el.classList.add('flex')
      render()
    },

    hide(): void {
      el.classList.add('hidden')
      el.classList.remove('flex')
    },

    handleKey(code: string): boolean {
      if (el.classList.contains('hidden')) {
        return false
      }
      if (code === 'Escape') {
        actions.onResume()
        return true
      }
      if (NAV_UP_CODES.includes(code)) {
        nav.move(-1)
        render()
        return true
      }
      if (NAV_DOWN_CODES.includes(code)) {
        nav.move(1)
        render()
        return true
      }
      if (code === 'Space' || code === 'Enter') {
        const entry = ENTRIES[nav.index]
        if (entry === 'resume') {
          actions.onResume()
        } else if (entry === 'settings') {
          actions.onSettings()
        } else if (entry === 'quit') {
          actions.onQuit()
        }
        return true
      }
      return false
    },
  }
}
