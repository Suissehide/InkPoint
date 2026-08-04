import { UPGRADES } from '@sim/data/upgrades'

import { ACHIEVEMENTS } from '@/app/achievements/catalog'
import { equipSkin, readSkin, readUnlocked, unlockedSkins } from '@/app/achievements/store'
import { fetchLeaderboard, type LeaderboardEntry } from '@/app/leaderboard-client'
import { ensureNickname, writeNickname } from '@/app/nickname'
import { onLocaleChange, t } from '@/i18n'
import { SKIN_IDS, type SkinId } from '@/render/views/nibs'
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
import { createLeaderboardPanel } from './leaderboard'

export interface MenuActions {
  onPlay(): void
  onSettings(): void
  onSkinChange(skin: SkinId): void
}

/**
 * Consommées pour le panneau de classement et pour le champ pseudo,
 * injectables comme dans `gameover.ts` (même raison : `vi.mock` n'est pas
 * intercepté sous le lanceur navigateur de ce dépôt — voir la docstring de
 * `GameOverDeps`).
 *
 * `ensureNickname` remplace `readNickname` : ce champ règle le pseudo AVANT
 * qu'une partie ne commence (spec §8), donc il doit toujours en avoir un à
 * pré-remplir — y compris au tout premier lancement, où `ensureNickname` en
 * fabrique un et le mémorise.
 */
export interface MenuDeps {
  fetchLeaderboard: (
    nickname: string | null,
  ) => Promise<{ top: LeaderboardEntry[]; you?: LeaderboardEntry } | null>
  ensureNickname: () => string
  writeNickname: (raw: string) => string | null
}

export interface MenuScreen {
  show(): void
  hide(): void
  handleKey(code: string): boolean
}

type Entry = 'play' | 'achievements' | 'skins' | 'upgrades' | 'leaderboard' | 'settings'
const ENTRIES: readonly Entry[] = [
  'play',
  'achievements',
  'skins',
  'upgrades',
  'leaderboard',
  'settings',
]
const ENTRY_LABEL_KEY: Record<Entry, string> = {
  play: 'menu.play',
  achievements: 'menu.achievements',
  skins: 'menu.skins',
  upgrades: 'menu.upgrades',
  // Même clé que le titre du panneau (`leaderboard.ts`) : la même chose y est dite, doublonner
  // la traduction n'apporterait rien.
  leaderboard: 'leaderboard.title',
  settings: 'menu.settings',
}

/** Marque la grille défilante d'une vitrine, pour que les flèches sachent quoi faire défiler. */
const SHOWCASE_GRID_ATTR = 'data-showcase-grid'

/**
 * Repli quand la grille est vide et qu'aucune carte ne peut donner sa hauteur.
 * N'arrive pas : les vitrines à cartes (améliorations, succès) ont un
 * contenu constant, et le classement vide ne pose pas du tout de grille à
 * défiler — voir `leaderboard.ts`, état `empty` — donc `scrollShowcase`
 * s'arrête avant d'atteindre cette valeur plutôt que de la déclencher.
 */
const SHOWCASE_SCROLL_FALLBACK_PX = 120

