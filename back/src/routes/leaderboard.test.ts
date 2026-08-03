import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '../db/client'
import { buildServer } from '../server'

async function seedRun(nickname: string, score: number, hash: string): Promise<void> {
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

describe('GET /leaderboard', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('ne montre qu’une ligne par pseudo, la meilleure', async () => {
    await seedRun('leo', 100, 'a')
    await seedRun('leo', 300, 'b')
    await seedRun('ana', 200, 'c')
    const app = buildServer()
    await app.ready()
    const rows = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    expect(rows.map((r: { nickname: string }) => r.nickname)).toEqual(['leo', 'ana'])
    expect(rows[0].score).toBe(300)
    await app.close()
  })

  it('donne des rangs contigus, sans trou laissé par les parties masquées', async () => {
    await seedRun('leo', 300, 'a')
    await seedRun('leo', 250, 'b')
    await seedRun('ana', 200, 'c')
    const app = buildServer()
    await app.ready()
    const rows = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    // Sans le dédoublonnage dans le calcul du rang, `ana` serait 3e.
    expect(rows.map((r: { rank: number }) => r.rank)).toEqual([1, 2])
    await app.close()
  })

  it('arrondit le score, comme l’écran de fin du jeu', async () => {
    await seedRun('leo', 19449.33333333197, 'a')
    const app = buildServer()
    await app.ready()
    const rows = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    expect(rows[0].score).toBe(19449)
    await app.close()
  })
})
