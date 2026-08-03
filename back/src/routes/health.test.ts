import { describe, expect, it, vi } from 'vitest'

import { prisma } from '../db/client'
import { buildServer } from '../server'

describe('GET /health', () => {
  it('répond 200 et un statut lisible', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })

  it('rend 503 quand la base ne répond pas', async () => {
    const app = buildServer()
    await app.ready()
    // On casse la base pour de bon plutôt que de simuler : c'est la seule
    // façon de savoir que le chemin d'échec est réellement emprunté.
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('down'))
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'degraded' })
    spy.mockRestore()
    await app.close()
  })
})