/** Fond opaque : `game.ts` masque canvas et HUD au menu, rien derrière à montrer. Améliorations et succès sont des vitrines en lecture seule intégrées à cet écran, pas des écrans séparés. */
export function createMenuScreen(
  root: HTMLElement,
  actions: MenuActions,
  deps: MenuDeps = { fetchLeaderboard, ensureNickname, writeNickname },
): MenuScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*1.8)] bg-ink-deep text-paper'
  root.appendChild(el)

  // Gabarit propre à chaque vue, redessiné en entier à chaque `render()` — `panelHost`
  // ci-dessous, lui, ne l'est JAMAIS : le panneau de classement pose ses propres nœuds une
  // seule fois (voir `createLeaderboardPanel`) et gère son propre redessin. Sans ce
  // sous-conteneur dédié, `el.innerHTML = …` détruirait le panneau à chaque changement de vue.
  const content = document.createElement('div')
  content.className = 'flex flex-col items-center gap-[calc(var(--ui)*1.8)]'
  el.appendChild(content)

  // Posé AVANT `content` : en vue `leaderboard`, le panneau (titre + liste) doit apparaître
  // au-dessus du bouton « retour » que `content` affiche alors — comme dans les autres
  // vitrines (titre, grille, retour). Hors de cette vue il reste caché et sans emprise sur la
  // mise en page.
  const panelHost = document.createElement('div')
  panelHost.className = 'hidden w-[calc(var(--ui)*18)] max-w-[92vw]'
  el.insertBefore(panelHost, content)
  const leaderboardPanel = createLeaderboardPanel(panelHost)
  // Un chargement lancé pour une ouverture du panneau, encore en vol quand le joueur quitte la
  // vue avant la réponse, ne doit jamais écrire son résultat après coup — même garde que
  // `generation` dans `gameover.ts`.
  let leaderboardGeneration = 0

  let view: 'main' | 'upgrades' | 'achievements' | 'skins' | 'leaderboard' = 'main'
  // Une rangée de plus que d'entrées : la dernière (index `ENTRIES.length`)
  // n'ouvre aucune vue, elle donne le focus au champ pseudo (spec §8) — voir
  // `activate` ci-dessous.
  const nav = createMenuNav(ENTRIES.length + 1)
  // Le `nav` du menu ne peut pas servir à la vitrine des tracés. Celle-ci
  // n'affiche que les tracés gagnés, donc son effectif change au fil de la
  // partie : `createMenuNav` fige son compte, on le reconstruit à chaque
  // entrée dans la vue (`activate`) plutôt que de laisser la sélection
  // pointer une tuile qui n'est pas affichée.
  let skinNav = createMenuNav(1)

  /** Les tracés à afficher : la plume, plus ceux qu'un succès a ouverts. */
  const availableSkins = (): SkinId[] => unlockedSkins(readUnlocked())

  /**
   * Index de la rangée pseudo, juste après les entrées (spec §8) : réglé ICI,
   * dans le menu, AVANT qu'une partie ne commence — jamais demandé au moment
   * de publier (`gameover.ts` publie désormais sans aucun geste du joueur).
   */
  const NICKNAME_NAV_INDEX = ENTRIES.length

  // `font-display` (Fh Ink) réservé au titre « INK POINT » ; tout le reste en `font-ui` (Kalam).
  const renderMain = (): string => {
    const nicknameActive = nav.index === NICKNAME_NAV_INDEX
    return `
    <h1 class="font-display text-[calc(var(--ui)*2.9)] tracking-wide">${t('game.title')}</h1>
    <div class="flex flex-col items-center gap-[calc(var(--ui)*0.4)]">
      ${ENTRIES.map((entry, i) => {
        const active = i === nav.index
        return `<div data-nav-index="${i}" class="ui-lg flex cursor-pointer items-center gap-[0.4em] tracking-[0.15em] transition-opacity ${active ? 'opacity-100' : 'opacity-45'}">${renderNavMarker(active)}<span>${t(ENTRY_LABEL_KEY[entry])}</span></div>`
      }).join('')}
    </div>
    <div class="flex flex-col items-center gap-[calc(var(--ui)*0.25)]">
      <div data-nav-index="${NICKNAME_NAV_INDEX}" class="ui-sm flex cursor-pointer items-center gap-[0.5em] tracking-[0.1em] transition-opacity ${nicknameActive ? 'opacity-100' : 'opacity-60'}">
        ${renderNavMarker(nicknameActive)}
        <span>${t('menu.nickname')}</span>
        <input
          data-nickname-input
          type="text"
          maxlength="20"
          placeholder="${t('menu.nicknamePlaceholder')}"
          class="ui-xs w-[calc(var(--ui)*7)] rounded border border-paper/40 bg-paper/10 px-[0.5em] py-[0.2em] text-paper placeholder:text-paper/40 focus:outline-none focus:border-paper/70"
        />
      </div>
    </div>
    <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.hint')}</div>
  `
  }

  const renderUpgrades = (): string => `
    <h2 class="ui-2xl tracking-wide">${t('menu.upgrades')}</h2>
    <div ${SHOWCASE_GRID_ATTR} class="${CARD_GRID_CLASS}">
      ${UPGRADES.map((card) => renderCard(card, false)).join('')}
    </div>
    <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
    <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
  `

  /**
   * Vue dédiée au classement : contrairement aux autres vitrines, le titre
   * et le corps (chargement, erreur ou liste) viennent de `panelHost` — posé
   * AVANT `content` dans le DOM, donc affiché au-dessus — cette vue ne
   * fournit que le retour, comme les deux vitrines sans sélection
   * (améliorations, succès).
   */
  const renderLeaderboardView = (): string => `
    <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
    <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
  `

  // Seuls les succès acquis sont montrés : le compteur dit combien il en reste
  // à trouver, et rien ne dit lesquels. Une carte fermée annoncerait sa
  // condition, donc la façon de l'obtenir — c'est exactement ce qu'on cache.
  const renderAchievements = (): string => {
    const unlocked = readUnlocked()
    const earned = ACHIEVEMENTS.filter((def) => unlocked.has(def.id))
    return `
      <h2 class="ui-2xl tracking-wide">${t('achievements.title')}</h2>
      <div class="ui-xs tracking-[0.2em] opacity-50">${t('achievements.progress', {
        done: earned.length,
        total: ACHIEVEMENTS.length,
      })}</div>
      <div ${SHOWCASE_GRID_ATTR} class="${CARD_GRID_CLASS}">
        ${earned.map((def) => renderAchievementCard(def)).join('')}
      </div>
      <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
    `
  }

  const renderSkins = (): string => {
    const unlocked = readUnlocked()
    const available = unlockedSkins(unlocked)
    const equipped = readSkin(unlocked)
    return `
      <h2 class="ui-2xl tracking-wide">${t('skins.title')}</h2>
      <div class="ui-xs tracking-[0.2em] opacity-50">${t('achievements.progress', {
        done: available.length,
        total: SKIN_IDS.length,
      })}</div>
      <div ${SHOWCASE_GRID_ATTR} class="${CARD_GRID_CLASS}">
        ${available
          .map((skin, i) =>
            renderNibTile(skin, {
              equipped: skin === equipped,
              selected: i === skinNav.index,
              index: i,
            }),
          )
          .join('')}
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
    // Une réponse en vol pour l'ouverture qu'on quitte ne doit plus écrire
    // sur le panneau, qu'on revienne dessus plus tard ou non.
    leaderboardGeneration += 1
    render()
  }

  /**
   * Charge le classement et bascule sur sa vue. Jamais de `reason` affiché
   * sur `null` (spec) : un classement qu'on n'a pas pu charger n'est pas une
   * faute du joueur, `fetchLeaderboard` n'a d'ailleurs pas d'autre issue que
   * `null` sur tout échec (voir sa docstring) — donc `showError()` sans plus
   * de détail est la seule réaction possible, jamais un panneau vide.
   */
  const openLeaderboard = (): void => {
    view = 'leaderboard'
    render()
    leaderboardGeneration += 1
    const startedAt = leaderboardGeneration
    leaderboardPanel.showLoading()
    void deps.fetchLeaderboard(deps.ensureNickname()).then((data) => {
      if (startedAt !== leaderboardGeneration) {
        return
      }
      if (data) {
        leaderboardPanel.show(data)
      } else {
        leaderboardPanel.showError()
      }
    })
  }

  /**
   * Fait défiler la grille d'une vitrine d'une rangée. `game.ts` consomme les
   * flèches par `preventDefault` (sinon elles feraient défiler la page en
   * pleine partie) : le défilement natif du cadre `overflow-y-auto` ne se
   * déclenche donc jamais tout seul, et sans cette route les 24 succès — six
   * rangées contre un `max-h-[70vh]` — ne se lisent qu'à la molette. Le
   * classement suit la même route : sa propre zone défilante (`[data-scroll]`,
   * dans `panelHost`) n'a pas d'attribut `SHOWCASE_GRID_ATTR` — posé sur les
   * grilles de cartes seulement — d'où le second repli ci-dessous.
   */
  const scrollShowcase = (direction: number): void => {
    const grid =
      content.querySelector<HTMLElement>(`[${SHOWCASE_GRID_ATTR}]`) ??
      panelHost.querySelector<HTMLElement>('[data-scroll]')
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
    content
      .querySelector<HTMLElement>(`[${NAV_INDEX_ATTR}="${skinNav.index}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  /**
   * L'index désigne un rang dans la liste AFFICHÉE, relue ici plutôt que
   * mémorisée : elle et `skinNav` doivent désigner la même tuile, et un succès
   * gagné entre deux ouvertures de la vue en change la longueur.
   */
  const equipSelectedSkin = (): void => {
    const skin = availableSkins()[skinNav.index]
    if (!skin) {
      return
    }
    equipSkin(skin)
    actions.onSkinChange(skin)
    render()
  }

  /**
   * Écrit la forme normalisée (ou revient au pseudo mémorisé si le champ ne
   * survit pas à la normalisation) — jamais l'inverse.
   *
   * `writeNickname` ne vide jamais le stockage sur un résultat vide (voir sa
   * docstring dans `nickname.ts`) : un pseudo déjà mémorisé reste donc actif
   * même si le champ est vidé ici. Laisser le champ vide mentirait alors sur
   * ce qui sera utilisé à la prochaine publication automatique — il est donc
   * ramené au pseudo réellement actif plutôt que de rester vide sans rien
   * dire (même choix que l'ancien champ de `settings.ts`, déplacé ici).
   */
  const commitNickname = (): void => {
    const input = content.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      return
    }
    const result = deps.writeNickname(input.value)
    input.value = result ?? deps.ensureNickname()
  }

  /** Partagée entre `Espace`/`Entrée` (`nav.index`) et le clic (`bindItemActivation`). */
  const activate = (index: number): void => {
    if (view !== 'main') {
      return
    }
    if (index === NICKNAME_NAV_INDEX) {
      // Le clavier n'a pas d'autre moyen d'entrer le champ : la sélection ne
      // fait que le survoler (comme les autres rangées), taper y exige le
      // focus réel.
      content.querySelector<HTMLInputElement>('[data-nickname-input]')?.focus()
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
      // Reconstruit, pas remis à zéro : le nombre de tracés affichés a pu
      // changer depuis la dernière visite (un succès gagné entre-temps).
      skinNav = createMenuNav(availableSkins().length)
      render()
    } else if (entry === 'upgrades') {
      view = 'upgrades'
      render()
    } else if (entry === 'leaderboard') {
      openLeaderboard()
    } else if (entry === 'settings') {
      actions.onSettings()
    }
  }

  const render = (): void => {
    // `panelHost` n'est visible qu'en vue `leaderboard` : ailleurs il ne doit
    // ni s'afficher ni peser sur la mise en page (l'écart `gap` de `el`
    // s'appliquerait à un enfant vide sinon).
    panelHost.classList.toggle('hidden', view !== 'leaderboard')
    if (view === 'main') {
      content.innerHTML = renderMain()
    } else if (view === 'upgrades') {
      content.innerHTML = renderUpgrades()
    } else if (view === 'skins') {
      content.innerHTML = renderSkins()
    } else if (view === 'leaderboard') {
      content.innerHTML = renderLeaderboardView()
    } else {
      content.innerHTML = renderAchievements()
    }
    // `innerHTML` détruit les nœuds précédents (et leurs écouteurs), voir
    // `bindItemActivation`. Le `nav` câblé dépend de la vue : les tuiles de
    // tracés portent `data-nav-index` comme les entrées du menu, mais elles
    // indexent `skinNav` (les tracés affichés) et non `nav` (six entrées).
    // Les brancher sur `nav` déplacerait la sélection du menu principal et
    // activerait une entrée au hasard.
    if (view === 'skins') {
      bindItemActivation(content, skinNav, equipSelectedSkin)
    } else {
      bindItemActivation(content, nav, activate)
    }
    // Le bouton « retour » reste hors `data-nav-index`, dans les quatre
    // vitrines qui en ont un : il n'appartient à aucune sélection, et le
    // survoler ne doit déplacer ni celle du menu qu'on retrouvera au retour,
    // ni celle des tracés. Son clic est donc câblé à la main.
    content.querySelector<HTMLElement>('[data-menu-back]')?.addEventListener('click', leaveSubview)
    // Le champ pseudo n'existe que dans le gabarit de la vue principale — voir
    // `renderMain`. Jamais posée via l'attribut `value="…"` du gabarit : le
    // pseudo mémorisé n'est assaini contre aucun balisage (même raison que
    // `textContent` au classement, `leaderboard.ts`).
    const nicknameInput = content.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (nicknameInput) {
      nicknameInput.value = deps.ensureNickname()
      nicknameInput.addEventListener('keydown', (e: KeyboardEvent): void => {
        // Empêche le routage clavier global (`game.ts`) de lire cette frappe :
        // sans lui, un Espace tapé ici activerait l'entrée du menu ACTUELLEMENT
        // SÉLECTIONNÉE (« Jouer », par exemple) au lieu de s'écrire dans le
        // champ — `game.ts` route `Espace`/`Échap` vers les écrans sans
        // regarder quel élément a le focus.
        e.stopPropagation()
        if (e.code === 'Enter') {
          commitNickname()
          nicknameInput.blur()
        } else if (e.code === 'Escape') {
          // Annule la saisie en cours plutôt que de la republier : le menu
          // principal n'a de toute façon rien à faire d'un `Échap` ici (voir
          // `handleKey`), mais le champ doit rester cohérent avec ce qui est
          // réellement mémorisé.
          nicknameInput.value = deps.ensureNickname()
          nicknameInput.blur()
        }
      })
      // Au clic ailleurs ou à la tabulation : le champ commet aussi en
      // perdant le focus, pas seulement à `Entrée`.
      nicknameInput.addEventListener('blur', () => commitNickname())
      // **À chaque frappe**, et c'est ce qui rend la saisie survivable.
      //
      // `render()` réécrit `content.innerHTML` en entier, et `bindHoverNav` le
      // déclenche au survol de n'importe quelle autre rangée : glisser la
      // souris du champ vers « Jouer » détruit donc cet `input` en cours de
      // route. Le remplaçant se réinitialise depuis `ensureNickname()`, et le
      // `blur` du nœud détruit — s'il arrive — relit le NOUVEAU champ. Sans
      // persistance à la frappe, ce qu'on venait de taper disparaissait sans
      // un mot, et toute la session publiait sous l'ancien pseudo — que la
      // phrase sous ce champ interdit précisément de renommer après coup.
      //
      // On écrit sans réassigner `value` : `commitNickname` normalise et
      // réécrit le champ, ce qui ferait sauter le curseur à chaque touche. La
      // réconciliation de l'affichage reste à `blur` et à `Entrée`.
      nicknameInput.addEventListener('input', () => {
        deps.writeNickname(nicknameInput.value)
      })
    }
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
      // Une réponse en vol d'une ouverture précédente du panneau ne doit
      // jamais s'écrire sur cette nouvelle apparition du menu.
      leaderboardGeneration += 1
      nav.reset()
      el.classList.remove('hidden')
      el.classList.add('flex')
      render()
    },

    hide(): void {
      leaderboardGeneration += 1
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
        // Ces vitrines (améliorations, succès, classement) n'ont aucune
        // sélection : les flèches verticales y font défiler la grille, la
        // seule chose qu'on puisse y faire d'autre que sortir.
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
