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

  // Les opacités s'empilent : `opacity-45` sur le conteneur multipliait le
  // `opacity-75` de la condition (0,34 effectif) et le `opacity-45` de
  // l'étiquette VERROUILLÉ (0,20). La spec §9.2 fait de la lisibilité de la
  // condition une exigence — c'est elle qui invite à rejouer — et 23 cartes
  // sur 24 sont fermées à la première visite. Le creux vit donc sur le trait
  // du cadre et sur les couleurs de texte, jamais sur un ancêtre.
  it('ne pose aucune opacité d’ancêtre sur une carte verrouillée', () => {
    setLocale('fr')
    const html = renderAchievementCard(def('blank-page'), false)
    const conteneur = html.slice(0, html.indexOf('<svg'))
    expect(conteneur).not.toMatch(/\bopacity-\d/)
  })

  it('annonce le tracé ouvert', () => {
    setLocale('fr')
    expect(renderAchievementCard(def('wave-10'), true)).toContain('La Bille')
  })

  it('n’annonce rien pour un succès honorifique', () => {
    setLocale('fr')
    expect(renderAchievementCard(def('wave-5'), true)).not.toContain('Ouvre')
  })

  // `t()` ne lève jamais : une clé absente retombe sur la clé brute
  // (`src/i18n/index.ts`). Un `.not.toThrow()` ne verrait donc rien passer à
  // la trappe — c'est la présence de la clé brute dans le HTML qui trahit une
  // traduction manquante, sur les 24 définitions, verrouillées et non, dans
  // les deux langues.
  it('ne laisse fuiter aucune clé i18n brute, verrouillé ou non, dans les deux langues', () => {
    for (const locale of ['fr', 'en'] as const) {
      setLocale(locale)
      for (const achievement of ACHIEVEMENTS) {
        expect(renderAchievementCard(achievement, true)).not.toContain('achievement.')
        expect(renderAchievementCard(achievement, false)).not.toContain('achievement.')
      }
    }
  })
})
