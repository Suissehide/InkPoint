import { storage } from './storage'

const KEY = 'nickname'
/** Unités UTF-16, pas points de code : voir `sliceByUtf16Units`. */
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
 * Un substitut isolé (moitié de paire de substitution UTF-16 sans son autre
 * moitié) survit à tout ce qui précède : `for...of` regroupe toujours une
 * paire VALIDE en un seul point de code, mais rend un substitut qui ne peut
 * pas se pairer tel quel, seul, en une unité UTF-16 dont le code appartient à
 * la plage des substituts (`0xD800`-`0xDFFF`). Un pseudo qui en porte un —
 * édité à la main dans le stockage local, ou tronqué au mauvais endroit par
 * un bug antérieur à celui-ci — n'est pas de l'UTF-8 valide une fois encodé :
 * Postgres le refuse à l'écriture, et le joueur lit un 500 permanent derrière
 * « réessaie plus tard » (`gameover.publishRefusedServerError`), pour un
 * pseudo qu'aucun nouvel essai ne rendra jamais valide. `readNickname`
 * promet de filtrer une valeur éditée à la main ; sans ce retrait, elle ne
 * tenait pas cette promesse pour ce cas précis.
 */
function stripLoneSurrogates(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    const isLoneSurrogate = char.length === 1 && code >= 0xd800 && code <= 0xdfff
    if (!isLoneSurrogate) {
      result += char
    }
  }
  return result
}

/**
 * Borne `value` à `maxUnits` unités UTF-16 sans jamais couper une paire de
 * substitution en deux.
 *
 * `.slice(0, n)` compte des unités UTF-16, pas des points de code : un pseudo
 * de 19 caractères ASCII suivi d'un seul emoji astral (2 unités UTF-16, 1
 * point de code) fait 20 points de code mais 21 unités. `.slice(0, 20)`
 * coupe alors l'emoji au milieu de sa paire et laisse un substitut isolé —
 * du texte UTF-16 mal formé, que Postgres refuse à l'écriture (encodage
 * UTF-8 invalide), d'où un 500 pour un pseudo pourtant honnête.
 *
 * Border en points de code (`Array.from(value).slice(0, n)`) serait tout
 * aussi faux dans l'autre sens : le serveur valide la longueur avec Zod
 * (`z.string().max(20)`), qui compte `.length`, donc des unités UTF-16, pas
 * des points de code (vérifié dans `zod/v4/core/checks.js`). Vingt emoji
 * astraux feraient 20 points de code mais 40 unités : accepté ici, rejeté
 * là-bas avec un 400 pour un pseudo que ce module aurait pourtant validé. La
 * borne doit donc rester en unités UTF-16, appliquée point de code par point
 * de code pour ne jamais couper une paire.
 */
function sliceByUtf16Units(value: string, maxUnits: number): string {
  let result = ''
  for (const char of value) {
    if (result.length + char.length > maxUnits) {
      break
    }
    result += char
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
  const trimmed = stripLoneSurrogates(stripControlCharacters(raw))
    .replace(INVISIBLE_FORMATTING, '')
    .trim()
  return sliceByUtf16Units(trimmed, MAX_LENGTH)
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
