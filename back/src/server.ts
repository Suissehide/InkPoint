import cors from '@fastify/cors'
import Fastify, {
  type FastifyBaseLogger,
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
import { registerRuns } from './routes/runs'

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

  app.register(cors, { origin: env.CORS_ORIGIN })

  registerHealth(app)
  registerRuns(app)

  return app
}
