import { gzipSync } from 'node:zlib'
import { INPUT_FIELDS, QUANTUM } from '@sim/input'
import { encodeReplay, type Replay } from '@sim/replay/format'
import { createRng } from '@sim/rng'
import { spawnPlayer } from '@sim/spawn'
import { stepWorld } from '@sim/step'
import { absorbEvents, createRunProgress } from '@sim/upgrades/progress'
import { createRunStats } from '@sim/upgrades/stats'
import { SIM_VERSION } from '@sim/version.generated'
import { ARENA, createWorld } from '@sim/world'
import * as bitecs from 'bitecs'
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '../db/client'
import { buildServer } from '../server'

const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

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

const quantize = (v: number): number => Math.round(v / QUANTUM) * QUANTUM

/**
 * Rejoue localement la même recette que `sim/replay/run.test.ts` (graine
 * 1234, 400 pas, sans `grantInvulnerability`) : un joueur qui erre au hasard
 * sur `ARENA` y meurt au pas 367, avec un score non nul — vérifié par ce
 * test-là. Utilisé ici seulement pour la falsification de la course de
 * soumission ci-dessous, qui a besoin d'un replay qui franchit vraiment
 * `verifyReplay` (201), pas d'un `not_dead`. Le fixture canonique et
 * partagé arrive à la tâche 6 ; celui-ci est local, jetable, et gardé au
 * minimum nécessaire.
 */
function deathReplay(seed: number): Replay {
  resetGlobals()
  const world = createWorld({
    seed,
    width: ARENA.width,
    height: ARENA.height,
    rangeScale: ARENA.rangeScale,
  })
  spawnPlayer(world)
  const stats = createRunStats()
  const progress = createRunProgress()
  const inputRng = createRng(seed * 7919 + 13)
  const steps = 400
  const inputs = new Int16Array(steps * INPUT_FIELDS.length)

  for (let i = 0; i < steps; i++) {
    if (i % 20 === 0) {
      world.input.moveX = quantize(inputRng.range(-1, 1))
      world.input.moveY = quantize(inputRng.range(-1, 1))
    }
    INPUT_FIELDS.forEach((field, f) => {
      inputs[i * INPUT_FIELDS.length + f] = Math.round(world.input[field] / QUANTUM)
    })
    stepWorld(world, stats)
    absorbEvents(progress, world)
  }

  return { simVersion: SIM_VERSION, seed, arenaId: 0, inputs, choices: [] }
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
    const payload = { nickname: 'leo', replay: payloadFor(deathReplay(1234)) }

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
})
