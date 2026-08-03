import { describe, expect, it } from 'vitest'

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
})
