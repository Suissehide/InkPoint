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
    // Prouve le câblage try/catch → 503, pas qu'une vraie coupure Postgres
    // emprunte ce chemin : `mockRejectedValueOnce` simule un rejet immédiat,
    // alors qu'une panne réelle (connexion refusée, timeout réseau) rejette
    // aussi mais par une route différente à l'intérieur du driver. Ce test
    // vérifie que *si* `$queryRaw` rejette, `health.ts` répond bien 503 —
    // pas que Postgres rejette effectivement quand il tombe.
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('down'))
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'degraded' })
    spy.mockRestore()
    await app.close()
  })
})
