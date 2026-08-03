import { describe, expect, it } from 'vitest'

import { setLocale } from '@/i18n'
import { nibPath } from '@/render/views/nibs'
import { renderNibTile } from './nib-tile'

const state = { unlocked: true, equipped: false, selected: false }

describe('renderNibTile', () => {
  it('nomme le tracé et dessine sa silhouette', () => {
    setLocale('fr')
    const html = renderNibTile('ball', state)
    expect(html).toContain('La Bille')
    // `<path` seul passerait même sans glyphe : le cadre d'encre (`ink-frame.ts`)
    // en dessine déjà un. Comparer au `d` exact de `nibPath('ball')` vérifie que
    // c'est la vraie silhouette de la bille qui est tracée, pas celle d'un autre
    // tracé ni un simple cadre.
    expect(html).toContain(nibPath('ball'))
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

  // `nib-tile.ts` n'émet jamais « VERROUILLÉ » (ce mot vient de
  // `achievement-card.ts`), donc `not.toContain('VERROUILLÉ')` tenait quel que
  // soit le comportement du composant — pas une preuve. Le vrai test : la
  // plume n'a pas d'entrée dans `ACHIEVEMENT_BY_SKIN` (c'est le tracé par
  // défaut), donc même simulée verrouillée, son pied de tuile reste vide — si
  // un succès venait un jour l'ouvrir, ce pied de tuile porterait son nom et
  // ce test échouerait.
  it('n’exige aucun succès pour la plume', () => {
    setLocale('fr')
    const html = renderNibTile('quill', { unlocked: false, equipped: false, selected: false })
    expect(html).toContain('<span class="ui-2xs tracking-[0.15em] opacity-55"></span>')
  })
})
