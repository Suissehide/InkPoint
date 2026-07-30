export interface MenuNav {
  readonly index: number
  move(delta: number): void
  /** Pose l'index directement — c'est ce que le survol souris utilise (voir `bindPointerNav`). */
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

/** Attribut posé sur chaque entrée cliquable/survolable d'un écran (voir `bindPointerNav`). */
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
 * Branche souris et clavier sur une seule et même sélection (spec : jamais
 * deux curseurs qui pointent des entrées différentes). Survoler une entrée
 * `[data-nav-index]` déplace `nav` — exactement comme les flèches — et
 * redessine ; cliquer l'active avec le même index. Posé une seule fois sur le
 * conteneur stable de l'écran (jamais recréé par `render()`), donc valable à
 * travers tous les redessins qui suivent.
 */
export function bindPointerNav(
  root: HTMLElement,
  nav: MenuNav,
  render: () => void,
  activate: (index: number) => void,
): void {
  root.addEventListener('pointerover', (event) => {
    const index = navIndexFromEvent(event, root)
    if (index === null || index === nav.index) {
      return
    }
    nav.set(index)
    render()
  })

  root.addEventListener('click', (event) => {
    const index = navIndexFromEvent(event, root)
    if (index === null) {
      return
    }
    nav.set(index)
    activate(index)
  })
}

// Les mêmes touches physiques pilotent le déplacement du joueur (`src/app/keyboard.ts`)
// et la navigation des menus : ZQSD, WASD et les flèches restent actifs partout,
// pour que « tout au clavier » (spec §6.8) ne force jamais à changer de main.
export const NAV_UP_CODES: readonly string[] = ['ArrowUp', 'KeyW', 'KeyZ']
export const NAV_DOWN_CODES: readonly string[] = ['ArrowDown', 'KeyS']
export const NAV_LEFT_CODES: readonly string[] = ['ArrowLeft', 'KeyA', 'KeyQ']
export const NAV_RIGHT_CODES: readonly string[] = ['ArrowRight', 'KeyD']

/**
 * Puce d'encre pour l'entrée sélectionnée d'une liste de menu — un trait CSS,
 * pas un caractère de police. Une flèche textuelle (« » », initialement
 * choisie) s'était révélée être l'un des glyphes présents mais **vides** de
 * l'ancienne police d'interface (`Ink Pen`, remplacée depuis par Kalam — voir
 * `numeral.ts`) : elle aurait été invisible à l'écran. Un trait dessiné en
 * CSS ne dépend d'aucune police.
 */
export function renderNavMarker(active: boolean): string {
  return `<span class="inline-block h-1 w-4 rounded-full bg-paper transition-opacity ${active ? 'opacity-100' : 'opacity-0'}"></span>`
}
