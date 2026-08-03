import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from './db/client'
import { bestOf, rankOf, topRuns, totalRuns } from './ranking'

async function seedRun(
  nickname: string,
  score: number,
  hash: string,
): Promise<{ id: string; createdAt: Date }> {
  return prisma.run.create({
    data: {
      nickname,
      seed: 1n,
      arenaId: 0,
      simVersion: '0'.repeat(16),
      score,
      wave: 1,
      steps: 10,
      replayHash: hash,
    },
  })
}

describe('rankOf', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('rend le rang de la meilleure partie du pseudo, jamais celui de la soumission', async () => {
    // Cinq pseudos mieux classés que le record de `leo`, puis `leo` republie
    // une partie plus faible que ce record. Sans la correction (tâche 3),
    // `rankOf` compterait le propre record de `leo` contre lui EN PLUS des
    // cinq autres — un rang de 7 pour un total de 6 pseudos, « 7ᵉ sur 6 ».
    for (let i = 0; i < 5; i++) {
      await seedRun(`j${i}`, 200_000 - i, `top-${i}`)
    }
    await seedRun('leo', 100_000, 'leo-best')
    const worse = await seedRun('leo', 31, 'leo-worse')

    const { rank, improved } = await rankOf('leo', worse.id)
    expect(rank).toBe(6)
    expect(improved).toBe(false)
    expect(rank).toBeLessThanOrEqual(await totalRuns())
  })

  it('marque improved quand la soumission devient le record du pseudo', async () => {
    await seedRun('leo', 100, 'first')
    const better = await seedRun('leo', 200, 'better')

    const { rank, improved } = await rankOf('leo', better.id)
    expect(rank).toBe(1)
    expect(improved).toBe(true)
  })
})

describe('totalRuns', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('compte les pseudos, pas les parties : un pseudo qui spamme n’en compte qu’une', async () => {
    await seedRun('leo', 100, 'a')
    await seedRun('leo', 200, 'b')
    await seedRun('leo', 300, 'c')
    await seedRun('ana', 50, 'd')
    expect(await totalRuns()).toBe(2)
  })
})

async function seed(nickname: string, score: number, hash: string): Promise<void> {
  await prisma.run.create({
    data: {
      nickname,
      seed: 1n,
      arenaId: 0,
      simVersion: '0'.repeat(16),
      score,
      wave: 1,
      steps: 10,
      replayHash: hash,
    },
  })
}

describe('classement', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('donne le même rang aux scores égaux, et saute les rangs ensuite', async () => {
    await seed('ana', 100, 'a')
    await seed('bo', 100, 'b')
    await seed('cy', 50, 'c')
    // Rang de compétition : deux premiers ex æquo, puis 3 — jamais 1, 2, 3.
    expect((await topRuns(10)).map((r) => r.rank)).toEqual([1, 1, 3])
  })

  it('rend la meilleure ligne d’un pseudo et son rang', async () => {
    await seed('ana', 100, 'a')
    await seed('leo', 40, 'b')
    await seed('leo', 70, 'c')
    const you = await bestOf('leo')
    expect(you?.score).toBe(70)
    expect(you?.rank).toBe(2)
  })

  it('rend null pour un pseudo qui n’a rien publié', async () => {
    await seed('ana', 100, 'a')
    expect(await bestOf('inconnu')).toBeNull()
  })
})
