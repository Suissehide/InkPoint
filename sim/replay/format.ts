/**
 * Encodage binaire d'une partie : `{ graine, entrées, cartes }`, et rien d'autre.
 *
 * Ce qui n'y figure pas, et pourquoi : l'arène est une constante de `sim/world.ts`,
 * `timeScale` est produit par `hitstopSystem` dans la simulation, la graine du
 * tirage des cartes est dérivée (`seed + wave`), et les power-ups ramassés viennent
 * de `world.rng`. Une seule ligne du front écrit dans la simulation, `world.input`.
 *
 * Les entrées se stockent en entiers sans perte : `mouse.ts` quantifie déjà
 * `world.input` sur un pas de `1/128`, et `1/128` valant `2⁻⁷`, `k · 2⁻⁷` est
 * exactement représentable en f64. Mesuré sur 500 000 valeurs : l'aller-retour
 * `round(v · 128) / 128` est bit-identique, sans exception.
 *
 * La compression n'est pas ici. Elle appartient à l'appelant —
 * `CompressionStream` dans le navigateur, `node:zlib` dans Node — parce qu'une API
 * de compression est spécifique à la plateforme et que ce module doit rester
 * portable pour passer `purity.test.ts`.
 */

import { INPUT_FIELDS } from '../input'

export const REPLAY_FORMAT_VERSION = 1

const MAGIC = 0x494e4b52 // 'INKR'
const HEADER_BYTES = 4 + 1 + 8 + 4 + 4 + 2
const CHOICE_BYTES = 4 + 1

export interface CardChoice {
  /** Pas auquel la vague s'est terminée. Contrôle de cohérence au rejeu. */
  step: number
  /** Indice choisi parmi les cartes proposées, 0 à 2. */
  index: number
}

export interface Replay {
  simVersion: string
  seed: number
  /** `INPUT_FIELDS.length` entiers par pas, dans l'ordre d'`INPUT_FIELDS`. */
  inputs: Int16Array
  choices: CardChoice[]
}

export function encodeReplay(replay: Replay): Uint8Array<ArrayBuffer> {
  const steps = replay.inputs.length / INPUT_FIELDS.length
  // `steps` fractionnaire signifierait qu'`inputs.length` n'est pas un multiple
  // d'`INPUT_FIELDS.length` : `setUint32` le tronquerait alors silencieusement,
  // écrivant un en-tête qui ne correspond plus à sa propre charge utile.
  if (!Number.isInteger(steps)) {
    throw new Error(
      `${replay.inputs.length} entrées n’est pas un multiple de ${INPUT_FIELDS.length} ` +
        '(INPUT_FIELDS.length) — nombre de pas non entier',
    )
  }
  // Même classe de défaut que le garde `steps` ci-dessus : un producteur qui
  // fabrique un `Replay` corrompu (JSON reconstruit à la main, champ mal
  // renseigné) ne doit pas voir son erreur avalée par une conversion binaire
  // muette. `Number.parseInt('', 16)` (ou toute tranche non hexadécimale)
  // rend `NaN`, et `DataView.setUint8(at, NaN)` écrit silencieusement `0` —
  // un `simVersion` malformé s'encoderait donc en zéros, indiscernable d'un
  // vrai `simVersion` qui commencerait par des zéros.
  if (!/^[0-9a-f]{16}$/.test(replay.simVersion)) {
    throw new Error(
      `simVersion "${replay.simVersion}" n'est pas 16 caractères hexadécimaux — ` +
        'encodage impossible sans corrompre silencieusement la version stockée',
    )
  }
  // `DataView.setUint32` ne lève pas sur une valeur négative ou fractionnaire :
  // il la convertit via l'algorithme ToUint32 (troncature puis modulo 2**32),
  // donc `seed` tronquerait ou s'enroulerait sans le moindre avertissement.
  if (!Number.isInteger(replay.seed) || replay.seed < 0 || replay.seed > 0xffffffff) {
    throw new Error(
      `seed ${replay.seed} n'est pas un entier non signé sur 32 bits — ` +
        'setUint32 le tronquerait ou l’enroulerait silencieusement',
    )
  }
  const bytes = new Uint8Array(
    HEADER_BYTES + replay.choices.length * CHOICE_BYTES + replay.inputs.length * 2,
  )
  // Symétrique à `decodeReplay`, qui passe `byteOffset`/`byteLength` parce que
  // son tampon d'entrée n'est presque jamais aligné sur le début du sien
  // (voir son test dédié) : `bytes` sort ici d'un `new Uint8Array(taille)`
  // frais, donc `byteOffset` vaut toujours 0 aujourd'hui, mais faire diverger
  // les deux constructions est justement ce que ce test de l'autre côté
  // existe à prévenir — les deux fonctions du même module doivent lire le
  // même contrat.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 0

  view.setUint32(at, MAGIC)
  at += 4
  view.setUint8(at, REPLAY_FORMAT_VERSION)
  at += 1
  for (let i = 0; i < 8; i++) {
    view.setUint8(at + i, Number.parseInt(replay.simVersion.slice(i * 2, i * 2 + 2), 16))
  }
  at += 8
  view.setUint32(at, replay.seed)
  at += 4
  view.setUint32(at, steps)
  at += 4
  view.setUint16(at, replay.choices.length)
  at += 2

  for (const choice of replay.choices) {
    view.setUint32(at, choice.step)
    at += 4
    view.setUint8(at, choice.index)
    at += 1
  }
  for (const k of replay.inputs) {
    view.setInt16(at, k)
    at += 2
  }
  return bytes
}

export function decodeReplay(bytes: Uint8Array): Replay {
  if (bytes.length < HEADER_BYTES) {
    throw new Error('replay tronqué : en-tête incomplet')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 0

  if (view.getUint32(at) !== MAGIC) {
    throw new Error('magie absente : ce fichier n’est pas un replay InkPoint')
  }
  at += 4
  const formatVersion = view.getUint8(at)
  at += 1
  if (formatVersion !== REPLAY_FORMAT_VERSION) {
    throw new Error(`version de format ${formatVersion} inconnue, attendu ${REPLAY_FORMAT_VERSION}`)
  }
  let simVersion = ''
  for (let i = 0; i < 8; i++) {
    simVersion += view
      .getUint8(at + i)
      .toString(16)
      .padStart(2, '0')
  }
  at += 8
  const seed = view.getUint32(at)
  at += 4
  const steps = view.getUint32(at)
  at += 4
  const choiceCount = view.getUint16(at)
  at += 2

  const expected = HEADER_BYTES + choiceCount * CHOICE_BYTES + steps * INPUT_FIELDS.length * 2
  if (bytes.length !== expected) {
    throw new Error(`replay tronqué ou trop long : ${bytes.length} octets, attendu ${expected}`)
  }

  const choices: CardChoice[] = []
  for (let i = 0; i < choiceCount; i++) {
    choices.push({ step: view.getUint32(at), index: view.getUint8(at + 4) })
    at += CHOICE_BYTES
  }
  const inputs = new Int16Array(steps * INPUT_FIELDS.length)
  for (let i = 0; i < inputs.length; i++) {
    inputs[i] = view.getInt16(at)
    at += 2
  }
  return { simVersion, seed, inputs, choices }
}
