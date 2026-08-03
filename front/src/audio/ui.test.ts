import { RARITY_WEIGHT } from '@sim/data/upgrades'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMenuNav } from '@/ui/menu-nav'
import { cardVoices } from './sounds'
import { bindUiAudio, playCardChosen, playMenuMove } from './ui'

const fakeEngine = () => ({ play: vi.fn() })

afterEach(() => bindUiAudio(null))

describe('audio des écrans', () => {
  it('reste muet tant qu’aucun moteur n’est branché', () => {
    // Les écrans existent avant `startGame` dans les tests : appeler sans
    // moteur ne doit pas lever, seulement ne rien jouer.
    expect(() => playMenuMove()).not.toThrow()
    expect(() => playCardChosen('common')).not.toThrow()
  })

  it('joue un son à chaque déplacement de menu', () => {
    const engine = fakeEngine()
    bindUiAudio(engine)
    const nav = createMenuNav(3)
    nav.move(1)
    nav.move(1)
    expect(engine.play).toHaveBeenCalledTimes(2)
  })

  it('ne rejoue rien quand le déplacement ne change pas la sélection', () => {
    // Le survol repasse sans cesse sur l'entrée déjà choisie, et
    // `bindItemActivation` repose l'index juste avant d'activer : sans ce
    // filtrage, un simple clic sonnerait deux fois.
    const engine = fakeEngine()
    bindUiAudio(engine)
    const nav = createMenuNav(3)
    nav.set(2)
    nav.set(2)
    nav.reset()
    nav.move(0)
    expect(engine.play).toHaveBeenCalledTimes(1)
  })

  it('joue une confirmation plus ample à mesure que la carte est rare', () => {
    // Boucle sur les raretés déclarées, jamais sur une liste recopiée :
    // l'ajout d'une quatrième doit faire échouer ce test si elle reste muette.
    let previous = 0
    for (const rarity of Object.keys(RARITY_WEIGHT).sort(
      (a, b) =>
        (RARITY_WEIGHT[b as keyof typeof RARITY_WEIGHT] ?? 0) -
        (RARITY_WEIGHT[a as keyof typeof RARITY_WEIGHT] ?? 0),
    ) as (keyof typeof RARITY_WEIGHT)[]) {
      const voices = cardVoices(rarity)
      expect(voices.length, `aucun son pour la rareté ${rarity}`).toBeGreaterThan(0)
      // Raretés parcourues de la plus commune à la plus rare (poids
      // décroissant) : l'ampleur ne doit jamais redescendre.
      expect(voices.length, `rareté ${rarity}`).toBeGreaterThanOrEqual(previous)
      previous = voices.length
    }
  })

  it('joue toutes les voix de la carte choisie', () => {
    const engine = fakeEngine()
    bindUiAudio(engine)
    playCardChosen('mythic')
    expect(engine.play).toHaveBeenCalledTimes(cardVoices('mythic').length)
  })
})
