import { UPGRADES } from '@sim/data/upgrades'
import { describe, expect, it } from 'vitest'

import en from './locales/en.json'
import fr from './locales/fr.json'

const LOCALES = { en, fr } as Record<string, Record<string, string>>

/**
 * Les clés d'une carte sont dérivées de son id (`upgrade.<id>.name` et
 * `.desc`) : rien dans le typage ne relie les deux, donc retirer une carte
 * sans retirer ses clés — ou l'inverse — passe inaperçu jusqu'à voir
 * « upgrade.machin.name » à l'écran pendant un playtest.
 *
 * `parity.test.ts` ne l'attrape pas : il ne compare que en↔fr entre eux, et
 * serait tout aussi vert si les deux locales gardaient des clés mortes ou
 * perdaient toutes deux une clé vivante.
 */

/**
 * Chaînes d'écran de l'écran de choix, pas des cartes : elles vivent sous le
 * même préfixe `upgrade.` sans jamais correspondre à un id, et ne sont donc
 * pas des orphelines.
 */
const SCREEN_KEYS = new Set(['upgrade.title', 'upgrade.waveCleared', 'upgrade.hint'])

describe('couverture i18n des cartes', () => {
  for (const [locale, dict] of Object.entries(LOCALES)) {
    it(`${locale} : chaque carte a un nom et une description`, () => {
      const missing = UPGRADES.flatMap(({ id }) =>
        ['name', 'desc']
          .map((suffix) => `upgrade.${id}.${suffix}`)
          .filter((key) => dict[key] === undefined),
      )
      expect(missing, `clés manquantes en ${locale}`).toEqual([])
    })

    it(`${locale} : aucune clé de carte ne survit à sa carte`, () => {
      const liveIds = new Set(UPGRADES.map(({ id }) => id))
      const orphans = Object.keys(dict).filter((key) => {
        if (!key.startsWith('upgrade.') || SCREEN_KEYS.has(key)) {
          return false
        }
        // `upgrade.<id>.<suffixe>` : les ids ne contiennent pas de point.
        const [, id] = key.split('.')
        return id === undefined || !liveIds.has(id)
      })
      expect(orphans, `clés orphelines en ${locale}`).toEqual([])
    })
  }
})
