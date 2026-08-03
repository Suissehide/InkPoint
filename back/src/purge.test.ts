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

  it('purge selon le top affiché (dédoublonné par pseudo), pas selon les lignes brutes', async () => {
    // A spamme trois parties, toutes au-dessus de la seule partie de B — sur
    // les lignes brutes, A occuperait à lui seul les deux places du top.
    // Sur le tableau affiché (une ligne par pseudo), A n'en garde qu'une :
    // B est bien deuxième, devant C.
    await prisma.run.create({
      data: {
        nickname: 'a',
        seed: 1n,
        arenaId: 0,
        simVersion: '0'.repeat(16),
        score: 1000,
        wave: 1,
        steps: 10,
        replay: Buffer.from([1]),
        replayHash: 'a-best',
      },
    })
    await prisma.run.create({
      data: {
        nickname: 'a',
        seed: 1n,
        arenaId: 0,
        simVersion: '0'.repeat(16),
        score: 900,
        wave: 1,
        steps: 10,
        replay: Buffer.from([1]),
        replayHash: 'a-second',
      },
    })
    await prisma.run.create({
      data: {
        nickname: 'a',
        seed: 1n,
        arenaId: 0,
        simVersion: '0'.repeat(16),
        score: 851,
        wave: 1,
        steps: 10,
        replay: Buffer.from([1]),
        replayHash: 'a-third',
      },
    })
    await prisma.run.create({
      data: {
        nickname: 'b',
        seed: 1n,
        arenaId: 0,
        simVersion: '0'.repeat(16),
        score: 875,
        wave: 1,
        steps: 10,
        replay: Buffer.from([1]),
        replayHash: 'b-only',
      },
    })
    await prisma.run.create({
      data: {
        nickname: 'c',
        seed: 1n,
        arenaId: 0,
        simVersion: '0'.repeat(16),
        score: 50,
        wave: 1,
        steps: 10,
        replay: Buffer.from([1]),
        replayHash: 'c-only',
      },
    })

    const purged = await purgeReplaysOutsideTop(2)
    expect(purged).toBe(3)

    const b = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'b-only' } })
    expect(b.replay).not.toBeNull()

    const aBest = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'a-best' } })
    expect(aBest.replay).not.toBeNull()

    const aSecond = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'a-second' } })
    const aThird = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'a-third' } })
    const c = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'c-only' } })
    expect(aSecond.replay).toBeNull()
    expect(aThird.replay).toBeNull()
    expect(c.replay).toBeNull()
  })
})
