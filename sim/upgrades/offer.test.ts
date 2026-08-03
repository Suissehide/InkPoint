import { describe, expect, it } from 'vitest'

import { offerUpgrades } from './offer'
import { createRunProgress } from './progress'

describe('offerUpgrades', () => {
  it('est déterministe : même graine, même vague, même progression, mêmes cartes', () => {
    const progress = createRunProgress()
    progress.seenPowerups.add('freeze')
    const a = offerUpgrades(210, 1, progress).map((c) => c.id)
    const b = offerUpgrades(210, 1, progress).map((c) => c.id)
    expect(a).toEqual(b)
  })

  it(
    'une progression qui a vu la Bavure change l’offre — l’aléa de bascule que ' +
      '`replayRun` doit reproduire dans le même ordre que `game.ts`',
    () => {
      // Cas concret mesuré à la revue : graine 210, vague 1 — exactement le pas
      // de bascule du test de collision (`run.test.ts`). Sans avoir vu la
      // Bavure, aucune carte qui en dépend n'est éligible (`isEligible` dans
      // `draw.ts`) ; dès qu'elle l'a été, des cartes qui en dépendent entrent.
      //
      // Les deux progressions partent d'un socle croisé (la Bombe) et ne
      // diffèrent que par la Bavure. Ce socle n'est pas décoratif : sur une
      // progression vide, `draw.ts` laisse tomber la condition `requires`
      // faute de quoi remplir l'offre, les deux branches tomberaient dans ce
      // régime de secours et la bascule mesurée ici ne serait plus celle qu'on
      // croit éprouver. La Bombe seule suffit — ses deux cartes plus
      // `light-step` tiennent tout juste le seuil de trois remplisseuses.
      const withoutSplatter = createRunProgress()
      withoutSplatter.seenPowerups.add('blast')
      const withSplatter = createRunProgress()
      withSplatter.seenPowerups.add('blast')
      withSplatter.seenPowerups.add('splatter')

      const without = offerUpgrades(210, 1, withoutSplatter).map((c) => c.id)
      const withIt = offerUpgrades(210, 1, withSplatter).map((c) => c.id)

      expect(without).toEqual(['light-step', 'blast-radius', 'blast-linger'])
      expect(withIt).toEqual(['light-step', 'blast-linger', 'splatter-life'])
      expect(withIt).not.toEqual(without)
    },
  )

  it('ne propose jamais une carte liée à la Bavure si elle n’a pas encore été vue', () => {
    // La progression doit avoir croisé de quoi remplir une offre, sinon ce test
    // n'éprouve plus rien : `draw.ts` laisse tomber la condition `requires`
    // quand elle affame le vivier (moins de trois cartes non mythiques
    // éligibles), et des cartes de Bavure apparaîtraient alors légitimement.
    // Deux power-ups suffisent à tenir le seuil — c'est le cas courant, celui
    // où la règle de saveur doit valoir.
    const progress = createRunProgress()
    progress.seenPowerups.add('blast')
    progress.seenPowerups.add('freeze')
    for (let seed = 0; seed < 100; seed++) {
      for (const card of offerUpgrades(seed, 1, progress)) {
        expect(card.id).not.toBe('splatter-life')
        expect(card.id).not.toBe('splatter-split')
      }
    }
  })
})
