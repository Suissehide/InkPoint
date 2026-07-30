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
 * Survoler une entrée `[data-nav-index]` déplace `nav` — exactement comme
 * les flèches — et redessine (spec : une seule sélection partagée entre
 * clavier et souris). Délégué sur le conteneur stable de l'écran (jamais
 * recréé par `render()`) : sans risque ici, contrairement au clic
 * (`bindItemActivation`) — au pire, une entrée survolée qui n'existe plus au
 * moment de l'événement ne bouge simplement pas la sélection ; rien
 * d'irréversible n'en dépend.
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
 * Pose un écouteur de clic directement sur CHAQUE entrée `[data-nav-index]`
 * actuellement dans `root` — jamais une délégation qui relirait `nav.index`
 * (la sélection courante) au moment du clic. L'entrée qui reçoit le clic
 * s'active elle-même, identifiée par son propre index capturé à la pose de
 * l'écouteur : jamais par ce que le survol a sélectionné en dernier.
 *
 * Ce n'est pas cosmétique. Un clic n'est précédé d'un survol que par
 * convention d'un pointeur de souris physique — un tap tactile, un stylet,
 * ou tout outil d'assistance qui synthétise un clic n'en garantissent rien.
 * Pire : avec une délégation basée sur la bulle d'événement jusqu'à `root`,
 * si le survol qui vient de sélectionner une entrée déclenche un redessin
 * (donc détache le nœud tout juste survolé) avant que le clic ne soit
 * traité, l'événement ne remonte plus jusqu'à `root` — silencieusement rien
 * ne se passe. Un écouteur posé ICI, sur le nœud lui-même, se déclenche que
 * ce nœud soit encore attaché ou non : il n'y a jamais de sélection
 * partagée à relire pour savoir quoi activer.
 *
 * À rappeler après CHAQUE rendu (dans `render()` lui-même, en dernière
 * ligne) : `innerHTML` détruit les nœuds — et leurs écouteurs — à chaque
 * redessin.
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
      // Aligne aussi la sélection visible sur ce qui vient d'être activé
      // (utile quand le clic n'a pas été précédé d'un survol) — mais
      // `activate(index)` ci-dessus ne dépend jamais de cette ligne :
      // l'index vient de la fermeture, pas d'une relecture de `nav`.
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
