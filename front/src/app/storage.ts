const PREFIX = 'inkpoint.'

/** localStorage typé et tolérant : un navigateur en navigation privée ou un
 *  JSON corrompu ne doit jamais empêcher le jeu de démarrer. */
export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw === null ? fallback : (JSON.parse(raw) as T)
    } catch {
      return fallback
    }
  },

  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // Quota dépassé ou stockage refusé : le jeu continue sans persistance.
    }
  },
}
