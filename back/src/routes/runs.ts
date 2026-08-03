import { z } from 'zod'

import { prisma } from '../db/client'
import { rankOf, totalRuns } from '../ranking'
import type { App } from '../server'
import { Refusal } from '../verify/refusal'
import { verifyReplay } from '../verify/verify'

const bodySchema = z.object({
  nickname: z.string().trim().min(1).max(20),
  /** Le `.bin` du replay, gzippé puis encodé en base64. */
  replay: z.string().min(1),
})

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

    const duplicate = await prisma.run.findUnique({ where: { replayHash: verified.hash } })
    if (duplicate !== null) {
      return reply
        .code(422)
        .send({ reason: 'already_submitted', message: 'cette partie a déjà été publiée' })
    }

    const run = await prisma.run.create({
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

    return reply.code(201).send({
      // Arrondi, comme l'écran de fin du jeu : lui renvoyer le flottant brut
      // lui ferait croire à un désaccord avec le score qu'il vient de lire.
      score: Math.round(run.score),
      rank: await rankOf(run.score, run.createdAt),
      total: await totalRuns(),
    })
  })
}
