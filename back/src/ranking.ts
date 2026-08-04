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

export interface RankResult {
  /** Rang de la MEILLEURE partie du pseudo, jamais celui de la partie soumise. */
  rank: number
  /** Vrai si la partie qui vient d'être soumise est devenue le record du pseudo. */
  improved: boolean
}

/**
 * Rang de la meilleure partie du pseudo `nickname` parmi les meilleures de
 * chaque pseudo, et si `runId` est cette meilleure partie.
 *
 * Prend `nickname` et non le score de la partie qui vient d'être soumise :
 * un joueur qui a déjà un meilleur score voit sa nouvelle soumission écartée
 * de l'ensemble dédoublonné (spec §4), mais reste lui-même classé sur son
 * record. Compter la soumission comme si elle concurrençait son propre
 * record produit un rang supérieur au total de pseudos classés — reproduit
 * ici avant correction : un pseudo à 100 000 qui republie 31 recevait
 * `{ rank: 2, total: 1 }`, un « 2ᵉ sur 1 » que rien côté client ne peut
 * afficher sensément.
 */
export async function rankOf(nickname: string, runId: string): Promise<RankResult> {
  const rows = await prisma.$queryRawUnsafe<{ id: string; rank: bigint }[]>(
    `WITH best AS (${BEST_PER_NICKNAME})
     SELECT b.id,
       (SELECT count(*) + 1 FROM best
        WHERE score > b.score OR (score = b.score AND "createdAt" < b."createdAt")) AS rank
     FROM best b
     WHERE b.nickname = $1`,
    nickname,
  )
  // La partie qui vient d'être insérée est forcément dans `best` pour ce
  // pseudo : soit elle EST le record, soit le pseudo en a déjà un meilleur —
  // dans les deux cas `best` contient une ligne pour `nickname`. `rank: 1`
  // en repli n'est donc qu'une garde défensive, jamais le chemin normal.
  const row = rows[0]
  return { rank: row ? Number(row.rank) : 1, improved: row?.id === runId }
}

/** Nombre de pseudos classés — le dénominateur affiché au joueur. */
export async function totalRuns(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `WITH best AS (${BEST_PER_NICKNAME}) SELECT count(*) AS total FROM best`,
  )
  return Number(rows[0]?.total ?? 0)
}

/** Le top `limit`, une ligne par pseudo, en rang de compétition. */
export async function topRuns(limit: number): Promise<LeaderboardRow[]> {
  // `rank()` de SQL est exactement `count(strictement meilleur) + 1` : c'est la
  // même formule que `rankOf`, et c'est le point. Numéroter par index de
  // tableau donnait « 1, 2, 3 » à trois scores égaux, quand `rankOf` disait
  // « 1, 1, 1 » — un joueur s'entendait dire 1ᵉʳ à la publication et se voyait
  // 3ᵉ au menu.
  const rows = await prisma.$queryRawUnsafe<(Omit<LeaderboardRow, 'rank'> & { rank: bigint })[]>(
    `WITH best AS (${BEST_PER_NICKNAME}),
          classed AS (
            SELECT nickname, score, wave, "arenaId", "createdAt",
                   rank() OVER (ORDER BY score DESC) AS rank
            FROM best
          )
     SELECT * FROM classed ORDER BY rank ASC, "createdAt" ASC LIMIT $1`,
    limit,
  )
  return rows.map((row) => ({ ...row, rank: Number(row.rank) }))
}

/**
 * La meilleure ligne d'un pseudo et son rang, ou `null` s'il n'a rien publié.
 *
 * Sert la ligne « toi » du panneau de classement, pour que le tableau dise
 * quelque chose à qui n'atteindra jamais le top 100.
 */
export async function bestOf(nickname: string): Promise<LeaderboardRow | null> {
  const rows = await prisma.$queryRawUnsafe<(Omit<LeaderboardRow, 'rank'> & { rank: bigint })[]>(
    `WITH best AS (${BEST_PER_NICKNAME}),
          classed AS (
            SELECT nickname, score, wave, "arenaId", "createdAt",
                   rank() OVER (ORDER BY score DESC) AS rank
            FROM best
          )
     SELECT * FROM classed WHERE nickname = $1`,
    nickname,
  )
  const row = rows[0]
  return row ? { ...row, rank: Number(row.rank) } : null
}
