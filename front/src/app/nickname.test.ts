import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeLocalStorage } from './fake-local-storage'
import { normalizeNickname, readNickname, writeNickname } from './nickname'

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
  })
})
