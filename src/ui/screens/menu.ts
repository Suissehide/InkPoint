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
  type MenuNav,
  NAV_DOWN_CODES,
  NAV_INDEX_ATTR,
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

/** Marque la grille défilante d'une vitrine, pour que les flèches sachent quoi faire défiler. */
const SHOWCASE_GRID_ATTR = 'data-showcase-grid'

/**
 * Repli quand la grille est vide et qu'aucune carte ne peut donner sa hauteur.
 * N'arrive pas : les trois vitrines ont un contenu constant.
 */
const SHOWCASE_SCROLL_FALLBACK_PX = 120

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
    <div ${SHOWCASE_GRID_ATTR} class="${CARD_GRID_CLASS}">
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
      <div ${SHOWCASE_GRID_ATTR} class="${CARD_GRID_CLASS}">
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
      <div ${SHOWCASE_GRID_ATTR} class="${CARD_GRID_CLASS}">
        ${SKIN_IDS.map((skin, i) =>
          renderNibTile(skin, {
            unlocked: available.has(skin),
            equipped: skin === equipped,
            selected: i === skinNav.index,
            index: i,
          }),
        ).join('')}
      </div>
      <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('skins.hint')}</div>
    `
  }

  /**
   * Le `nav` que pilote la souris dans la vue courante. Le clic n'en a pas
   * besoin — il est relié à chaque rendu et reçoit donc directement le bon —
   * mais le survol est délégué UNE SEULE FOIS sur `el` (jamais recréé, voir
   * `bindHoverNav`) et doit résoudre sa cible au moment de l'événement. Sans
   * ce relais, survoler une tuile de tracé déplacerait la sélection du menu
   * principal, cachée dessous, et le joueur la retrouverait ailleurs au retour.
   */
  const hoveredNav: MenuNav = {
    get index(): number {
      return view === 'skins' ? skinNav.index : nav.index
    },
    move(delta: number): void {
      ;(view === 'skins' ? skinNav : nav).move(delta)
    },
    set(index: number): void {
      ;(view === 'skins' ? skinNav : nav).set(index)
    },
    reset(): void {
      ;(view === 'skins' ? skinNav : nav).reset()
    },
  }

  const leaveSubview = (): void => {
    view = 'main'
    render()
  }

  /**
   * Fait défiler la grille d'une vitrine d'une rangée. `game.ts` consomme les
   * flèches par `preventDefault` (sinon elles feraient défiler la page en
   * pleine partie) : le défilement natif du cadre `overflow-y-auto` ne se
   * déclenche donc jamais tout seul, et sans cette route les 24 succès — six
   * rangées contre un `max-h-[70vh]` — ne se lisent qu'à la molette.
   */
  const scrollShowcase = (direction: number): void => {
    const grid = el.querySelector<HTMLElement>(`[${SHOWCASE_GRID_ATTR}]`)
    if (!grid) {
      return
    }
    // La hauteur est MESURÉE sur une carte réelle, jamais recalculée depuis
    // `card-grid.ts` : la géométrie y est écrite en `--ui`, la recopier ici la
    // ferait diverger en silence au premier réglage de la rampe.
    const first = grid.firstElementChild
    const step = first instanceof HTMLElement ? first.offsetHeight : SHOWCASE_SCROLL_FALLBACK_PX
    grid.scrollBy({ top: direction * step })
  }

  /**
   * Ramène la tuile choisie dans le cadre défilant. Réservé au clavier : la
   * souris ne peut désigner que ce qu'elle voit déjà, et un survol qui fait
   * défiler sous le curseur déplacerait la tuile pointée.
   */
  const revealSelectedSkin = (): void => {
    el.querySelector<HTMLElement>(`[${NAV_INDEX_ATTR}="${skinNav.index}"]`)?.scrollIntoView({
      block: 'nearest',
    })
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
    // `innerHTML` détruit les nœuds précédents (et leurs écouteurs), voir
    // `bindItemActivation`. Le `nav` câblé dépend de la vue : les tuiles de
    // tracés portent `data-nav-index` comme les entrées du menu, mais elles
    // indexent `skinNav` (sept tracés) et non `nav` (cinq entrées). Les
    // brancher sur `nav` déplacerait la sélection du menu principal et
    // activerait une entrée au hasard.
    if (view === 'skins') {
      bindItemActivation(el, skinNav, equipSelectedSkin)
    } else {
      bindItemActivation(el, nav, activate)
    }
    // Le bouton « retour » reste hors `data-nav-index`, dans les trois
    // vitrines : il n'appartient à aucune sélection, et le survoler ne doit
    // déplacer ni celle du menu qu'on retrouvera au retour, ni celle des
    // tracés. Son clic est donc câblé à la main.
    el.querySelector<HTMLElement>('[data-menu-back]')?.addEventListener('click', leaveSubview)
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  bindHoverNav(el, hoveredNav, render)

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
        // Haut/bas alias de gauche/droite : la grille est une seule liste
        // cyclique (`createMenuNav` boucle), et une flèche qui ne fait rien se
        // lit comme un écran cassé. Elles ne font pas défiler la grille ici,
        // contrairement aux deux autres vitrines — c'est `revealSelectedSkin`
        // qui s'en charge, en suivant la tuile choisie.
        if (NAV_LEFT_CODES.includes(code) || NAV_UP_CODES.includes(code)) {
          skinNav.move(-1)
          render()
          revealSelectedSkin()
          return true
        }
        if (NAV_RIGHT_CODES.includes(code) || NAV_DOWN_CODES.includes(code)) {
          skinNav.move(1)
          render()
          revealSelectedSkin()
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
        // Ces deux vitrines n'ont aucune sélection : les flèches verticales y
        // font défiler la grille, la seule chose qu'on puisse y faire d'autre
        // que sortir.
        if (NAV_UP_CODES.includes(code)) {
          scrollShowcase(-1)
          return true
        }
        if (NAV_DOWN_CODES.includes(code)) {
          scrollShowcase(1)
          return true
        }
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
