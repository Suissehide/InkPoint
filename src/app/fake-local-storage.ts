/**
 * Fausse `localStorage` en mémoire : l'environnement de test n'a pas de DOM
 * (`vitest.config.ts` tourne en `node`), donc tout test qui touche
 * `storage` ou ses consommateurs a besoin de ce double plutôt que d'installer
 * jsdom. Partagée pour ne pas la recopier une troisième fois.
 */
export function fakeLocalStorage(): Storage {
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
