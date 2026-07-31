export interface MenuNav {
  readonly index: number
  move(delta: number): void
  /** Pose l'index directement — c'est ce que le survol souris utilise (voir `bindHoverNav`). */
  set(index: number): void
  reset(): void
}

/** Navigation cyclique : arriver au bout et continuer revient au début. */
export function createMenuNav(count: number): MenuNav {
  let index = 0
  const size = Math.max(1, count)

  return {
    get index() {
      return index
    },
    move(delta: number): void {
      index = (((index + delta) % size) + size) % size
    },
    set(next: number): void {
      index = ((next % size) + size) % size
    },
    reset(): void {
      index = 0
    },
  }
}

/** Attribut posé sur chaque entrée cliquable/survolable d'un écran (voir `bindHoverNav`/`bindItemActivation`). */
export const NAV_INDEX_ATTR = 'data-nav-index'

function navIndexFromEvent(event: Event, root: HTMLElement): number | null {
  const target = event.target
  if (!(target instanceof Element)) {
    return null
  }
  const entry = target.closest<HTMLElement>(`[${NAV_INDEX_ATTR}]`)
  if (!entry || !root.contains(entry)) {
    return null
  }
  const index = Number(entry.dataset.navIndex)
  return Number.isNaN(index) ? null : index
}

/**
 * Délégué sur le conteneur stable de l'écran (jamais recréé par `render()`) :
 * sans risque ici, contrairement au clic (`bindItemActivation`) — au pire une
 * entrée qui n'existe plus au moment de l'événement ne bouge rien.
 */
export function bindHoverNav(root: HTMLElement, nav: MenuNav, render: () => void): void {
  root.addEventListener('pointerover', (event) => {
    const index = navIndexFromEvent(event, root)
    if (index === null || index === nav.index) {
      return
    }
    nav.set(index)
    render()
  })
}

/**
 * Écouteur posé sur CHAQUE entrée, jamais délégué sur `root` : un clic n'est
 * précédé d'un survol que par convention (tap tactile, stylet, aide
 * technique n'en garantissent rien), et si le survol qui vient de
 * sélectionner l'entrée déclenche un redessin qui la détache avant que le
 * clic soit traité, une délégation par bulle jusqu'à `root` ne le verrait
 * plus jamais. À rappeler après CHAQUE rendu : `innerHTML` détruit les
 * nœuds — et leurs écouteurs.
 */
export function bindItemActivation(
  root: HTMLElement,
  nav: MenuNav,
  activate: (index: number) => void,
): void {
  for (const item of root.querySelectorAll<HTMLElement>(`[${NAV_INDEX_ATTR}]`)) {
    const index = Number(item.dataset.navIndex)
    if (Number.isNaN(index)) {
      continue
    }
    item.addEventListener('click', () => {
      // Aligne la sélection visible sur l'entrée activée ; `activate(index)`
      // ne dépend pas de cette ligne, l'index vient de la fermeture.
      nav.set(index)
      activate(index)
    })
  }
}

// Les mêmes touches physiques pilotent le déplacement du joueur (`src/app/keyboard.ts`)
// et la navigation des menus : ZQSD, WASD et les flèches restent actifs partout,
// pour que « tout au clavier » (spec §6.8) ne force jamais à changer de main.
export const NAV_UP_CODES: readonly string[] = ['ArrowUp', 'KeyW', 'KeyZ']
export const NAV_DOWN_CODES: readonly string[] = ['ArrowDown', 'KeyS']
export const NAV_LEFT_CODES: readonly string[] = ['ArrowLeft', 'KeyA', 'KeyQ']
export const NAV_RIGHT_CODES: readonly string[] = ['ArrowRight', 'KeyD']

/** Puce d'encre de l'entrée sélectionnée : un trait CSS, jamais un glyphe de police. */
export function renderNavMarker(active: boolean): string {
  return `<span class="inline-block h-1 w-4 rounded-full bg-paper transition-opacity ${active ? 'opacity-100' : 'opacity-0'}"></span>`
}
