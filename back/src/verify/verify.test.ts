import { gunzipSync, gzipSync } from 'node:zlib'
import { INPUT_FIELDS } from '@sim/input'
import { decodeReplay, encodeReplay, type Replay } from '@sim/replay/format'
import { replayRun } from '@sim/replay/run'
import { SIM_VERSION } from '@sim/version.generated'
import { describe, expect, it, vi } from 'vitest'

import { recordDeadRun } from '../test/fixture-run'
import { Refusal } from './refusal'
import { MAX_STEPS, verifyReplay } from './verify'

// `replayRun` reste réel par défaut (`vi.fn(actual.replayRun)` l'utilise comme
// implémentation de repli) : seul le test de la panne ci-dessous le
// remplace, une fois, pour injecter une erreur qui n'est pas un
// `ReplayRejected` — tous les autres tests continuent de rejouer pour de bon.
vi.mock('@sim/replay/run', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sim/replay/run')>()
  return { ...actual, replayRun: vi.fn(actual.replayRun) }
})

/** Un replay minimal et valide : zéro pas, zéro choix, arène de bureau. */
function emptyReplay(overrides: Partial<Replay> = {}): Replay {
  return {
    simVersion: SIM_VERSION,
    seed: 42,
    arenaId: 0,
    inputs: new Int16Array(0),
    choices: [],
    ...overrides,
  }
}

function toBase64(replay: Replay): string {
  return Buffer.from(gzipSync(encodeReplay(replay))).toString('base64')
}

describe('verifyReplay', () => {
  it('refuse un replay enregistré sous une autre version de simulation', () => {
    const payload = toBase64(emptyReplay({ simVersion: '0000000000000000' }))
    expect(() => verifyReplay(payload)).toThrow(expect.objectContaining({ reason: 'stale_build' }))
  })

  it('refuse des octets qui ne sont pas un replay', () => {
    const payload = Buffer.from(gzipSync(Buffer.alloc(64))).toString('base64')
    expect(() => verifyReplay(payload)).toThrow(expect.objectContaining({ reason: 'malformed' }))
  })

  it('refuse du base64 invalide', () => {
    expect(() => verifyReplay('pas du base64 !!')).toThrow(
      expect.objectContaining({ reason: 'malformed' }),
    )
  })

  it('refuse une partie qui ne se termine pas par une mort', () => {
    // Zéro pas : le joueur est vivant à la fin, donc la partie n'est pas finie.
    expect(() => verifyReplay(toBase64(emptyReplay()))).toThrow(
      expect.objectContaining({ reason: 'not_dead' }),
    )
  })

  it('refuse un replay au-delà du plafond de pas', () => {
    // 72 001 pas × `INPUT_FIELDS.length` entrées : un de trop, sans avoir à
    // simuler quoi que ce soit puisque le contrôle lit l'en-tête.
    const tooLong = emptyReplay({
      inputs: new Int16Array((MAX_STEPS + 1) * INPUT_FIELDS.length),
    })
    expect(() => verifyReplay(toBase64(tooLong))).toThrow(
      expect.objectContaining({ reason: 'too_long' }),
    )
  })

  it('refuse une charge qui se détend au-delà de la borne', () => {
    // 200 000 pas de zéros : un `Replay` *valide* une fois décompressé, pas un
    // buffer inerte — condition nécessaire pour que ce test distingue vraiment
    // la borne de décompression du contrôle de format. Un simple buffer de
    // zéros se serait fait rejeter par `decodeReplay` (magie absente) même
    // sans la borne, et le test serait resté vert pour la mauvaise raison :
    // vérifié en le lançant, voir le rapport. Ici, si la borne saute, ces
    // octets se décompressent avec succès et franchissent le contrôle de
    // format — c'est `too_long` qui les arrêterait alors, pas `malformed`,
    // ce qui fait bien rougir ce test précis quand la borne disparaît.
    const oversized = emptyReplay({
      inputs: new Int16Array(200_000 * INPUT_FIELDS.length),
    })
    const compressed = gzipSync(encodeReplay(oversized))
    // Très redondant (zéros répétés) : le profil exact de l'attaque par
    // amplification que `maxOutputLength` existe pour arrêter.
    expect(compressed.length).toBeLessThan(64 * 1024)
    expect(() => verifyReplay(Buffer.from(compressed).toString('base64'))).toThrow(
      expect.objectContaining({ reason: 'malformed' }),
    )
  })

  it('laisse échapper une panne de replayRun qui n’est pas un ReplayRejected', () => {
    // Injecte une erreur de panne (un `TypeError` sans rapport, comme le
    // ferait un bug dans `offerUpgrades` ou une assertion bitECS) plutôt
    // qu'un refus diagnostiqué. `verify.ts` ne doit reclasser que
    // `ReplayRejected` en `Refusal` : tout le reste doit remonter tel quel,
    // pour rester un 500 côté routes plutôt qu'un 422 qui ferait porter à un
    // joueur la faute d'une panne du serveur.
    vi.mocked(replayRun).mockImplementationOnce(() => {
      throw new TypeError('bug simulation interne, sans rapport avec le replay soumis')
    })

    let thrown: unknown
    try {
      verifyReplay(toBase64(emptyReplay()))
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(TypeError)
    expect(thrown).not.toBeInstanceOf(Refusal)
  })

  it('ancre chaque champ de VerifiedRun sur un rejeu direct du même replay', () => {
    // Ferme le trou de couverture constaté par la relecture (tâche 1) : muter
    // le `return` de `verifyReplay` — `score: 0`, `wave: 0`, `steps: 999`,
    // `seed: 0`, `arenaId: 1`, `bytes: Buffer.alloc(1)` — laissait les 21
    // tests d'alors entièrement verts, faute d'un test qui compare ce que le
    // serveur écrit à ce qu'il vient réellement de calculer.
    const replay = recordDeadRun(1234, 0)
    const direct = replayRun(replay, { maxSteps: MAX_STEPS })
    const v = verifyReplay(toBase64(replay))

    expect(v.score).toBe(direct.score)
    expect(v.wave).toBe(direct.wave)
    expect(v.steps).toBe(direct.steps)
    expect(v.seed).toBe(replay.seed)
    expect(v.arenaId).toBe(replay.arenaId)

    // Les octets stockés doivent faire l'aller-retour jusqu'au replay soumis :
    // décompressés puis redécodés, ils rendent exactement le même `Replay`.
    const roundTripped = decodeReplay(new Uint8Array(gunzipSync(v.bytes)))
    expect(roundTripped).toEqual(replay)
  })
})
