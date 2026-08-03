import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from './db/client'
import { rankOf, totalRuns } from './ranking'

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
