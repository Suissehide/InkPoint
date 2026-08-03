import { describe, expect, it } from 'vitest'

import { setLocale } from '@/i18n'
import { renderNibTile } from './nib-tile'

const state = { unlocked: true, equipped: false, selected: false }

describe('renderNibTile', () => {
  it('nomme le tracé et dessine sa silhouette', () => {
    setLocale('fr')
    const html = renderNibTile('ball', state)
    expect(html).toContain('La Bille')
    expect(html).toContain('<path')
  })

  it('marque le tracé équipé', () => {
    setLocale('fr')
    expect(renderNibTile('quill', { ...state, equipped: true })).toContain('ÉQUIPÉ')
  })

  // Un tracé fermé doit dire par quoi il s'ouvre : sans cela, la vitrine
  // n'est qu'une liste de choses qu'on n'a pas.
  it('nomme le succès qui ouvre un tracé verrouillé', () => {
    setLocale('fr')
    expect(renderNibTile('ball', { ...state, unlocked: false })).toContain('Le carnet')
  })

  it('n’exige aucun succès pour la plume', () => {
    setLocale('fr')
    expect(renderNibTile('quill', state)).not.toContain('VERROUILLÉ')
  })
})
