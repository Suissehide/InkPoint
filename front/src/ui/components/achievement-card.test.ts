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
    const html = renderAchievementCard(def('wave-10'))
    expect(html).toContain('Le carnet')
    expect(html).toContain('Atteindre la vague 10')
  })

  // Les opacités s'empilent : une `opacity` posée sur le conteneur
  // multiplierait celles des enfants, et la condition retomberait à 0,34. Le
  // creux vit sur le trait du cadre et sur les couleurs de texte, jamais sur
  // un ancêtre.
  it('ne pose aucune opacité d’ancêtre', () => {
    setLocale('fr')
    const html = renderAchievementCard(def('blank-page'))
    const conteneur = html.slice(0, html.indexOf('<svg'))
    expect(conteneur).not.toMatch(/\bopacity-\d/)
  })

  it('annonce le tracé ouvert', () => {
    setLocale('fr')
    expect(renderAchievementCard(def('wave-10'))).toContain('La Bille')
  })

  it('n’annonce rien pour un succès honorifique', () => {
    setLocale('fr')
    expect(renderAchievementCard(def('wave-5'))).not.toContain('Ouvre')
  })

  // `t()` ne lève jamais : une clé absente retombe sur la clé brute
  // (`src/i18n/index.ts`). Un `.not.toThrow()` ne verrait donc rien passer à
  // la trappe — c'est la présence de la clé brute dans le HTML qui trahit une
  // traduction manquante, sur les 24 définitions, dans les deux langues.
  it('ne laisse fuiter aucune clé i18n brute, dans les deux langues', () => {
    for (const locale of ['fr', 'en'] as const) {
      setLocale(locale)
      for (const achievement of ACHIEVEMENTS) {
        expect(renderAchievementCard(achievement)).not.toContain('achievement.')
      }
    }
  })
})
