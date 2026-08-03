import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '../db/client'
import { buildServer } from '../server'
import { TOP_SIZE } from './leaderboard'

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
    const body = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    expect(body.top.map((r: { nickname: string }) => r.nickname)).toEqual(['leo', 'ana'])
    expect(body.top[0].score).toBe(300)
    await app.close()
  })

  it('donne des rangs contigus, sans trou laissé par les parties masquées', async () => {
    await seedRun('leo', 300, 'a')
    await seedRun('leo', 250, 'b')
    await seedRun('ana', 200, 'c')
    const app = buildServer()
    await app.ready()
    const body = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    // Sans le dédoublonnage dans le calcul du rang, `ana` serait 3e.
    expect(body.top.map((r: { rank: number }) => r.rank)).toEqual([1, 2])
    await app.close()
  })

  it('arrondit le score, comme l’écran de fin du jeu', async () => {
    await seedRun('leo', 19449.33333333197, 'a')
    const app = buildServer()
    await app.ready()
    const body = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    expect(body.top[0].score).toBe(19449)
    await app.close()
  })

  it('rend { top } sans pseudo', async () => {
    await seedRun('ana', 100, 'a')
    const app = buildServer()
    await app.ready()
    const body = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    expect(body.top).toHaveLength(1)
    expect(body.you).toBeUndefined()
    await app.close()
  })

  it('ajoute « toi » quand le pseudo est hors du top rendu', async () => {
    // Semé depuis `TOP_SIZE` et non depuis un nombre écrit en dur : ce test doit
    // suivre le jour où la taille du classement change.
    for (let i = 0; i < TOP_SIZE; i++) {
      await seedRun(`j${i}`, 1000 - i, `h${i}`)
    }
    await seedRun('leo', 1, 'moi')
    const app = buildServer()
    await app.ready()
    const body = (await app.inject({ method: 'GET', url: '/leaderboard?nickname=leo' })).json()
    expect(body.top).toHaveLength(TOP_SIZE)
    expect(body.you.nickname).toBe('leo')
    expect(body.you.rank).toBe(TOP_SIZE + 1)
    await app.close()
  })

  it('n’ajoute pas « toi » quand le pseudo est déjà dans le top', async () => {
    await seedRun('leo', 100, 'a')
    const app = buildServer()
    await app.ready()
    const body = (await app.inject({ method: 'GET', url: '/leaderboard?nickname=leo' })).json()
    expect(body.top[0].nickname).toBe('leo')
    // Répéter en pied une ligne déjà visible n'apprendrait rien au joueur.
    expect(body.you).toBeUndefined()
    await app.close()
  })

  it('donne un reason à une erreur de validation', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: '', replay: 'x' },
    })
    // Le front traite une seule forme d'erreur, pas trois.
    expect(res.json().reason).toBe('invalid_request')
    await app.close()
  })
})
