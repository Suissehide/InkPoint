import { beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeNickname } from '@/app/nickname'
import { setLocale, t } from '@/i18n'
import { createSettingsScreen, type SettingsDeps } from './settings'

/**
 * Suite en mode navigateur (`vitest.browser.config.ts`), et non `npx vitest run` nu : cet écran
 * construit du vrai DOM (`document.createElement`), que Node ne fournit pas — même raison que
 * `gameover.browser.test.ts` et `leaderboard.browser.test.ts`.
 *
 * `readNickname`/`writeNickname` sont injectées via `SettingsDeps`, jamais remplacées par
 * `vi.mock` (non intercepté sous ce lanceur, voir la docstring de `GameOverDeps` dans
 * `gameover.ts`) ni par `vi.stubGlobal('localStorage', …)` — ce dernier patcherait un
 * `localStorage` réel (les trois moteurs en fournissent un ici, contrairement à `node`), et sa
 * configurabilité n'est pas garantie identique dans les trois. Le fake ci-dessous rejoue
 * `normalizeNickname` (pure, sans stockage) pour rester fidèle à la vraie normalisation sans
 * dépendre de `localStorage`.
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
    readNickname: () => null,
    writeNickname: (raw) => {
      const clean = normalizeNickname(raw)
      return clean === '' ? null : clean
    },
    ...overrides,
  }
}

describe('écran des réglages — champ pseudo', () => {
  beforeEach(() => {
    setLocale('fr')
  })

  it('affiche le pseudo déjà mémorisé au chargement', () => {
    const root = document.createElement('div')
    const screen = createSettingsScreen(root, fakeDeps({ readNickname: () => 'leo' }))
    screen.show(noop)
    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    expect(input?.value).toBe('leo')
  })

  // Falsification (brief) : un pseudo saisi avec des espaces de tête et un caractère invisible
  // doit ressortir normalisé, jamais tel quel. `writeNickname` (le fake ci-dessus, appuyé sur la
  // vraie `normalizeNickname`) est la seule voie qui peut produire cette forme — un champ qui
  // stocke `input.value` directement, en contournant `writeNickname`, laisserait passer les
  // espaces et le caractère invisible.
  it('la saisie passe par `writeNickname` : espaces de tête et caractère invisible disparaissent', () => {
    const written = vi.fn((raw: string) => {
      const clean = normalizeNickname(raw)
      return clean === '' ? null : clean
    })
    const root = document.createElement('div')
    const screen = createSettingsScreen(root, fakeDeps({ writeNickname: written }))
    screen.show(noop)

    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      throw new Error('champ pseudo introuvable')
    }
    // Espace de tête + ZERO WIDTH SPACE, en séquence d'échappement pour rester lisible
    // et vérifiable — un littéral invisible ne se relit pas (même choix que
    // `nickname.ts`, voir sa docstring `INVISIBLE_FORMATTING`).
    const raw = ` \u200Bleo `
    input.value = raw
    input.dispatchEvent(new Event('blur'))

    expect(written).toHaveBeenCalledWith(raw)
    expect(input.value).toBe('leo')
    expect(input.value).not.toBe(raw)
  })

  // Décision du brief : `writeNickname` ne vide jamais le stockage sur un résultat vide (voir sa
  // docstring dans `nickname.ts`) — laisser le champ vide mentirait alors sur ce qui sera
  // utilisé à la prochaine publication. Il revient donc au pseudo réellement mémorisé.
  it('champ vidé : ne prétend pas avoir effacé le pseudo, revient à celui mémorisé', () => {
    const root = document.createElement('div')
    const screen = createSettingsScreen(
      root,
      fakeDeps({ readNickname: () => 'leo', writeNickname: () => null }),
    )
    screen.show(noop)

    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      throw new Error('champ pseudo introuvable')
    }
    input.value = '   '
    input.dispatchEvent(new Event('blur'))

    expect(input.value).toBe('leo')
  })

  it('Entrée valide comme le fait perdre le focus au champ', () => {
    const written = vi.fn((raw: string) => raw.trim() || null)
    const root = document.createElement('div')
    const screen = createSettingsScreen(root, fakeDeps({ writeNickname: written }))
    screen.show(noop)

    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      throw new Error('champ pseudo introuvable')
    }
    input.value = 'ana'
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))

    expect(written).toHaveBeenCalledWith('ana')
    expect(input.value).toBe('ana')
  })

  it('Échap dans le champ annule la saisie en cours sans quitter les Réglages', () => {
    let backCalled = false
    const root = document.createElement('div')
    const screen = createSettingsScreen(root, fakeDeps({ readNickname: () => 'leo' }))
    screen.show(() => {
      backCalled = true
    })

    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      throw new Error('champ pseudo introuvable')
    }
    input.value = 'brouillon non validé'
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))

    expect(input.value).toBe('leo')
    expect(backCalled).toBe(false)
  })

  // Spec §8 : sans comptes, rien ne relie une ligne déjà publiée au joueur, donc rien ne peut la
  // renommer. Phrase exigée sous le champ, dans les deux locales.
  it('la phrase sur les scores déjà publiés est présente sous le champ', () => {
    const root = document.createElement('div')
    const screen = createSettingsScreen(root, fakeDeps())
    screen.show(noop)
    expect(root.textContent).toContain(t('settings.nicknameNote'))

    setLocale('en')
    screen.show(noop)
    expect(root.textContent).toContain(t('settings.nicknameNote'))
  })
})
