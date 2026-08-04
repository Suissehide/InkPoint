import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { bestOf, type LeaderboardRow, topRuns } from '../ranking'

/**
 * Taille du classement rendu (spec §4). Exporté parce que les tests doivent
 * s'en servir plutôt que de réécrire le nombre : semer « un de plus que le
 * top » en dur casserait silencieusement le jour où ce nombre change.
 */
export const TOP_SIZE = 100

const querySchema = z.object({
  /** Facultatif : fourni, la réponse porte en plus la ligne de ce pseudo. */
  nickname: z.string().trim().min(1).max(20).optional(),
})

/**
 * Arrondi le score et sérialise la date — le même traitement pour `top` et
 * pour `you`, sans quoi la ligne « toi » pourrait afficher un score au
 * format différent des autres lignes du tableau.
 */
function present(row: LeaderboardRow) {
  return {
    // Sérialisé depuis les règles « arcade cabinet » : un pseudo peut tenir
    // plusieurs lignes, donc désigner « la ligne du joueur » par son pseudo
    // les allumerait toutes. L'écran de fin met en évidence LA partie qu'on
    // vient de jouer, et il lui faut son identifiant pour ça.
    id: row.id,
    rank: row.rank,
    nickname: row.nickname,
    // Arrondi ici et nulle part ailleurs : la base garde le flottant brut,
    // l'affichage arrondit — comme l'écran de fin du jeu.
    score: Math.round(row.score),
    wave: row.wave,
    arenaId: row.arenaId,
    createdAt: row.createdAt.toISOString(),
  }
}

export function registerLeaderboard(app: FastifyInstance): void {
  app.get('/leaderboard', { schema: { querystring: querySchema } }, async (request) => {
    const top = await topRuns(TOP_SIZE)
    const rows = top.map(present)

    const { nickname } = request.query as { nickname?: string }
    if (nickname === undefined) {
      return { top: rows }
    }
    // Inutile de répéter en pied une ligne déjà visible dans la liste.
    if (rows.some((row) => row.nickname === nickname)) {
      return { top: rows }
    }
    const you = await bestOf(nickname)
    return you === null ? { top: rows } : { top: rows, you: present(you) }
  })
}
