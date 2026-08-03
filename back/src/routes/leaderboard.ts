import type { FastifyInstance } from 'fastify'

import { topRuns } from '../ranking'

/** Taille du classement rendu (spec §4). */
const TOP_SIZE = 10

export function registerLeaderboard(app: FastifyInstance): void {
  app.get('/leaderboard', async () => {
    const rows = await topRuns(TOP_SIZE)
    return rows.map((row) => ({
      rank: row.rank,
      nickname: row.nickname,
      // Arrondi ici et nulle part ailleurs : la base garde le flottant brut,
      // l'affichage arrondit — comme l'écran de fin du jeu.
      score: Math.round(row.score),
      wave: row.wave,
      arenaId: row.arenaId,
      createdAt: row.createdAt.toISOString(),
    }))
  })
}
