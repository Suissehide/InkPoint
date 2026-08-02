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
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*1.8)] bg-ink-deep text-paper'
  root.appendChild(el)

  let view: 'main' | 'upgrades' = 'main'
  const nav = createMenuNav(ENTRIES.length)

  // `font-display` (Fh Ink) réservé au titre « INK POINT » ; tout le reste en `font-ui` (Kalam).
  const renderMain = (): string => `
    <h1 class="font-display text-[calc(var(--ui)*2.9)] tracking-wide">${t('game.title')}</h1>
    <div class="flex flex-col items-center gap-[calc(var(--ui)*0.4)]">
      ${ENTRIES.map((entry, i) => {
        const active = i === nav.index
        return `<div data-nav-index="${i}" class="ui-lg flex cursor-pointer items-center gap-[0.4em] tracking-[0.15em] transition-opacity ${active ? 'opacity-100' : 'opacity-45'}">${renderNavMarker(active)}<span>${t(ENTRY_LABEL_KEY[entry])}</span></div>`
      }).join('')}
    </div>
    <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.hint')}</div>
  `

  // Pistes calées sur la taille de `renderCard` (largeur `9,5 × --ui`, hauteur
  // déduite de son `aspect-[5/7]`, soit `13,3 × --ui`), jamais laissées libres :
  // — `auto-rows-[…]` : sans hauteur de rangée explicite, les rangées
  //   implicites se calculaient sur le seul contenu texte des cartes, plus
  //   court que la carte elle-même, et chaque rangée chevauchait la suivante ;
  // — `grid-cols-[repeat(auto-fill,…)]` plutôt que `grid-cols-4` : à quatre
  //   colonnes imposées, une fenêtre étroite réduit chaque piste sous la
  //   largeur de la carte, qui déborde alors sur sa voisine.
  // Le plafond de `41 × --ui` tient quatre cartes et leurs trois écarts sur une
  // ligne — sans lui, un grand écran en alignerait neuf, bord à bord ; les
  // 80vw gardent une marge de chaque côté quand l'écran est plus étroit.
  // Ces trois valeurs sont solidaires de `renderCard` : la changer sans les
  // suivre casse la grille en silence.
  const renderUpgrades = (): string => `
    <h2 class="ui-2xl tracking-wide">${t('menu.upgrades')}</h2>
    <div class="grid max-h-[70vh] max-w-[min(80vw,calc(var(--ui)*41))] auto-rows-[calc(var(--ui)*13.3)] grid-cols-[repeat(auto-fill,calc(var(--ui)*9.5))] content-start justify-center gap-[calc(var(--ui)*0.8)] overflow-y-auto p-[calc(var(--ui)*0.4)]">
      ${UPGRADES.map((card) => renderCard(card, false)).join('')}
    </div>
    <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
    <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
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
