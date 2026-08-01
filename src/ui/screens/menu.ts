import { onLocaleChange, t } from '@/i18n'
import { UPGRADES } from '@/sim/data/upgrades'
import { renderCard } from '../components/card'
import {
  bindHoverNav,
  bindItemActivation,
  createMenuNav,
  NAV_DOWN_CODES,
  NAV_UP_CODES,
  renderNavMarker,
} from '../menu-nav'

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

/** Fond opaque : `game.ts` masque canvas et HUD au menu, rien derrière à montrer. `menu.upgrades` est une vitrine en lecture seule intégrée à cet écran, pas un écran séparé. */
export function createMenuScreen(root: HTMLElement, actions: MenuActions): MenuScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-8 bg-ink-deep text-paper'
  root.appendChild(el)

  let view: 'main' | 'upgrades' = 'main'
  const nav = createMenuNav(ENTRIES.length)

  // `font-display` (Fh Ink) réservé au titre « INK POINT » ; tout le reste en `font-ui` (Kalam).
  const renderMain = (): string => `
    <h1 class="font-display text-5xl tracking-wide">${t('game.title')}</h1>
    <div class="flex flex-col items-center gap-2">
      ${ENTRIES.map((entry, i) => {
        const active = i === nav.index
        return `<div data-nav-index="${i}" class="flex cursor-pointer items-center gap-2 text-lg tracking-[0.15em] transition-opacity ${active ? 'opacity-100' : 'opacity-45'}">${renderNavMarker(active)}<span>${t(ENTRY_LABEL_KEY[entry])}</span></div>`
      }).join('')}
    </div>
    <div class="text-[11px] tracking-[0.18em] opacity-35">${t('menu.hint')}</div>
  `

  // Pistes calées sur la taille fixe de `renderCard` (10rem × 14rem, son `w-40`
  // et son `aspect-[5/7]`), jamais laissées libres :
  // — `auto-rows-[14rem]` : sans hauteur de rangée explicite, les rangées
  //   implicites se calculaient sur le seul contenu texte des cartes, plus
  //   court que la carte elle-même, et chaque rangée chevauchait la suivante ;
  // — `grid-cols-[repeat(auto-fill,10rem)]` plutôt que `grid-cols-4` : à quatre
  //   colonnes imposées, une fenêtre étroite réduit chaque piste sous la
  //   largeur de la carte, qui déborde alors sur sa voisine.
  // Les 52rem plafonnent la grille à quatre cartes par ligne — sans elles, un
  // grand écran en alignerait neuf, bord à bord ; les 80vw gardent une marge de
  // chaque côté quand l'écran est plus étroit.
  const renderUpgrades = (): string => `
    <h2 class="text-2xl tracking-wide">${t('menu.upgrades')}</h2>
    <div class="grid max-h-[70vh] max-w-[min(80vw,52rem)] auto-rows-[14rem] grid-cols-[repeat(auto-fill,10rem)] content-start justify-center gap-4 overflow-y-auto p-2">
      ${UPGRADES.map((card) => renderCard(card, false)).join('')}
    </div>
    <button type="button" data-menu-back class="cursor-pointer rounded border border-paper/40 px-4 py-1 text-sm tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
    <div class="text-[11px] tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
  `

  const leaveUpgrades = (): void => {
    view = 'main'
    render()
  }

  /** Partagée entre `Espace`/`Entrée` (`nav.index`) et le clic (`bindItemActivation`). */
  const activate = (index: number): void => {
    if (view === 'upgrades') {
      return
    }
    const entry = ENTRIES[index]
    if (entry === 'play') {
      actions.onPlay()
    } else if (entry === 'upgrades') {
      view = 'upgrades'
      render()
    } else if (entry === 'settings') {
      actions.onSettings()
    }
  }

  const render = (): void => {
    el.innerHTML = view === 'main' ? renderMain() : renderUpgrades()
    // `innerHTML` détruit les nœuds précédents (et leurs écouteurs), voir `bindItemActivation`.
    bindItemActivation(el, nav, activate)
    // Hors `data-nav-index` : la vitrine ne partage pas le `nav` du menu (trois
    // entrées), et un survol du bouton ne doit pas déplacer la sélection qu'on
    // retrouvera au retour.
    el.querySelector<HTMLElement>('[data-menu-back]')?.addEventListener('click', leaveUpgrades)
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  bindHoverNav(el, nav, render)

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
        // `Espace`/`Entrée` aussi : le bouton « retour » est la seule commande
        // de la vitrine, valider n'y a pas d'autre sens.
        if (code === 'Escape' || code === 'Space' || code === 'Enter') {
          leaveUpgrades()
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
        activate(nav.index)
        return true
      }
      return false
    },
  }
}
