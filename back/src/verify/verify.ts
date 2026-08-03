import { createHash } from 'node:crypto'
import { INPUT_FIELDS } from '@sim/input'
import { ReplayRejected, replayRun } from '@sim/replay/run'
import { SIM_VERSION } from '@sim/version.generated'

import { decodeSubmission } from './decode'
import { Refusal } from './refusal'

/** Plafond de pas : 20 minutes à 60 Hz (spec §5). */
export const MAX_STEPS = 72_000

export interface VerifiedRun {
  seed: number
  arenaId: number
  simVersion: string
  score: number
  wave: number
  steps: number
  bytes: Buffer
  hash: string
}

/**
 * Décode, contrôle, rejoue, et rend ce que la base doit stocker.
 *
 * Ne connaît ni HTTP ni Postgres : c'est ce qui la rend testable sans base, et
 * ce qui garde les routes exemptes de logique de vérification. Le seul refus
 * qu'elle ne peut pas prononcer est `already_submitted`, qui demande la base —
 * elle fournit le `hash` pour que l'appelant le fasse.
 */
export function verifyReplay(base64: string): VerifiedRun {
  // `Buffer.from(…, 'base64')` ne lève jamais sur du base64 invalide : il
  // ignore silencieusement les caractères hors alphabet plutôt que de
  // refuser. Un contenu vraiment corrompu se fait donc rejeter plus loin,
  // par `gunzipSync` dans `decodeSubmission` — délibérément, la
  // décompression est le premier point du pipeline qui distingue réellement
  // un contenu valide d'un contenu incohérent. Seule la charge vide se
  // détecte ici, avant tout le reste.
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) {
    throw new Refusal('malformed', 'charge vide')
  }

  const replay = decodeSubmission(bytes)

  // Avant tout rejeu : une version périmée est le cas le plus fréquent (§6),
  // et rejouer pour le découvrir ensuite serait dépenser 470 ms pour rien.
  if (replay.simVersion !== SIM_VERSION) {
    throw new Refusal(
      'stale_build',
      `replay en version ${replay.simVersion}, serveur en ${SIM_VERSION}`,
    )
  }

  // Le plafond se contrôle **ici**, structurellement, et non en cherchant un
  // mot dans le message d'erreur de `replayRun` : un tel filtre se romprait en
  // silence le jour où quelqu'un reformule le message, et le dépassement
  // deviendrait un `malformed` — un joueur honnête lirait « replay illisible »
  // au lieu de « partie trop longue ». Le garde-fou de `replayRun` reste en
  // place derrière, pour le serveur qui l'appellerait sans passer par ici.
  const steps = replay.inputs.length / INPUT_FIELDS.length
  if (steps > MAX_STEPS) {
    throw new Refusal('too_long', `partie de ${steps} pas, plafond ${MAX_STEPS}`)
  }

  let result: ReturnType<typeof replayRun>
  try {
    result = replayRun(replay, { maxSteps: MAX_STEPS })
  } catch (error) {
    // Seul `ReplayRejected` — le refus diagnostiqué par `replayRun` lui-même —
    // devient un `Refusal`. Tout autre type d'erreur (bug de simulation,
    // assertion bitECS, `TypeError` sans rapport) remonte tel quel : le
    // reclasser en `malformed` le ferait passer pour une faute du joueur
    // plutôt qu'une panne du serveur, exactement ce que `Refusal` (voir
    // `refusal.ts`) existe pour empêcher.
    if (error instanceof ReplayRejected) {
      throw new Refusal('malformed', String(error))
    }
    throw error
  }

  if (result.alive) {
    throw new Refusal('not_dead', 'la partie ne se termine pas par une mort : entrées tronquées')
  }

  return {
    seed: replay.seed,
    arenaId: replay.arenaId,
    simVersion: replay.simVersion,
    score: result.score,
    wave: result.wave,
    steps: result.steps,
    bytes,
    hash: createHash('sha256').update(bytes).digest('hex'),
  }
}
