import { storage } from './storage'

const KEY = 'nickname'
const MAX_LENGTH = 20

/**
 * Caractères invisibles retirés d'un pseudo, en séquences d'échappement pour
 * rester lisibles et vérifiables — un littéral invisible ne se relit pas.
 * Les commandes C0/C1 sont filtrées à part par `stripControlCharacters` :
 * Biome refuse tout caractère de contrôle dans un littéral de regex
 * (`lint/suspicious/noControlCharactersInRegex`, recommandée par ce dépôt,
 * sans dérogation possible ici).
 *
 * - `\u200B-\u200F` : espace de largeur nulle, liants, marques de direction.
 * - `\u2028` et `\u2029` : séparateurs de ligne et de paragraphe.
 * - `\u202A-\u202E` : incorporations et forçages de direction —
 *   `\u202E` inverse le sens de lecture de tout ce qui suit.
 * - `\u2060-\u2064` et `\u2066-\u2069` : liants invisibles et isolants
 *   directionnels, la forme moderne des précédents.
 * - `\uFEFF` : marqueur d'ordre des octets, fréquent dans un copier-coller.
 */
const INVISIBLE_FORMATTING =
  /[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/**
 * Commandes C0 (`\u0000`-`\u001F`) et C1 (`\u007F`-`\u009F`), dont le
 * saut de ligne et la tabulation, qui font déborder une ligne de tableau.
 * Filtrées caractère par caractère plutôt que par regex : Biome interdit ces
 * valeurs dans un littéral de regex, y compris écrites en `\u` ou en `\x`.
 */
function stripControlCharacters(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    const isC0 = code <= 0x1f
    const isC1 = code >= 0x7f && code <= 0x9f
    if (!isC0 && !isC1) {
      result += char
    }
  }
  return result
}

/**
 * Retire ce qui casserait l'affichage, élague, et borne la longueur.
 *
 * Le serveur ne contrôle que la longueur (spec §11) : ces caractères
 * passeraient sa validation et casseraient la mise en page du classement pour
 * tous ceux qui le consultent. C'est donc ici que ça se ferme — et à
 * l'affichage, où le panneau rend les pseudos par `textContent` et jamais par
 * `innerHTML` (tâche 6). Les deux sont nécessaires : celui-ci empêche un pseudo
 * illisible, l'autre empêche un pseudo exécutable.
 */
export function normalizeNickname(raw: string): string {
  return stripControlCharacters(raw).replace(INVISIBLE_FORMATTING, '').trim().slice(0, MAX_LENGTH)
}

/** Le pseudo mémorisé, ou `null` s'il n'y en a pas. */
export function readNickname(): string | null {
  const stored = storage.get<string | null>(KEY, null)
  if (stored === null) {
    return null
  }
  // Re-normalisé à la lecture : une valeur écrite par une version antérieure,
  // ou éditée à la main dans les outils du navigateur, ne doit pas entrer.
  const clean = normalizeNickname(stored)
  return clean === '' ? null : clean
}

/** Mémorise la forme normalisée et la rend, ou `null` si elle est vide. */
export function writeNickname(raw: string): string | null {
  const clean = normalizeNickname(raw)
  if (clean === '') {
    return null
  }
  storage.set(KEY, clean)
  return clean
}
