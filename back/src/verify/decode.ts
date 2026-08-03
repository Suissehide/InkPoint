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

/** Octets soumis (gzip) → `Replay`. Toute anomalie devient un `Refusal`. */
export function decodeSubmission(bytes: Buffer): Replay {
  let raw: Buffer
  try {
    raw = gunzipSync(bytes, { maxOutputLength: MAX_INFLATED_BYTES })
  } catch (error) {
    throw new Refusal('malformed', `décompression impossible : ${String(error)}`)
  }
  try {
    return decodeReplay(new Uint8Array(raw))
  } catch (error) {
    throw new Refusal('malformed', `replay illisible : ${String(error)}`)
  }
}
