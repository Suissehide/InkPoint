import type { InputState } from '@sim/input'

import type { InputSource } from './input-source'

const LEFT = new Set(['KeyA', 'KeyQ', 'ArrowLeft'])
const RIGHT = new Set(['KeyD', 'ArrowRight'])
const UP = new Set(['KeyW', 'KeyZ', 'ArrowUp'])
const DOWN = new Set(['KeyS', 'ArrowDown'])

/**
 * Pure : sépare le calcul de la direction de l'écoute DOM, sur le même
 * modèle qu'`aimInput`/`screenToArena` dans `mouse.ts` — ce qui permet de la
 * tester sans `window` (l'environnement Vitest de `front/` tourne en `node`,
 * sans DOM).
 *
 * `Math.max(-1, Math.min(1, …))` ne peut rendre que -1, 0 ou 1 : les trois
 * sont des multiples entiers de `QUANTUM` (`1/128`), donc déjà sur la grille
 * que `game.ts` impose désormais à toute source (`quantizeInput`,
 * `sim/input.ts`) — voir `keyboard.test.ts` pour la preuve balayée.
 */
export function axisFromKeys(held: ReadonlySet<string>): { moveX: number; moveY: number } {
  let x = 0
  let y = 0
  for (const code of held) {
    if (LEFT.has(code)) {
      x -= 1
    }
    if (RIGHT.has(code)) {
      x += 1
    }
    if (UP.has(code)) {
      y -= 1
    }
    if (DOWN.has(code)) {
      y += 1
    }
  }
  return { moveX: Math.max(-1, Math.min(1, x)), moveY: Math.max(-1, Math.min(1, y)) }
}

/**
 * ZQSD, WASD et les flèches sont actifs simultanément : on lit les codes
 * physiques (`event.code`), donc la disposition du clavier n'a pas d'importance.
 *
 * Se conforme à `InputSource` sans déclarer son second paramètre : le clavier
 * n'a aucun besoin de savoir où est le joueur.
 */
export function createKeyboard(): InputSource {
  const held = new Set<string>()

  const onDown = (e: KeyboardEvent): void => {
    held.add(e.code)
  }
  const onUp = (e: KeyboardEvent): void => {
    held.delete(e.code)
  }
  const onBlur = (): void => {
    held.clear()
  }

  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  // Sans ça, une touche maintenue au moment d'un changement d'onglet reste « enfoncée ».
  window.addEventListener('blur', onBlur)

  return {
    writeInto(input: InputState): void {
      const { moveX, moveY } = axisFromKeys(held)
      input.moveX = moveX
      input.moveY = moveY
    },

    destroy(): void {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
