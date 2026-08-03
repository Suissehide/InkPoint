import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '../db/client'
import { purgeReplaysOutsideTop } from '../purge'
import { rankOf, totalRuns } from '../ranking'
import type { App } from '../server'
import { Refusal } from '../verify/refusal'
import { verifyReplay } from '../verify/verify'

/** Nombre de replays dont on garde les octets (spec §7). */
const KEPT_REPLAYS = 100

const bodySchema = z.object({
  nickname: z.string().trim().min(1).max(20),
  /** Le `.bin` du replay, gzippé puis encodé en base64. */
  replay: z.string().min(1),
})

const ALREADY_SUBMITTED = {
  reason: 'already_submitted',
  message: 'cette partie a déjà été publiée',
} as const

/** Code Prisma d'une violation de contrainte `@unique` (ici `replayHash`). */
const UNIQUE_VIOLATION = 'P2002'

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION
}

export function registerRuns(app: App): void {
  app.post('/runs', { schema: { body: bodySchema } }, async (request, reply) => {
    const { nickname, replay } = request.body

    let verified: ReturnType<typeof verifyReplay>
    try {
      verified = verifyReplay(replay)
    } catch (error) {
      if (error instanceof Refusal) {
        return reply.code(422).send({ reason: error.reason, message: error.message })
      }
      throw error
    }

    // Chemin rapide : évite un INSERT voué à échouer dans le cas courant
    // (un seul essai). Ne suffit pas seul : deux requêtes identiques
    // envoyées en parallèle (double clic, retry client) passent toutes les
    // deux cette lecture avant que l'une ou l'autre n'écrive — c'est la
    // contrainte `@unique` sur `replayHash`, rattrapée ci-dessous, qui
    // ferme réellement la course.
    const duplicate = await prisma.run.findUnique({ where: { replayHash: verified.hash } })
    if (duplicate !== null) {
      return reply.code(422).send(ALREADY_SUBMITTED)
    }

    let run: Awaited<ReturnType<typeof prisma.run.create>>
    try {
      run = await prisma.run.create({
        data: {
          nickname,
          seed: BigInt(verified.seed),
          arenaId: verified.arenaId,
          simVersion: verified.simVersion,
          score: verified.score,
          wave: verified.wave,
          steps: verified.steps,
          // `Buffer` type sur `ArrayBufferLike` (peut inclure un
          // `SharedArrayBuffer`) alors que Prisma attend un `Uint8Array<ArrayBuffer>` :
          // une copie explicite referme cet écart de type sans risque, le replay
          // ne dépassant jamais quelques centaines de kilo-octets.
          replay: new Uint8Array(verified.bytes),
          replayHash: verified.hash,
        },
      })
    } catch (error) {
      // Seule la violation de la contrainte `@unique` sur `replayHash` est un
      // refus attendu (deux soumissions identiques en course) : elle devient
      // le même 422 que le chemin rapide ci-dessus. Toute autre erreur Prisma
      // reste une panne serveur — même principe qu'à la tâche 4 pour
      // `Refusal` : ne pas élargir le filtre au-delà du cas précis qu'on sait
      // diagnostiquer.
      if (isUniqueViolation(error)) {
        return reply.code(422).send(ALREADY_SUBMITTED)
      }
      throw error
    }

    const [rank, total] = await Promise.all([rankOf(run.score, run.createdAt), totalRuns()])

    // Après insertion, jamais avant : la partie qui vient d'arriver doit
    // pouvoir entrer dans le top et en chasser une autre.
    await purgeReplaysOutsideTop(KEPT_REPLAYS)

    return reply.code(201).send({
      // Arrondi, comme l'écran de fin du jeu : lui renvoyer le flottant brut
      // lui ferait croire à un désaccord avec le score qu'il vient de lire.
      score: Math.round(run.score),
      rank,
      total,
    })
  })
}
