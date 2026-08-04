import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeLocalStorage } from './fake-local-storage'
import {
  ensureNickname,
  generateNickname,
  normalizeNickname,
  readNickname,
  writeNickname,
} from './nickname'

/**
 * Un substitut isolé (moitié de paire de substitution UTF-16) est invisible
 * dans un terminal ou une assertion sur l'apparence de la chaîne : on le
 * détecte donc explicitement. `for...of` regroupe toujours une paire de
 * substitution valide en un seul point de code de longueur 2 ; un substitut
 * qui ne peut pas se pairer ressort seul, en chaîne de longueur 1, avec son
 * unique code UTF-16 dans la plage des substituts.
 */
function hasLoneSurrogate(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (char.length === 1 && code >= 0xd800 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

describe('pseudo', () => {
  // `vitest.config.ts` tourne en `node`, sans DOM : pas de vrai `localStorage`
  // ici (voir `fake-local-storage.ts`). On substitue le global, comme le
  // reste des tests qui touchent `storage`.
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('élague et borne à 20 caractères', () => {
    expect(normalizeNickname('  leo  ')).toBe('leo')
    expect(normalizeNickname('a'.repeat(30))).toHaveLength(20)
  })

  it('retire les caractères invisibles qui cassent la mise en page', () => {
    // Chacun passerait la validation du serveur, qui ne contrôle que la
    // longueur (spec §11), et casserait le tableau pour tous ceux qui le
    // consultent — pas seulement pour l'auteur du pseudo.

    // RIGHT-TO-LEFT OVERRIDE : inverse le sens de lecture de tout ce qui suit,
    // donc retourne la ligne entière du classement.
    expect(normalizeNickname('le\u202Eo')).toBe('leo')
    // Saut de ligne : fait déborder la ligne du tableau.
    expect(normalizeNickname('le\u000Ao')).toBe('leo')
    // ZERO WIDTH SPACE : deux pseudos visuellement identiques, impossibles à
    // distinguer l'un de l'autre au classement.
    expect(normalizeNickname('le\u200Bo')).toBe('leo')
    // ZERO WIDTH NO-BREAK SPACE, le marqueur d'ordre des octets : arrive
    // souvent par un copier-coller depuis un éditeur.
    expect(normalizeNickname('le\uFEFFo')).toBe('leo')
    // POP DIRECTIONAL ISOLATE : la variante moderne du premier.
    expect(normalizeNickname('le\u2069o')).toBe('leo')
  })

  it("retire avant d'élaguer, pas après", () => {
    // Falsifié : inverser `.trim().slice()` avant le retrait des invisibles
    // ne fait rougir aucun des tests ci-dessus. Élaguer d'abord laisserait
    // l'espace qui suit le ZERO WIDTH SPACE en tête une fois celui-ci retiré.
    expect(normalizeNickname(' \u200B leo')).toBe('leo')
  })

  it('ne coupe jamais une paire de substitution au bord de la limite', () => {
    // 19 caractères ASCII + un emoji astral (2 unités UTF-16, 1 point de
    // code) : 20 points de code mais 21 unités. `.slice(0, 20)` couperait
    // l'emoji en deux et laisserait un substitut isolé — invisible dans un
    // terminal, donc on vérifie le nombre de points de code et l'absence de
    // substitut isolé, jamais l'apparence de la chaîne.
    const result = normalizeNickname(`${'a'.repeat(19)}\u{1F600}`)
    expect([...result]).toHaveLength(19) // l'emoji entier est écarté, jamais coupé
    expect(hasLoneSurrogate(result)).toBe(false)
  })

  it('retire un substitut isolé (paire de substitution incomplète) plutôt que de le laisser passer', () => {
    // `\uD83D` est la moitié HAUTE d'une paire de substitution valide
    // (`😀`, un emoji), sans jamais sa moitié basse ici : un
    // pseudo édité à la main dans le stockage local, ou tronqué au mauvais
    // endroit par un bug antérieur, peut en porter un. Non filtré, il rend
    // le pseudo invalide en UTF-8 une fois encodé — Postgres le refuse et le
    // joueur lit un 500 permanent, pour un pseudo qu'aucun nouvel essai ne
    // rendra jamais valide.
    expect(normalizeNickname('leo\uD83D')).toBe('leo')
    expect(hasLoneSurrogate(normalizeNickname('leo\uD83D'))).toBe(false)
    // Moitié BASSE isolée, symétrique.
    expect(normalizeNickname('leo\uDE00')).toBe('leo')
    expect(hasLoneSurrogate(normalizeNickname('leo\uDE00'))).toBe(false)
    // Un emoji astral VALIDE (paire complète) survit toujours, à côté d'un
    // substitut isolé : ce n'est pas tout le domaine astral qui disparaît,
    // seulement ce qui ne peut pas se pairer.
    expect(normalizeNickname('leo😀')).toBe('leo😀')
  })

  it('garde un emoji astral entier quand il tient dans la limite', () => {
    // 18 ASCII + 1 emoji astral = 20 unités UTF-16 pile : tient exactement,
    // doit survivre intact plutôt que d'être écarté par prudence.
    const result = normalizeNickname(`${'a'.repeat(18)}\u{1F600}`)
    expect([...result]).toHaveLength(19)
    expect(result.endsWith('\u{1F600}')).toBe(true)
    expect(hasLoneSurrogate(result)).toBe(false)
  })

  it('rend null quand il ne reste rien', () => {
    expect(writeNickname('   ')).toBeNull()
    expect(writeNickname('\u200B\u200B')).toBeNull()
    expect(readNickname()).toBeNull()
  })

  it('mémorise la forme normalisée, pas la saisie brute', () => {
    expect(writeNickname('  Léo\u202E  ')).toBe('Léo')
    expect(readNickname()).toBe('Léo')
  })

  it('ne laisse pas un stockage refusé casser le jeu', () => {
    // `storage` avale déjà les échecs ; ce test vérifie que ce module ne les
    // réintroduit pas. Un navigateur en navigation privée reste jouable.
    // `fakeLocalStorage` n'est pas une instance de `Storage` : on ne peut pas
    // patcher `Storage.prototype`, donc on substitue le global entier —
    // comme `storage.test.ts` le fait pour le même scénario.
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(() => writeNickname('leo')).not.toThrow()
    // Et le nom rendu tient pour la session : sans mémorisation dans le module,
    // chaque appel tirerait un nom neuf, le champ du menu en afficherait un
    // différent à chaque re-rendu, et chaque mort publierait sous une identité
    // nouvelle — une ligne de classement par partie.
    expect(ensureNickname()).toBe(ensureNickname())
  })

  it('fabrique un pseudo par défaut lisible et unique', () => {
    const a = generateNickname()
    // Forme « Nom 1234 » : le nombre est ce qui empêche deux joueurs qui n'ont
    // rien saisi de se disputer l'unique ligne que le classement garde par pseudo.
    expect(a).toMatch(/^[A-ZÉ][a-zéû]+ \d{4}$/)
    // Et il tient dans la borne du serveur sans être tronqué.
    expect(normalizeNickname(a)).toBe(a)
  })

  it('mémorise le pseudo fabriqué, pour qu’il ne change pas à chaque partie', () => {
    const first = ensureNickname()
    expect(ensureNickname()).toBe(first)
    expect(readNickname()).toBe(first)
  })

  it('ne remplace pas un pseudo déjà choisi', () => {
    writeNickname('leo')
    expect(ensureNickname()).toBe('leo')
  })
})
