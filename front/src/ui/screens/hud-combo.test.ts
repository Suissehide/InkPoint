import { describe, expect, it } from 'vitest'

import { comboTint } from './hud-combo'

describe('comboTint', () => {
  it('rend la couleur du papier au multiplicateur ×1', () => {
    expect(comboTint(1)).toBe('rgb(234 228 214)')
  })

  it('rend la couleur blast au multiplicateur maximal ×10', () => {
    expect(comboTint(10)).toBe('rgb(255 209 102)')
  })

  it('interpole entre les deux aux multiplicateurs intermédiaires', () => {
    expect(comboTint(5)).not.toBe(comboTint(1))
    expect(comboTint(5)).not.toBe(comboTint(10))
  })

  it('borne les valeurs hors plage au lieu de les extrapoler', () => {
    expect(comboTint(0)).toBe(comboTint(1))
    expect(comboTint(99)).toBe(comboTint(10))
  })
})
