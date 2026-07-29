import { describe, expect, it } from 'vitest'

import en from './locales/en.json'
import fr from './locales/fr.json'

/** Le seul moyen fiable d'éviter les trous de traduction (spec §5). */
describe('parité des traductions', () => {
  it('en et fr ont exactement les mêmes clés', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
  })

  it("aucune traduction n'est vide", () => {
    // Un tableau d'entrées (et non `{ ...en, ...fr }`) : comme les deux
    // dictionnaires partagent les mêmes clés, un merge d'objets ferait
    // écraser silencieusement les valeurs de `en` par celles de `fr`.
    for (const [key, value] of [...Object.entries(en), ...Object.entries(fr)]) {
      expect(value, `clé vide : ${key}`).not.toBe('')
    }
  })
})
