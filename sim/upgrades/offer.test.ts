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
      // `draw.ts`) ; dès qu'elle l'a été, deux des trois cartes en dépendent.
      const withoutSplatter = createRunProgress()
      const withSplatter = createRunProgress()
      withSplatter.seenPowerups.add('splatter')

      const without = offerUpgrades(210, 1, withoutSplatter).map((c) => c.id)
      const withIt = offerUpgrades(210, 1, withSplatter).map((c) => c.id)

      expect(without).toEqual(['light-step', 'double-stroke', 'tracing-paper'])
      expect(withIt).toEqual(['light-step', 'splatter-life', 'splatter-split'])
      expect(withIt).not.toEqual(without)
    },
  )

  it('ne propose jamais une carte liée à la Bavure si elle n’a pas encore été vue', () => {
    const progress = createRunProgress()
    for (let seed = 0; seed < 100; seed++) {
      for (const card of offerUpgrades(seed, 1, progress)) {
        expect(card.id).not.toBe('splatter-life')
        expect(card.id).not.toBe('splatter-split')
      }
    }
  })
})
