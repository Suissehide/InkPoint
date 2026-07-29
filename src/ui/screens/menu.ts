import { onLocaleChange, t } from '@/i18n'
import { UPGRADES } from '@/sim/data/upgrades'
import { renderCard } from '../components/card'
import { createMenuNav, NAV_DOWN_CODES, NAV_UP_CODES, renderNavMarker } from '../menu-nav'
import { renderText } from '../numeral'

export interface MenuActions {
  onPlay(): void
  onSettings(): void
}

export interface MenuScreen {
  show(): void
  hide(): void
  handleKey(code: string): boolean
}

type Entry = 'play' | 'upgrades' | 'settings'
const ENTRIES: readonly Entry[] = ['play', 'upgrades', 'settings']
const ENTRY_LABEL_KEY: Record<Entry, string> = {
  play: 'menu.play',
  upgrades: 'menu.upgrades',
  settings: 'menu.settings',
}

/**
 * Le menu ne masque jamais le canvas : `game.ts` fait tourner le jeu en fond au
 * ralenti derrière ce voile `bg-ink-deep/70`, ce qui montre ce qu'est le jeu
 * avant même d'appuyer sur une touche (spec §4.2).
 *
 * `menu.upgrades` ouvre une vitrine en lecture seule de toutes les cartes du
 * jeu, à l'intérieur de cet écran plutôt que dans un écran séparé : la brief ne
 * réserve un constructeur dédié qu'aux cinq écrans listés dans ses interfaces
 * (menu, cartes de fin de vague, game over, pause, réglages), pas à un
 * catalogue — c'est une interprétation, documentée dans le rapport de tâche.
 */
export function createMenuScreen(root: HTMLElement, actions: MenuActions): MenuScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-8 bg-ink-deep/70 text-paper'
  root.appendChild(el)

  let view: 'main' | 'upgrades' = 'main'
  const nav = createMenuNav(ENTRIES.length)

  // `renderText`, pas `t(...)` brut : le français de ce menu est accentué
  // (« Améliorations », « Réglages ») et `Ink Pen` a des glyphes vides pour
  // les voyelles accentuées (vérifié dans le fichier de police — voir
  // `numeral.ts`). Sans ce repli, ces entrées seraient à moitié invisibles.
  const renderMain = (): string => `
    <h1 class="font-display text-5xl tracking-wide">${renderText(t('game.title'))}</h1>
    <div class="flex flex-col items-center gap-2">
      ${ENTRIES.map((entry, i) => {
        const active = i === nav.index
        return `<div class="flex items-center gap-2 text-lg tracking-[0.15em] transition-opacity ${active ? 'opacity-100' : 'opacity-45'}">${renderNavMarker(active)}<span>${renderText(t(ENTRY_LABEL_KEY[entry]))}</span></div>`
      }).join('')}
    </div>
    <div class="text-[11px] tracking-[0.18em] opacity-35">${renderText(t('menu.hint'))}</div>
  `

  const renderUpgrades = (): string => `
    <h2 class="font-display text-2xl tracking-wide">${renderText(t('menu.upgrades'))}</h2>
    <div class="grid max-h-[70vh] max-w-[92vw] grid-cols-4 gap-4 overflow-y-auto p-2">
      ${UPGRADES.map((card) => renderCard(card, false)).join('')}
    </div>
    <div class="text-[11px] tracking-[0.18em] opacity-35">${renderText(t('menu.backHint'))}</div>
  `

  const render = (): void => {
    el.innerHTML = view === 'main' ? renderMain() : renderUpgrades()
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  return {
    show(): void {
      view = 'main'
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

      if (view === 'upgrades') {
        if (code === 'Escape') {
          view = 'main'
          render()
          return true
        }
        return false
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
        if (entry === 'play') {
          actions.onPlay()
        } else if (entry === 'upgrades') {
          view = 'upgrades'
          render()
        } else if (entry === 'settings') {
          actions.onSettings()
        }
        return true
      }
      return false
    },
  }
}
