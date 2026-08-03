import { prisma } from './db/client'

/**
 * Efface les octets des replays hors du top, en gardant la ligne.
 *
 * Le verdict est calculé une fois et définitif : garder le replay au-delà du
 * top ne sert qu'à un ré-audit, lequel est de toute façon impossible dès que
 * `sim/` change. Jusqu'à 260 Ko par partie finiraient par compter sur un petit
 * serveur ; le top 100 conservé plafonne à environ 26 Mo.
 */
export async function purgeReplaysOutsideTop(limit: number): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "Run" SET replay = NULL
     WHERE replay IS NOT NULL
       AND id NOT IN (
         SELECT id FROM "Run" ORDER BY score DESC, "createdAt" ASC LIMIT $1
       )`,
    limit,
  )
  return result
}
