import { beforeEach, describe, expect, it } from 'vitest'

import { setLocale, t } from '@/i18n'
import { createSettingsScreen, type SettingsDeps } from './settings'

/**
 * Suite en mode navigateur (`vitest.browser.config.ts`), et non `npx vitest run` nu : cet écran
 * construit du vrai DOM (`document.createElement`), que Node ne fournit pas — même raison que
 * `gameover.browser.test.ts` et `leaderboard.browser.test.ts`.
 *
 * Le champ pseudo qu'exerçait cette suite a déménagé dans le menu (spec §8, lot final) : deux
 * champs éditant la même valeur auraient fini par diverger. Ce qui reste ici garde le nom du
 * fichier (`*.browser.test.ts` — sinon Vitest ne le rejouerait jamais, voir la docstring de
 * `vitest.browser.config.ts`) et vérifie l'absence, pas la présence : que le champ et sa phrase
 * ne sont PAS revenus dans cet écran.
 */

const noop = (): void => {
  /* callback non exercé par ce test */
}

function fakeDeps(overrides: Partial<SettingsDeps> = {}): SettingsDeps {
  return {
    onReducedMotionChange: noop,
    onMovementInputChange: noop,
    onSfxVolumeChange: noop,
    coarsePointer: false,
    ...overrides,
  }
}

describe('écran des réglages — pseudo retiré (spec §8, lot final)', () => {
  beforeEach(() => {
    setLocale('fr')
  })

  it('ne pose plus de champ pseudo : le réglage a déménagé dans le menu', () => {
    const root = document.createElement('div')
    const screen = createSettingsScreen(root, fakeDeps())
    screen.show(noop)
    expect(root.querySelector('[data-nickname-input]')).toBeNull()
  })

  // La phrase (spec §8 : les scores déjà publiés gardent l'ancien pseudo) ne doit plus être dite
  // ICI — elle est désormais dite une fois, dans le menu (`menu.browser.test.ts`). La répéter
  // aux deux endroits serait aussi faux que de ne la dire nulle part : un joueur qui la lirait
  // dans les deux écrans se demanderait laquelle des deux règle vraiment le pseudo.
  it('ne répète plus la phrase sur les scores déjà publiés', () => {
    const root = document.createElement('div')
    const screen = createSettingsScreen(root, fakeDeps())
    screen.show(noop)
    expect(root.textContent).not.toContain(t('menu.nicknameNote'))
  })
})
