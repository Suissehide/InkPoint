import type { InputState } from '@/sim/input'

const LEFT = new Set(['KeyA', 'KeyQ', 'ArrowLeft'])
const RIGHT = new Set(['KeyD', 'ArrowRight'])
const UP = new Set(['KeyW', 'KeyZ', 'ArrowUp'])
const DOWN = new Set(['KeyS', 'ArrowDown'])
// Tuple à taille fixe : les index littéraux 0/1/2 restent typés `string`
// (pas `string | undefined`) sous `noUncheckedIndexedAccess`.
const SLOT_KEYS: readonly [string, string, string] = ['Digit1', 'Digit2', 'Digit3']

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
  const pressedThisFrame = new Set<string>()

  const onDown = (e: KeyboardEvent): void => {
    if (!held.has(e.code)) {
      pressedThisFrame.add(e.code)
    }
    held.add(e.code)
  }
  const onUp = (e: KeyboardEvent): void => {
    held.delete(e.code)
  }
  const onBlur = (): void => {
    held.clear()
    // Sans ça, une touche pressée juste avant le changement d'onglet reste en
    // attente de « front montant » et déclenche un power-up au retour, alors
    // que le joueur n'a rien pressé depuis.
    pressedThisFrame.clear()
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

      // Les power-ups se déclenchent au front montant, pas en maintien.
      input.slots = [
        pressedThisFrame.has(SLOT_KEYS[0]) || pressedThisFrame.has('Space'),
        pressedThisFrame.has(SLOT_KEYS[1]),
        pressedThisFrame.has(SLOT_KEYS[2]),
      ]
      pressedThisFrame.clear()
    },

    destroy(): void {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
