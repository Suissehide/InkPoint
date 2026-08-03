import { describe, expect, it } from 'vitest'

import { axisFromKeys } from './keyboard'

const ALL_CODES = [
  'KeyA',
  'KeyQ',
  'ArrowLeft',
  'KeyD',
  'ArrowRight',
  'KeyW',
  'KeyZ',
  'ArrowUp',
  'KeyS',
  'ArrowDown',
]

/** Toutes les parties d'un tableau, dont l'ensemble vide et le tout. */
function* subsets<T>(items: readonly T[]): Generator<T[]> {
  for (let mask = 0; mask < 2 ** items.length; mask++) {
    yield items.filter((_, i) => (mask & (1 << i)) !== 0)
  }
}

describe('axisFromKeys', () => {
  it('ne rend que des multiples de 1/128, sur toute combinaison de touches tenues', () => {
    // Équivalent, pour le clavier, du balayage `mouse.test.ts` sur `aimInput` :
    // `game.ts` impose désormais la grille `QUANTUM` à toute source
    // (`quantizeInput`), et cette preuve montre que le clavier la respecte déjà
    // par construction — sans dépendre de ce garde-fou pour rester correct.
    for (const combo of subsets(ALL_CODES)) {
      const { moveX, moveY } = axisFromKeys(new Set(combo))
      expect(Number.isInteger(moveX * 128), `moveX=${moveX} pour ${combo.join('+')}`).toBe(true)
      expect(Number.isInteger(moveY * 128), `moveY=${moveY} pour ${combo.join('+')}`).toBe(true)
    }
  })

  it('borne chaque axe à [-1, 1] même avec toutes les touches tenues ensemble', () => {
    // LEFT et UP comptent chacun trois codes (KeyA/KeyQ/ArrowLeft,
    // KeyW/KeyZ/ArrowUp) contre deux à RIGHT et DOWN (KeyD/ArrowRight,
    // KeyS/ArrowDown) : tout tenir ensemble ne s'annule donc pas à zéro, ça
    // penche à -1 des deux côtés — et c'est justement ce que ce test borne,
    // plutôt que de supposer une compensation exacte.
    const { moveX, moveY } = axisFromKeys(new Set(ALL_CODES))
    expect(moveX).toBe(-1)
    expect(moveY).toBe(-1)
  })

  it('annule un axe quand ses deux touches opposées sont tenues à parts égales', () => {
    expect(axisFromKeys(new Set(['KeyA', 'KeyD']))).toEqual({ moveX: 0, moveY: 0 })
    expect(axisFromKeys(new Set(['KeyW', 'KeyS']))).toEqual({ moveX: 0, moveY: 0 })
  })

  it('additionne ZQSD, WASD et les flèches sans dépendre de la disposition', () => {
    expect(axisFromKeys(new Set(['KeyD']))).toEqual({ moveX: 1, moveY: 0 })
    expect(axisFromKeys(new Set(['ArrowRight']))).toEqual({ moveX: 1, moveY: 0 })
    expect(axisFromKeys(new Set(['KeyA', 'KeyW']))).toEqual({ moveX: -1, moveY: -1 })
    expect(axisFromKeys(new Set(['KeyQ', 'KeyZ']))).toEqual({ moveX: -1, moveY: -1 })
  })

  it('rend une entrée nulle sans touche tenue', () => {
    expect(axisFromKeys(new Set())).toEqual({ moveX: 0, moveY: 0 })
  })
})
