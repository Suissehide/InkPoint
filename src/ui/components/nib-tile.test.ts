import { describe, expect, it } from 'vitest'

import { ACHIEVEMENTS } from '@/app/achievements/catalog'
import { setLocale, t } from '@/i18n'
import { nibPath, SKIN_IDS } from '@/render/views/nibs'
import { renderNibTile } from './nib-tile'

const state = { equipped: false, selected: false, index: 0 }

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

  it('ne met aucun pied de tuile sur un tracé non équipé', () => {
    setLocale('fr')
    expect(renderNibTile('ball', state)).not.toContain('ÉQUIPÉ')
  })

  // La vitrine des succès ne montre que les succès acquis ; une tuile qui
  // nommerait le succès ouvrant un tracé trahirait six d'entre eux. La tuile
  // ne rend donc AUCUN nom de succès — vérifié sur les vingt-quatre, pour les
  // sept tracés, dans les deux langues, plutôt que sur un cas choisi.
  it('ne nomme jamais un succès, quel que soit le tracé', () => {
    for (const locale of ['fr', 'en'] as const) {
      setLocale(locale)
      for (const skin of SKIN_IDS) {
        const html = renderNibTile(skin, state)
        for (const achievement of ACHIEVEMENTS) {
          // Le TITRE traduit, pas la clé : c'est lui que la tuile afficherait,
          // et chercher la clé brute ne trahirait donc jamais la fuite.
          expect(html, `${skin} / ${achievement.id}`).not.toContain(
            t(`achievement.${achievement.id}.name`),
          )
        }
        expect(html).toContain(nibPath(skin))
      }
    }
  })

  // Sans cet attribut, `bindHoverNav`/`bindItemActivation` (`menu-nav.ts`) ne
  // trouvent rien dans la vitrine des tracés et `equipSelectedSkin` n'est
  // atteignable qu'à la barre d'espace : la récompense de six succès serait
  // hors de portée d'un joueur à la souris, alors que la souris est l'entrée
  // de déplacement par défaut du jeu.
  it('porte son rang de navigation et se donne pour cliquable', () => {
    setLocale('fr')
    const html = renderNibTile('brush', { ...state, index: 3 })
    expect(html).toContain('data-nav-index="3"')
    expect(html).toContain('cursor-pointer')
  })
})
