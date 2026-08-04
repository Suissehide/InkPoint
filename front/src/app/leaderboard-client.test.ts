import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchLeaderboard, submitRun } from './leaderboard-client'

const replay = {
  simVersion: '0'.repeat(16),
  seed: 1,
  arenaId: 0 as const,
  inputs: new Int16Array(0),
  choices: [],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('client du classement', () => {
  it('rend le rang quand le serveur accepte', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ score: 31, rank: 7, total: 42, improved: true }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const out = await submitRun('leo', replay)
    expect(out).toEqual({ ok: true, score: 31, rank: 7, total: 42, improved: true })
  })

  it('rend le motif quand le serveur refuse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ reason: 'stale_build', message: 'version périmée' }), {
            status: 422,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const out = await submitRun('leo', replay)
    expect(out).toEqual({ ok: false, reason: 'stale_build', message: 'version périmée' })
  })

  it('rend un motif réseau plutôt que de lever, quand le service est injoignable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    // Le jeu reste jouable hors ligne (spec §8) : une publication qui échoue ne
    // doit jamais remonter en exception jusqu'à la boucle de jeu.
    expect(await submitRun('leo', replay)).toEqual({
      ok: false,
      reason: 'offline',
      message: expect.any(String),
    })
    expect(await fetchLeaderboard(null)).toBeNull()
  })
})
