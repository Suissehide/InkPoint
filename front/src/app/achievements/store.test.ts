import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeLocalStorage } from '@/app/fake-local-storage'
import { equipSkin, readSkin, readUnlocked, unlock, unlockedSkins } from './store'

describe('store des succès', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('part vide et sur la plume', () => {
    expect(readUnlocked().size).toBe(0)
    expect(readSkin(new Set())).toBe('quill')
  })

  it('persiste un déblocage', () => {
    unlock('wave-10')
    expect(readUnlocked().has('wave-10')).toBe(true)
  })

  it('n’écrit pas deux fois le même succès', () => {
    unlock('wave-10')
    unlock('wave-10')
    expect(localStorage.getItem('inkpoint.achievements')).toBe('["wave-10"]')
  })

  // Un succès renommé ou retiré plus tard ne doit pas ressortir de la
  // sauvegarde comme s'il existait encore.
  it('ignore un identifiant absent du catalogue', () => {
    localStorage.setItem('inkpoint.achievements', '["wave-10","succes-fantome"]')
    const unlocked = readUnlocked()
    expect(unlocked.has('wave-10')).toBe(true)
    expect(unlocked.has('succes-fantome')).toBe(false)
  })

  it('ouvre la plume et rien d’autre par défaut', () => {
    expect(unlockedSkins(new Set())).toEqual(['quill'])
    expect(unlockedSkins(new Set(['wave-5']))).toEqual(['quill', 'ball'])
  })

  it('équipe un tracé gagné', () => {
    equipSkin('ball')
    expect(readSkin(new Set(['wave-5']))).toBe('ball')
  })

  // Sinon, effacer ses succès sans effacer son tracé laisserait une silhouette
  // que le joueur n'a pas gagnée.
  it('retombe sur la plume si le tracé équipé n’est pas gagné', () => {
    equipSkin('ball')
    expect(readSkin(new Set())).toBe('quill')
  })

  it('retombe sur la plume sur une valeur inconnue', () => {
    localStorage.setItem('inkpoint.skin', '"stylo-bille-4-couleurs"')
    expect(readSkin(new Set(['wave-5']))).toBe('quill')
  })
})
