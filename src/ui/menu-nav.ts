export interface MenuNav {
  readonly index: number
  move(delta: number): void
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
    reset(): void {
      index = 0
    },
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
 * choisie) s'est révélée être l'un des glyphes présents mais **vides**
 * d'`Ink Pen` (vérifié directement dans le fichier de police, tout comme les
 * chiffres et les voyelles accentuées — voir `numeral.ts`) : elle aurait été
 * invisible à l'écran. Un trait dessiné en CSS ne dépend d'aucune police.
 */
export function renderNavMarker(active: boolean): string {
  return `<span class="inline-block h-1 w-4 rounded-full bg-paper transition-opacity ${active ? 'opacity-100' : 'opacity-0'}"></span>`
}
