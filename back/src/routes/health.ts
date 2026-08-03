import type { FastifyInstance } from 'fastify'

import { prisma } from '../db/client'

/**
 * Sonde du healthcheck compose. Interroge réellement la base : un service qui
 * répond `ok` alors que Postgres est tombé ferait redémarrer le mauvais
 * conteneur, ou aucun.
 */
export function registerHealth(app: FastifyInstance): void {
  app.get('/health', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return { status: 'ok' }
    } catch {
      return reply.code(503).send({ status: 'degraded' })
    }
  })
}
