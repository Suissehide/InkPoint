import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from './db/client'
import { purgeReplaysOutsideTop } from './purge'

describe('purge des replays', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('garde les octets du top et efface ceux du reste', async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.run.create({
        data: {
          nickname: `j${i}`,
          seed: 1n,
          arenaId: 0,
          simVersion: '0'.repeat(16),
          score: i * 100,
          wave: 1,
          steps: 10,
          replay: Buffer.from([1, 2, 3]),
          replayHash: `h${i}`,
        },
      })
    }

    const purged = await purgeReplaysOutsideTop(2)
    expect(purged).toBe(3)

    const kept = await prisma.run.findMany({ orderBy: { score: 'desc' } })
    expect(kept[0]?.replay).not.toBeNull()
    expect(kept[1]?.replay).not.toBeNull()
    expect(kept[2]?.replay).toBeNull()
    // La ligne reste : seul le verdict compte, et il est déjà calculé.
    expect(kept).toHaveLength(5)
  })
})
