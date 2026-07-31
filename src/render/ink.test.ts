import { describe, expect, it } from 'vitest'

import { INK, mixColor } from './ink'

describe('mixColor', () => {
  it('rend la première couleur à 0', () => {
    expect(mixColor(INK.danger, INK.paper, 0)).toBe(INK.danger)
  })

  it('rend la seconde à 1', () => {
    expect(mixColor(INK.danger, INK.paper, 1)).toBe(INK.paper)
  })

  it('mélange composante par composante', () => {
    // 127,5 arrondi à 128 : le mélange arrondit au canal le plus proche plutôt
    // que de tronquer, sans quoi chaque composante dériverait vers le sombre.
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080)
    expect(mixColor(0x000000, 0xff0000, 1)).toBe(0xff0000)
  })

  it('borne les facteurs hors de [0, 1]', () => {
    expect(mixColor(INK.danger, INK.paper, -3)).toBe(INK.danger)
    expect(mixColor(INK.danger, INK.paper, 12)).toBe(INK.paper)
  })
})
