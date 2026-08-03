import { prisma } from './db/client'

/**
 * Le classement ne montre **qu'une ligne par pseudo**, la meilleure (spec §4).
 * Le rang se calcule donc sur cet ensemble dédoublonné et non sur toutes les
 * parties : les deux règles cohabitant naïvement, le top 10 afficherait des
 * rangs troués (1, 2, 5, 9…) puisque les parties masquées continueraient de
 * compter.
 *
 * `DISTINCT ON (nickname)` est propre à PostgreSQL et retient la première ligne
 * de chaque groupe selon l'`ORDER BY` — donc la meilleure partie du pseudo, et
 * à score égal la plus ancienne.
 *
 * Exportée (et `id` inclus dans la sélection) car `purge.ts` en a aussi
 * besoin : il ne doit garder que les replays des parties qui apparaissent
 * réellement sur le tableau affiché, pas d'un « top » recalculé séparément
 * sur les lignes brutes — sinon les deux définitions divergent (constat
 * tâche 7, relecture round 1).
 */
export const BEST_PER_NICKNAME = `
  SELECT DISTINCT ON (nickname) id, nickname, score, wave, "arenaId", "createdAt"
  FROM "Run"
  ORDER BY nickname, score DESC, "createdAt" ASC
`

export interface LeaderboardRow {
  rank: number
  nickname: string
  score: number
  wave: number
  arenaId: number
  createdAt: Date
}

/** Rang d'une partie parmi les meilleures de chaque pseudo. */
export async function rankOf(score: number, createdAt: Date): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ rank: bigint }[]>(
    `WITH best AS (${BEST_PER_NICKNAME})
     SELECT count(*) + 1 AS rank FROM best
     WHERE score > $1 OR (score = $1 AND "createdAt" < $2)`,
    score,
    createdAt,
  )
  return Number(rows[0]?.rank ?? 1)
}

/** Nombre de pseudos classés — le dénominateur affiché au joueur. */
export async function totalRuns(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `WITH best AS (${BEST_PER_NICKNAME}) SELECT count(*) AS total FROM best`,
  )
  return Number(rows[0]?.total ?? 0)
}

/** Le top `limit`, une ligne par pseudo, rangs contigus. */
export async function topRuns(limit: number): Promise<LeaderboardRow[]> {
  const rows = await prisma.$queryRawUnsafe<Omit<LeaderboardRow, 'rank'>[]>(
    `WITH best AS (${BEST_PER_NICKNAME})
     SELECT nickname, score, wave, "arenaId", "createdAt"
     FROM best ORDER BY score DESC, "createdAt" ASC LIMIT $1`,
    limit,
  )
  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}
