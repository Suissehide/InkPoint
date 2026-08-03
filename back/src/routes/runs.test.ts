import { gzipSync } from 'node:zlib'
import { encodeReplay, type Replay } from '@sim/replay/format'
import { SIM_VERSION } from '@sim/version.generated'
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '../db/client'
import { buildServer } from '../server'
import { recordDeadRun } from '../test/fixture-run'

function payloadFor(replay: Replay, gzipLevel?: number): string {
  return Buffer.from(gzipSync(encodeReplay(replay), { level: gzipLevel })).toString('base64')
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

  it('deux soumissions identiques en course donnent 201 puis 422, jamais 500', async () => {
    // Un seul replay, envoyé deux fois **sans attendre la première réponse** :
    // c'est ce qui distingue cette course d'un simple doublon séquentiel, qui
    // ne prouverait que le chemin rapide (`findUnique` avant l'écriture) et
    // laisserait la vraie garantie — la capture de `P2002` sur `create` —
    // jamais exercée.
    const app = buildServer()
    await app.ready()
    const payload = { nickname: 'leo', replay: payloadFor(recordDeadRun(1234, 0)) }

    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/runs', payload }),
      app.inject({ method: 'POST', url: '/runs', payload }),
    ])

    const codes = [first.statusCode, second.statusCode].sort((a, b) => a - b)
    expect(codes).toEqual([201, 422])

    const refused = first.statusCode === 422 ? first : second
    expect(refused.json().reason).toBe('already_submitted')

    expect(await prisma.run.count()).toBe(1)
    await app.close()
  })

  it('accepte une partie jouée jusqu’à la mort et rend un rang', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: 'leo', replay: payloadFor(recordDeadRun(1234, 0)) },
    })
    expect(res.statusCode).toBe(201)
    // Valeur concrète, pas `expect.any(Number)` : un `verify.ts` qui rendrait
    // `score: 0` (ou toute autre valeur) passerait ce test tant que le champ
    // reste un nombre — c'est tout le constat de la tâche 1. `31` est la
    // valeur arrondie de ce replay précis, `seed: 1234, arenaId: 0`, fixée par
    // `verify.test.ts` (« ancre chaque champ de VerifiedRun »).
    expect(res.json()).toEqual({ score: 31, rank: 1, total: 1, improved: true })
    expect(await prisma.run.count()).toBe(1)
    await app.close()
  })

  it('refuse la même partie soumise deux fois', async () => {
    const app = buildServer()
    await app.ready()
    const payload = { nickname: 'leo', replay: payloadFor(recordDeadRun(1234, 0)) }
    await app.inject({ method: 'POST', url: '/runs', payload })
    const second = await app.inject({ method: 'POST', url: '/runs', payload })
    expect(second.statusCode).toBe(422)
    expect(second.json().reason).toBe('already_submitted')
    expect(await prisma.run.count()).toBe(1)
    await app.close()
  })

  it('refuse la même partie recompressée à un autre niveau de gzip (tâche 2)', async () => {
    // Reproduit le doublon constaté par la relecture : `level: 9` en premier,
    // 201 rang 1 ; `level: 1` ensuite, même partie, deux octets gzip
    // différents. Le hash portant maintenant sur le `.bin` décompressé
    // (tâche 2), la seconde soumission doit être refusée comme la même
    // partie, jamais acceptée comme une seconde ligne du classement.
    const app = buildServer()
    await app.ready()
    const replay = recordDeadRun(1234, 0)
    const first = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: 'leo', replay: payloadFor(replay, 9) },
    })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: 'leo', replay: payloadFor(replay, 1) },
    })
    expect(second.statusCode).toBe(422)
    expect(second.json().reason).toBe('already_submitted')
    expect(await prisma.run.count()).toBe(1)
    await app.close()
  })
})
