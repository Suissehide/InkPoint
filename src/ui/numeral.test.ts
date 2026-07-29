import { describe, expect, it } from 'vitest'

import { renderNumber } from './numeral'

describe('renderNumber', () => {
  it('enrobe chaque chiffre dans une boîte Fh Ink à largeur fixe', () => {
    expect(renderNumber('42')).toBe(
      '<span class="font-display inline-block text-center" style="width:0.64em">4</span>' +
        '<span class="font-display inline-block text-center" style="width:0.64em">2</span>',
    )
  })

  it('bascule aussi « : » vers Fh Ink, sans boîte à largeur fixe', () => {
    expect(renderNumber(':')).toBe('<span class="font-display">:</span>')
  })

  it('formate une durée m:ss complète', () => {
    expect(renderNumber('2:14')).toBe(
      '<span class="font-display inline-block text-center" style="width:0.64em">2</span>' +
        '<span class="font-display">:</span>' +
        '<span class="font-display inline-block text-center" style="width:0.64em">1</span>' +
        '<span class="font-display inline-block text-center" style="width:0.64em">4</span>',
    )
  })

  it("laisse passer l'espace fine et les lettres sans les enrober", () => {
    expect(renderNumber('4 210')).toBe(
      '<span class="font-display inline-block text-center" style="width:0.64em">4</span>' +
        ' ' +
        '<span class="font-display inline-block text-center" style="width:0.64em">2</span>' +
        '<span class="font-display inline-block text-center" style="width:0.64em">1</span>' +
        '<span class="font-display inline-block text-center" style="width:0.64em">0</span>',
    )
  })

  it('laisse passer une chaîne sans aucun chiffre', () => {
    expect(renderNumber('COMBO ×')).toBe('COMBO ×')
  })
})
