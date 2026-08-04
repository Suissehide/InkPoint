import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '../db/client'
import { purgeReplaysOutsideTop } from '../purge'
import { rankOf, totalRuns } from '../ranking'
import type { App } from '../server'
import { Refusal } from '../verify/refusal'
import { decodeAndCheck, verifyDecoded } from '../verify/verify'

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

/** `null` si `error` n'est pas un `Refusal` — laisse alors l'appelant le relancer. */
function refusalBody(error: unknown): { reason: string; message: string } | null {
  return error instanceof Refusal ? { reason: error.reason, message: error.message } : null
}

export function registerRuns(app: App): void {
  app.post('/runs', { schema: { body: bodySchema } }, async (request, reply) => {
    const { nickname, replay } = request.body

    // Décodage et contrôles de header d'abord, rejeu ensuite : le hash ne
    // dépend que des octets soumis, donc le doublon (ci-dessous) se détecte
    // sans avoir payé les ~470 ms d'un rejeu pour une soumission qu'on va
    // refuser de toute façon (tâche 4).
    let checked: ReturnType<typeof decodeAndCheck>
    try {
      checked = decodeAndCheck(replay)
    } catch (error) {
      const body = refusalBody(error)
      if (body) {
        return reply.code(422).send(body)
      }
      throw error
    }

    // Chemin rapide : évite un rejeu et un INSERT voués à échouer dans le cas
    // courant (un seul essai). Ne suffit pas seul : deux requêtes identiques
    // envoyées en parallèle (double clic, retry client) passent toutes les
    // deux cette lecture avant que l'une ou l'autre n'écrive — c'est la
    // contrainte `@unique` sur `replayHash`, rattrapée ci-dessous, qui
    // ferme réellement la course.
    const duplicate = await prisma.run.findUnique({ where: { replayHash: checked.hash } })
    if (duplicate !== null) {
      return reply.code(422).send(ALREADY_SUBMITTED)
    }

    let verified: ReturnType<typeof verifyDecoded>
    try {
      verified = verifyDecoded(checked)
    } catch (error) {
      const body = refusalBody(error)
      if (body) {
        return reply.code(422).send(body)
      }
      throw error
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
      // reste une panne serveur : ne pas élargir le filtre au-delà du cas
      // précis qu'on sait diagnostiquer.
      if (isUniqueViolation(error)) {
        return reply.code(422).send(ALREADY_SUBMITTED)
      }
      throw error
    }

    const [{ rank, improved }, total] = await Promise.all([rankOf(run.id), totalRuns()])

    // Après insertion, jamais avant : la partie qui vient d'arriver doit
    // pouvoir entrer dans le top et en chasser une autre.
    //
    // Le ménage n'est pas le contrat : la partie est déjà enregistrée et déjà
    // comptée dans rank/total ci-dessus. Si la purge échoue (verrou, pool
    // épuisé…), le joueur ne doit ni perdre son 201 ni se heurter à un
    // « already_submitted » en retentant une soumission déjà réussie — donc
    // on journalise et on avale, sans jamais laisser passer l'erreur.
    try {
      await purgeReplaysOutsideTop(KEPT_REPLAYS)
    } catch (error) {
      request.log.error(error, 'purge des replays hors top : échec, partie déjà enregistrée')
    }

    return reply.code(201).send({
      // Arrondi, comme l'écran de fin du jeu : lui renvoyer le flottant brut
      // lui ferait croire à un désaccord avec le score qu'il vient de lire.
      score: Math.round(run.score),
      // Rang de CETTE partie précise parmi toutes les parties classées
      // (règles « arcade cabinet », tâche du jour) : `rank ≤ total` tient
      // désormais par construction, plus par un cas particulier à entretenir
      // (voir la docstring de `rankOf`, `ranking.ts`).
      rank,
      total,
      // Distinct de `rank` : un joueur peut republier une partie plus faible
      // que son propre record — elle obtient alors son propre rang (parfois
      // très bas) sans devenir le record du pseudo. `improved` distingue donc
      // « nouveau record » de « ce score-ci n'a pas battu le vôtre ».
      improved,
    })
  })
}
