import type { FastifyInstance } from 'fastify'

/**
 * Sonde du healthcheck compose. Ne touche pas encore à la base : la tâche 2
 * la branchera, quand il y aura une base à interroger.
 */
export function registerHealth(app: FastifyInstance): void {
  app.get('/health', async () => ({ status: 'ok' }))
}
