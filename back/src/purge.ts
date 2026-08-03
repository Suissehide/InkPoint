import { prisma } from './db/client'
import { BEST_PER_NICKNAME } from './ranking'

/**
 * Efface les octets des replays hors du top, en gardant la ligne.
 *
 * Le verdict est calculé une fois et définitif : garder le replay au-delà du
 * top ne sert qu'à un ré-audit, lequel est de toute façon impossible dès que
 * `sim/` change. Jusqu'à 260 Ko par partie finiraient par compter sur un petit
 * serveur ; le top 100 conservé plafonne à environ 26 Mo.
 *
 * Le « top » purgé doit être celui que le joueur voit, pas les lignes brutes :
 * `ranking.ts` dédoublonne par pseudo (`BEST_PER_NICKNAME`) avant de classer,
 * donc un pseudo qui spamme des parties ne doit pas pouvoir, à lui seul,
 * remplir les `limit` places et faire disparaître le replay d'un pseudo
 * réellement classé devant sur le tableau affiché.
 */
export async function purgeReplaysOutsideTop(limit: number): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `WITH best AS (${BEST_PER_NICKNAME})
     UPDATE "Run" SET replay = NULL
     WHERE replay IS NOT NULL
       AND id NOT IN (
         SELECT id FROM best ORDER BY score DESC, "createdAt" ASC LIMIT $1
       )`,
    limit,
  )
  return result
}
