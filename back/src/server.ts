import cors from '@fastify/cors'
import Fastify, {
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
  type RawReplyDefaultExpression,
  type RawRequestDefaultExpression,
  type RawServerDefault,
} from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import { env } from './env'
import { registerHealth } from './routes/health'
import { registerLeaderboard } from './routes/leaderboard'
import { registerRuns } from './routes/runs'
import type { HttpErrorReason } from './verify/refusal'

/**
 * L'instance telle que les routes la reçoivent : avec le provider Zod, pour
 * que `request.body` se type depuis le schéma déclaré à `app.post` plutôt que
 * de rester `unknown`. Un simple `FastifyInstance` (provider par défaut) ne
 * porte pas cette information.
 */
export type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>

/**
 * Construit l'application **sans l'écouter**. C'est ce qui permet aux tests de
 * l'interroger par `app.inject()` sans ouvrir de port : plusieurs fichiers de
 * test peuvent alors construire leur propre instance sans se disputer 3000.
 * `main.ts` est le seul endroit qui appelle `listen`.
 */
export function buildServer(): App {
  const app = Fastify({
    // Le replay arrive en base64 dans du JSON : 432 Ko bruts font environ
    // 260 Ko compressés, donc 347 Ko en base64. 768 Ko laisse un facteur deux
    // sur ce qui transite réellement, et non sur la charge compressée.
    bodyLimit: 768 * 1024,
    logger: true,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Le front n'a qu'une forme d'erreur à traiter. Sans ça, il en aurait trois :
  // les 422 métier portent `{reason, message}`, le 400 de zod et le 413 de
  // `bodyLimit` portent le `{statusCode, error, message}` de Fastify.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = error.statusCode ?? 500
    if (status === 413) {
      const reason: HttpErrorReason = 'too_large'
      return reply.code(413).send({ reason, message: error.message })
    }
    if (status >= 400 && status < 500) {
      const reason: HttpErrorReason = 'invalid_request'
      return reply.code(status).send({ reason, message: error.message })
    }
    // Une panne reste une panne : ni `reason` métier, ni détail interne exposé.
    reply.log.error(error)
    const reason: HttpErrorReason = 'server_error'
    return reply.code(500).send({ reason, message: 'erreur interne' })
  })

  app.register(cors, { origin: env.CORS_ORIGIN })

  registerHealth(app)
  registerRuns(app)
  registerLeaderboard(app)

  return app
}
