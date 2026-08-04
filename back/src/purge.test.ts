import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from './db/client'
import { purgeReplaysOutsideTop } from './purge'
import { topRuns } from './ranking'

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

  it('purge selon les lignes brutes (arcade cabinet) : un pseudo qui spamme peut légitimement occuper plusieurs places du top', async () => {
    // A publie trois parties, toutes au-dessus de la seule partie de B. Sans
    // dédoublonnage (règles « arcade cabinet », spec du jour), A occupe
    // LÉGITIMEMENT les deux places du top 2 — comme sur une borne d'arcade,
    // un bon joueur peut occuper plusieurs lignes. C'est l'inverse exact de
    // l'ancien comportement dédoublonné (B deuxième, A limité à une place).
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

    const aBest = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'a-best' } })
    const aSecond = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'a-second' } })
    expect(aBest.replay).not.toBeNull()
    expect(aSecond.replay).not.toBeNull()

    const b = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'b-only' } })
    const aThird = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'a-third' } })
    const c = await prisma.run.findUniqueOrThrow({ where: { replayHash: 'c-only' } })
    expect(b.replay).toBeNull()
    expect(aThird.replay).toBeNull()
    expect(c.replay).toBeNull()
  })

  it('garde EXACTEMENT les octets des parties du top affiché (topRuns), aucune autre', async () => {
    // Falsification (brief) : ne pas se contenter de « certaines lignes sont
    // gardées » — comparer l'ensemble exact des identifiants purgés à
    // l'ensemble exact que `topRuns` (le même que celui affiché au joueur)
    // désigne comme le top. C'est précisément l'invariant que `RUNS_BY_SCORE`
    // (`ranking.ts`) rend structurel : les deux définitions ne peuvent plus
    // diverger puisqu'elles trient la même chaîne SQL.
    const nicknames = ['a', 'b', 'c', 'd', 'e']
    for (let i = 0; i < 20; i++) {
      const nickname = nicknames[i % nicknames.length] ?? 'a'
      await prisma.run.create({
        data: {
          nickname,
          seed: 1n,
          arenaId: 0,
          simVersion: '0'.repeat(16),
          score: 1000 - i * 7, // scores tous distincts, pas d'égalité à trancher
          wave: 1,
          steps: 10,
          replay: Buffer.from([1]),
          replayHash: `r-${i}`,
        },
      })
    }

    const limit = 8
    // `topRuns` calculé AVANT la purge : c'est la même définition
    // (`RUNS_BY_SCORE`) que celle utilisée par la purge, donc le même
    // ensemble d'identifiants qu'après — la purge n'efface que des octets,
    // jamais de ligne.
    const expectedIds = new Set((await topRuns(limit)).map((r) => r.id))
    await purgeReplaysOutsideTop(limit)

    const all = await prisma.run.findMany()
    for (const run of all) {
      if (expectedIds.has(run.id)) {
        expect(run.replay).not.toBeNull()
      } else {
        expect(run.replay).toBeNull()
      }
    }
    expect(all.filter((r) => r.replay !== null)).toHaveLength(limit)
  })
})
