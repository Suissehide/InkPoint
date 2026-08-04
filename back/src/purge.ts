import { prisma } from './db/client'
import { RUNS_BY_SCORE } from './ranking'

/**
 * Efface les octets des replays hors du top, en gardant la ligne.
 *
 * Le verdict est calculé une fois et définitif : garder le replay au-delà du
 * top ne sert qu'à un ré-audit, lequel est de toute façon impossible dès que
 * `sim/` change. Jusqu'à 260 Ko par partie finiraient par compter sur un petit
 * serveur ; le top 100 conservé plafonne à environ 26 Mo.
 *
 * Le « top » purgé doit être EXACTEMENT celui que le joueur voit, pas un « top »
 * recalculé séparément sur les lignes brutes : `RUNS_BY_SCORE` (`ranking.ts`)
 * est la MÊME définition que celle qui alimente `topRuns` — voir sa docstring
 * pour le défaut Critical que cette relecture avait trouvé quand les deux
 * définitions divergeaient (constat tâche 7, relecture round 1). Sans
 * dédoublonnage, `LIMIT $1` sur cette même clé (`score DESC, "createdAt" ASC`)
 * sélectionne structurellement le même ensemble de lignes ici et dans
 * `topRuns` — ce n'est plus une coïncidence numérique à surveiller.
 */
export async function purgeReplaysOutsideTop(limit: number): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `WITH ranked AS (${RUNS_BY_SCORE})
     UPDATE "Run" SET replay = NULL
     WHERE replay IS NOT NULL
       AND id NOT IN (
         SELECT id FROM ranked LIMIT $1
       )`,
    limit,
  )
  return result
}
