import { gzipSync } from 'node:zlib'
import { encodeReplay, type Replay } from '@sim/replay/format'
import { SIM_VERSION } from '@sim/version.generated'
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '../db/client'
import { buildServer } from '../server'

function payloadFor(replay: Replay): string {
  return Buffer.from(gzipSync(encodeReplay(replay))).toString('base64')
}

const emptyReplay: Replay = {
  simVersion: SIM_VERSION,
  seed: 42,
  arenaId: 0,
  inputs: new Int16Array(0),
  choices: [],
}

describe('POST /runs', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('refuse un pseudo vide', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: '   ', replay: payloadFor(emptyReplay) },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('refuse un replay périmé avec la raison stale_build', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        nickname: 'leo',
        replay: payloadFor({ ...emptyReplay, simVersion: '0000000000000000' }),
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().reason).toBe('stale_build')
    await app.close()
  })

  it('refuse une partie qui ne finit pas par une mort', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: 'leo', replay: payloadFor(emptyReplay) },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().reason).toBe('not_dead')
    // Rien ne doit être écrit quand la vérification échoue.
    expect(await prisma.run.count()).toBe(0)
    await app.close()
  })
})
