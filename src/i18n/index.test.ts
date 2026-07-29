import { beforeEach, describe, expect, it, vi } from 'vitest'

import { detectLocale, getLocale, onLocaleChange, setLocale, t } from './index'

beforeEach(() => setLocale('en'))

describe('i18n', () => {
  it('traduit une clé existante', () => {
    expect(t('menu.play')).toBe('Play')
  })

  it('bascule en français', () => {
    setLocale('fr')
    expect(t('menu.play')).toBe('Jouer')
  })

  it('retourne la clé si la traduction manque', () => {
    expect(t('cette.cle.nexiste.pas')).toBe('cette.cle.nexiste.pas')
  })

  it('interpole les paramètres', () => {
    // hud.wave est un simple libellé statique ("WAVE"), sans espace réservé ;
    // hud.combo ("COMBO ×{n}") est la clé du dictionnaire qui interpole réellement.
    expect(t('hud.combo', { n: 7 })).toContain('7')
  })

  it('detectLocale privilégie la valeur stockée', () => {
    expect(detectLocale('fr-FR', 'en')).toBe('en')
  })

  it('detectLocale reconnaît le français du navigateur', () => {
    expect(detectLocale('fr-FR', null)).toBe('fr')
  })

  it("detectLocale retombe sur l'anglais par défaut", () => {
    expect(detectLocale('de-DE', null)).toBe('en')
    expect(detectLocale(undefined, null)).toBe('en')
  })

  it('detectLocale ignore une valeur stockée invalide', () => {
    expect(detectLocale('fr-FR', 'klingon')).toBe('fr')
  })

  it('notifie les abonnés au changement de langue', () => {
    const cb = vi.fn()
    const off = onLocaleChange(cb)
    setLocale('fr')
    expect(cb).toHaveBeenCalled()
    off()
    setLocale('en')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('getLocale reflète la langue courante', () => {
    setLocale('fr')
    expect(getLocale()).toBe('fr')
  })
})
