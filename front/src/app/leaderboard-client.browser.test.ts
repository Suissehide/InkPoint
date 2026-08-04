import { encodeReplay, type Replay } from '@sim/replay/format'
import { describe, expect, it } from 'vitest'

import { toBase64 } from './leaderboard-client'

/**
 * Le seul test de ce module qui a besoin d'un vrai moteur de navigateur : il
 * prouve que `toBase64` (`CompressionStream` + `btoa`) et son inverse
 * (`DecompressionStream` + `atob`) se recomposent en les octets exacts que
 * `encodeReplay` a produits — le `.bin` que le serveur hache et rejoue.
 *
 * L'assertion porte sur les octets DÉCOMPRESSÉS, jamais sur le flux gzip
 * lui-même : le flux diffère légitimement d'un moteur à l'autre (et de
 * `node:zlib`), voir la docstring de `toBase64`. Comparer le gzip ferait
 * rougir ce test pour une raison qui n'en est pas une.
 *
 * Nommé `*.browser.test.ts` : c'est ce suffixe, et non une liste de fichiers,
 * que `vitest.browser.config.ts` ramasse pour les trois moteurs.
 */
const replay: Replay = {
  simVersion: '0123456789abcdef',
  seed: 42,
  arenaId: 0,
  // Un multiple de `INPUT_FIELDS.length` (3) : `encodeReplay` exige exactement
  // ça pour dériver un nombre de pas entier — deux pas ici.
  inputs: new Int16Array([1, -2, 300, -300, 0, 5]),
  choices: [
    { step: 10, index: 1 },
    { step: 40, index: 0 },
  ],
}

describe('client du classement — aller-retour navigateur', () => {
  it('decode(atob(toBase64(replay))) rend les octets exacts que produit encodeReplay', async () => {
    const base64 = await toBase64(replay)

    const binary = atob(base64)
    const gz = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      gz[i] = binary.charCodeAt(i)
    }
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))
    const decoded = new Uint8Array(await new Response(stream).arrayBuffer())

    expect(decoded).toEqual(encodeReplay(replay))
  })
})
