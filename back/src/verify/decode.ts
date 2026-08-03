import { gunzipSync } from 'node:zlib'
import { decodeReplay, type Replay } from '@sim/replay/format'

import { Refusal } from './refusal'

/**
 * Borne de décompression. Un replay au plafond fait 432 Ko bruts ; 1 Mo laisse
 * de la marge sans permettre l'amplification qui rend cette borne nécessaire —
 * 509 Ko de zéros se détendent en 500 Mo, et un serveur qui décompresse sans
 * borne se fait tomber avec un seul envoi.
 */
const MAX_INFLATED_BYTES = 1024 * 1024

export interface DecodedSubmission {
  /**
   * Octets décompressés (le `.bin`), avant tout choix de compression du
   * client. `decodeReplay` en valide déjà la longueur exacte : c'est la forme
   * canonique sur laquelle hacher (voir `verify.ts`), jamais `bytes` — deux
   * flux gzip différents (niveau, implémentation) pour la même partie se
   * détendent sur le même `raw`.
   */
  raw: Buffer
  replay: Replay
}

/** Octets soumis (gzip) → `Replay` et forme canonique. Toute anomalie devient un `Refusal`. */
export function decodeSubmission(bytes: Buffer): DecodedSubmission {
  let raw: Buffer
  try {
    raw = gunzipSync(bytes, { maxOutputLength: MAX_INFLATED_BYTES })
  } catch (error) {
    throw new Refusal('malformed', `décompression impossible : ${String(error)}`)
  }
  try {
    return { raw, replay: decodeReplay(new Uint8Array(raw)) }
  } catch (error) {
    throw new Refusal('malformed', `replay illisible : ${String(error)}`)
  }
}
