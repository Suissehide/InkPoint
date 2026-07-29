import { afterEach, describe, expect, it, vi } from 'vitest'

import { storage } from './storage'

/** Fausse localStorage en mémoire, pour tester le round-trip normal. */
function fakeLocalStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => {
      data.clear()
    },
    key: () => null,
    get length() {
      return data.size
    },
  }
}

describe('storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retourne le fallback si la clé est absente', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    expect(storage.get('missing', 'défaut')).toBe('défaut')
  })

  it('retrouve une valeur précédemment stockée', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    storage.set('locale', 'fr')
    expect(storage.get('locale', 'en')).toBe('fr')
  })

  it('retourne le fallback si le JSON stocké est corrompu', () => {
    const fake = fakeLocalStorage()
    fake.setItem('inkpoint.locale', '{ not valid json')
    vi.stubGlobal('localStorage', fake)
    expect(storage.get('locale', 'en')).toBe('en')
  })

  it("ne lève pas d'erreur quand localStorage.getItem échoue (navigation privée)", () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(() => storage.get('locale', 'en')).not.toThrow()
    expect(storage.get('locale', 'en')).toBe('en')
  })

  it("ne lève pas d'erreur quand localStorage.setItem échoue (quota dépassé)", () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(() => storage.set('locale', 'fr')).not.toThrow()
  })
})
