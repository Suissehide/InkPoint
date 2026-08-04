import { prisma } from './db/client'

/**
 * Le tableau façon « arcade cabinet » (constat du jour) : CHAQUE partie a sa
 * propre ligne, y compris deux parties du même pseudo — un bon joueur peut
 * légitimement occuper plusieurs lignes, comme sur une borne d'arcade. Plus
 * de `DISTINCT ON (nickname)` : l'ancien dédoublonnage masquait les parties
 * qui n'étaient pas le record du pseudo.
 *
 * Définition SQL UNIQUE, partagée par les requêtes de classement ci-dessous
 * ET par `purge.ts` : la purge ne doit garder les octets de replay que des
 * parties que le tableau affiche réellement, pas d'un « top » recalculé
 * séparément sur les lignes brutes — une relecture avait déjà trouvé un
 * défaut Critical à ce sujet, la purge ayant effacé le replay d'un joueur
 * pourtant affiché en 2ᵉ position (constat tâche 7, relecture round 1).
 *
 * Sans dédoublonnage, les deux usages trient exactement les mêmes lignes
 * brutes selon la même clé (`score DESC, "createdAt" ASC`) : appeler cette
 * même chaîne aux deux endroits fait coïncider structurellement « ce qui est
 * affiché » et « ce dont on garde les octets » — ce n'est plus une
 * coïncidence numérique (100 ici, 100 là) à entretenir à la main.
 */
export const RUNS_BY_SCORE = `
  SELECT id, nickname, score, wave, "arenaId", "createdAt"
  FROM "Run"
  ORDER BY score DESC, "createdAt" ASC
`

export interface LeaderboardRow {
  /** Exposé pour comparer un ensemble de lignes à l'identique (tests) — jamais sérialisé côté API, voir `present()` dans `routes/leaderboard.ts`. */
  id: string
  rank: number
  nickname: string
  score: number
  wave: number
  arenaId: number
  createdAt: Date
}

export interface RankResult {
  /** Rang de compétition de LA PARTIE SOUMISE, jamais d'une autre partie du pseudo. */
  rank: number
  /** Vrai si cette partie est devenue le record du pseudo (soi-même inclus). */
  improved: boolean
}

/**
 * Rang de compétition (`count(strictement meilleur) + 1`) de la partie
 * `runId`, et si elle est le record de son pseudo.
 *
 * Sans dédoublonnage, la partie qui vient d'être soumise est TOUJOURS dans
 * l'ensemble classé — elle n'a plus besoin d'être cherchée par pseudo ni
 * d'être remplacée par le record du pseudo : son propre rang se calcule
 * directement, et `rank ≤ total` (spec, tâche 3) tient par construction,
 * plus par un repli à entretenir. C'est exactement le cas qui produisait
 * avant correction un « 2ᵉ sur 1 » : un pseudo à 100 000 qui republiait 31
 * voyait sa republication écartée du classement, donc comptée à part de son
 * propre record — reproduit dans `ranking.test.ts` avant cette réécriture.
 */
export async function rankOf(runId: string): Promise<RankResult> {
  const rows = await prisma.$queryRawUnsafe<{ rank: bigint; improved: boolean }[]>(
    `SELECT
       (SELECT count(*) + 1 FROM "Run" r
        WHERE r.score > t.score OR (r.score = t.score AND r."createdAt" < t."createdAt")) AS rank,
       t.id = (
         SELECT b.id FROM "Run" b WHERE b.nickname = t.nickname
         ORDER BY b.score DESC, b."createdAt" ASC LIMIT 1
       ) AS improved
     FROM "Run" t
     WHERE t.id = $1`,
    runId,
  )
  // `runId` vient toujours d'un `INSERT` qui vient de réussir (voir
  // `routes/runs.ts`) : la ligne existe forcément. `rank: 1, improved: false`
  // en repli n'est qu'une garde défensive, jamais le chemin normal.
  const row = rows[0]
  return { rank: row ? Number(row.rank) : 1, improved: row?.improved ?? false }
}

/** Nombre total de parties classées — le dénominateur affiché au joueur. */
export async function totalRuns(): Promise<number> {
  return prisma.run.count()
}

/** Le top `limit`, une ligne par partie, en rang de compétition. */
export async function topRuns(limit: number): Promise<LeaderboardRow[]> {
  // `rank()` de SQL est exactement `count(strictement meilleur) + 1` : c'est la
  // même formule que `rankOf`, et c'est le point. Numéroter par index de
  // tableau donnait « 1, 2, 3 » à trois scores égaux, quand `rankOf` disait
  // « 1, 1, 1 » — un joueur s'entendait dire 1ᵉʳ à la publication et se voyait
  // 3ᵉ au menu.
  const rows = await prisma.$queryRawUnsafe<(Omit<LeaderboardRow, 'rank'> & { rank: bigint })[]>(
    `WITH ranked AS (${RUNS_BY_SCORE}),
          classed AS (
            SELECT id, nickname, score, wave, "arenaId", "createdAt",
                   rank() OVER (ORDER BY score DESC) AS rank
            FROM ranked
          )
     SELECT * FROM classed ORDER BY rank ASC, "createdAt" ASC LIMIT $1`,
    limit,
  )
  return rows.map((row) => ({ ...row, rank: Number(row.rank) }))
}

/**
 * La meilleure ligne d'un pseudo et son rang parmi TOUTES les parties, ou
 * `null` s'il n'a rien publié.
 *
 * Sert la ligne « toi » du panneau de classement, pour que le tableau dise
 * quelque chose à qui n'atteindra jamais le top 100 — son rang ici peut
 * dépasser `limit`, contrairement à `topRuns`, précisément parce que cette
 * ligne existe pour le joueur hors du tableau affiché.
 */
export async function bestOf(nickname: string): Promise<LeaderboardRow | null> {
  const rows = await prisma.$queryRawUnsafe<(Omit<LeaderboardRow, 'rank'> & { rank: bigint })[]>(
    `WITH ranked AS (${RUNS_BY_SCORE}),
          classed AS (
            SELECT id, nickname, score, wave, "arenaId", "createdAt",
                   rank() OVER (ORDER BY score DESC) AS rank
            FROM ranked
          )
     SELECT * FROM classed WHERE nickname = $1 ORDER BY score DESC, "createdAt" ASC LIMIT 1`,
    nickname,
  )
  const row = rows[0]
  return row ? { ...row, rank: Number(row.rank) } : null
}
