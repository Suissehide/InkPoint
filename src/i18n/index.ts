import en from './locales/en.json'
import fr from './locales/fr.json'

export type Locale = 'en' | 'fr'

const DICTS: Record<Locale, Record<string, string>> = { en, fr }
const LOCALES: readonly Locale[] = ['en', 'fr']

let current: Locale = 'en'
const listeners = new Set<() => void>()

const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

export function getLocale(): Locale {
  return current
}

export function setLocale(locale: Locale): void {
  if (locale === current) {
    return
  }
  current = locale
  for (const listener of listeners) {
    listener()
  }
}

export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Anglais par défaut ; le choix stocké l'emporte sur le navigateur (spec §5). */
export function detectLocale(navLang: string | undefined, stored: string | null): Locale {
  if (isLocale(stored)) {
    return stored
  }
  if (navLang?.toLowerCase().startsWith('fr')) {
    return 'fr'
  }
  return 'en'
}

export function t(key: string, params?: Record<string, string | number>): string {
  const template = DICTS[current][key] ?? key
  if (!params) {
    return template
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}
