import type { InputState } from '@/sim/input'

const LEFT = new Set(['KeyA', 'KeyQ', 'ArrowLeft'])
const RIGHT = new Set(['KeyD', 'ArrowRight'])
const UP = new Set(['KeyW', 'KeyZ', 'ArrowUp'])
const DOWN = new Set(['KeyS', 'ArrowDown'])

export interface Keyboard {
  writeInto(input: InputState): void
  destroy(): void
}

/**
 * ZQSD, WASD et les flèches sont actifs simultanément : on lit les codes
 * physiques (`event.code`), donc la disposition du clavier n'a pas d'importance.
 */
export function createKeyboard(): Keyboard {
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
      input.moveX = Math.max(-1, Math.min(1, x))
      input.moveY = Math.max(-1, Math.min(1, y))
    },

    destroy(): void {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
