import { describe, expect, it } from 'vitest'

import { ACHIEVEMENTS } from '@/app/achievements/catalog'
import { setLocale } from '@/i18n'
import { renderAchievementCard } from './achievement-card'

function def(id: string) {
  const found = ACHIEVEMENTS.find((a) => a.id === id)
  if (!found) {
    throw new Error(`succès inconnu : ${id}`)
  }
  return found
}

describe('renderAchievementCard', () => {
  it('affiche le nom et la condition', () => {
    setLocale('fr')
    const html = renderAchievementCard(def('wave-10'), true)
    expect(html).toContain('Le carnet')
    expect(html).toContain('Atteindre la vague 10')
  })

  // La condition est l'invitation à jouer : la cacher derrière un point
  // d'interrogation ne dit rien à personne.
  it('montre la condition même verrouillé', () => {
    setLocale('fr')
    const html = renderAchievementCard(def('blank-page'), false)
    expect(html).toContain('Mourir sans avoir tué un seul ennemi')
    expect(html).toContain('VERROUILLÉ')
  })

  it('annonce le tracé ouvert', () => {
    setLocale('fr')
    expect(renderAchievementCard(def('wave-10'), true)).toContain('La Bille')
  })

  it('n’annonce rien pour un succès honorifique', () => {
    setLocale('fr')
    expect(renderAchievementCard(def('wave-5'), true)).not.toContain('Ouvre')
  })

  // Un succès sans clé i18n planterait ici plutôt qu'en silence dans la
  // grille du menu — les 24 définitions, verrouillées et non, dans les deux
  // langues.
  it('rend tout le catalogue sans lever, verrouillé ou non, dans les deux langues', () => {
    for (const locale of ['fr', 'en'] as const) {
      setLocale(locale)
      for (const achievement of ACHIEVEMENTS) {
        expect(() => renderAchievementCard(achievement, true)).not.toThrow()
        expect(() => renderAchievementCard(achievement, false)).not.toThrow()
      }
    }
  })
})
