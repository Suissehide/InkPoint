import { ACHIEVEMENTS } from '@/app/achievements/catalog'
import { equipSkin, readSkin, readUnlocked, unlockedSkins } from '@/app/achievements/store'
import { onLocaleChange, t } from '@/i18n'
import { SKIN_IDS, type SkinId } from '@/render/views/nibs'
import { UPGRADES } from '@/sim/data/upgrades'
import { renderAchievementCard } from '../components/achievement-card'
import { renderCard } from '../components/card'
import { CARD_GRID_CLASS } from '../components/card-grid'
import { renderNibTile } from '../components/nib-tile'
import {
  bindHoverNav,
  bindItemActivation,
  createMenuNav,
  NAV_DOWN_CODES,
  NAV_LEFT_CODES,
  NAV_RIGHT_CODES,
  NAV_UP_CODES,
  renderNavMarker,
} from '../menu-nav'

export interface MenuActions {
  onPlay(): void
  onSettings(): void
  onSkinChange(skin: SkinId): void
}

export interface MenuScreen {
  show(): void
  hide(): void
  handleKey(code: string): boolean
}

type Entry = 'play' | 'achievements' | 'skins' | 'upgrades' | 'settings'
const ENTRIES: readonly Entry[] = ['play', 'achievements', 'skins', 'upgrades', 'settings']
const ENTRY_LABEL_KEY: Record<Entry, string> = {
  play: 'menu.play',
  achievements: 'menu.achievements',
  skins: 'menu.skins',
  upgrades: 'menu.upgrades',
  settings: 'menu.settings',
}

/** Fond opaque : `game.ts` masque canvas et HUD au menu, rien derrière à montrer. Améliorations et succès sont des vitrines en lecture seule intégrées à cet écran, pas des écrans séparés. */
export function createMenuScreen(root: HTMLElement, actions: MenuActions): MenuScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*1.8)] bg-ink-deep text-paper'
  root.appendChild(el)

  let view: 'main' | 'upgrades' | 'achievements' | 'skins' = 'main'
  const nav = createMenuNav(ENTRIES.length)
  // Le `nav` du menu compte cinq entrées : il ne peut pas servir à la
  // vitrine, qui en a sept.
  const skinNav = createMenuNav(SKIN_IDS.length)

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

  const renderUpgrades = (): string => `
    <h2 class="ui-2xl tracking-wide">${t('menu.upgrades')}</h2>
    <div class="${CARD_GRID_CLASS}">
      ${UPGRADES.map((card) => renderCard(card, false)).join('')}
    </div>
    <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
    <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
  `

  const renderAchievements = (): string => {
    const unlocked = readUnlocked()
    return `
      <h2 class="ui-2xl tracking-wide">${t('achievements.title')}</h2>
      <div class="ui-xs tracking-[0.2em] opacity-50">${t('achievements.progress', {
        done: unlocked.size,
        total: ACHIEVEMENTS.length,
      })}</div>
      <div class="${CARD_GRID_CLASS}">
        ${ACHIEVEMENTS.map((def) => renderAchievementCard(def, unlocked.has(def.id))).join('')}
      </div>
      <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
    `
  }

  const renderSkins = (): string => {
    const unlocked = readUnlocked()
    const available = new Set(unlockedSkins(unlocked))
    const equipped = readSkin(unlocked)
    return `
      <h2 class="ui-2xl tracking-wide">${t('skins.title')}</h2>
      <div class="${CARD_GRID_CLASS}">
        ${SKIN_IDS.map((skin, i) =>
          renderNibTile(skin, {
            unlocked: available.has(skin),
            equipped: skin === equipped,
            selected: i === skinNav.index,
          }),
        ).join('')}
      </div>
      <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('skins.hint')}</div>
    `
  }

  const leaveSubview = (): void => {
    view = 'main'
    render()
  }

  /** N'équipe que ce qui est gagné : la tuile verrouillée ne fait rien. */
  const equipSelectedSkin = (): void => {
    const unlocked = readUnlocked()
    const skin = SKIN_IDS[skinNav.index]
    if (!skin || !unlockedSkins(unlocked).includes(skin)) {
      return
    }
    equipSkin(skin)
    actions.onSkinChange(skin)
    render()
  }

  /** Partagée entre `Espace`/`Entrée` (`nav.index`) et le clic (`bindItemActivation`). */
  const activate = (index: number): void => {
    if (view !== 'main') {
      return
    }
    const entry = ENTRIES[index]
    if (entry === 'play') {
      actions.onPlay()
    } else if (entry === 'achievements') {
      view = 'achievements'
      render()
    } else if (entry === 'skins') {
      view = 'skins'
      skinNav.reset()
      render()
    } else if (entry === 'upgrades') {
      view = 'upgrades'
      render()
    } else if (entry === 'settings') {
      actions.onSettings()
    }
  }

  const render = (): void => {
    if (view === 'main') {
      el.innerHTML = renderMain()
    } else if (view === 'upgrades') {
      el.innerHTML = renderUpgrades()
    } else if (view === 'skins') {
      el.innerHTML = renderSkins()
    } else {
      el.innerHTML = renderAchievements()
    }
    // `innerHTML` détruit les nœuds précédents (et leurs écouteurs), voir `bindItemActivation`.
    bindItemActivation(el, nav, activate)
    // Hors `data-nav-index` : les vitrines ne partagent pas le `nav` du menu
    // (cinq entrées), et un survol du bouton ne doit pas déplacer la sélection
    // qu'on retrouvera au retour.
    el.querySelector<HTMLElement>('[data-menu-back]')?.addEventListener('click', leaveSubview)
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

      // Vue distincte des deux autres vitrines : elle a sa propre sélection
      // (`skinNav`) et une touche qui commet un choix, donc traitée avant le
      // bloc générique `view !== 'main'` plutôt que dedans.
      if (view === 'skins') {
        if (NAV_LEFT_CODES.includes(code)) {
          skinNav.move(-1)
          render()
          return true
        }
        if (NAV_RIGHT_CODES.includes(code)) {
          skinNav.move(1)
          render()
          return true
        }
        if (code === 'Space' || code === 'Enter') {
          equipSelectedSkin()
          return true
        }
        if (code === 'Escape') {
          leaveSubview()
          return true
        }
        return false
      }

      if (view !== 'main') {
        // `Espace`/`Entrée` aussi : le bouton « retour » est la seule commande
        // de la vitrine, valider n'y a pas d'autre sens.
        if (code === 'Escape' || code === 'Space' || code === 'Enter') {
          leaveSubview()
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
