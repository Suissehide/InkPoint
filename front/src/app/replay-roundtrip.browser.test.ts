import { type InputState, quantizeInput } from '@sim/input'
import { decodeReplay, encodeReplay } from '@sim/replay/format'
import { replayRun } from '@sim/replay/run'
import { stepAndAbsorb } from '@sim/replay/step-with-progress'
import { createRng, type Rng } from '@sim/rng'
import { spawnPlayer } from '@sim/spawn'
import { createRunProgress } from '@sim/upgrades/progress'
import { createRunStats } from '@sim/upgrades/stats'
import { ARENA, createWorld } from '@sim/world'
import * as bitecs from 'bitecs'
import { describe, expect, it } from 'vitest'

import { createReplayRecorder } from './replay-recorder'

/**
 * Le test qui compte (spec §10). Le lot 1 ne pouvait pas l'écrire : ses
 * replays sortaient du même code que celui qui les rejoue (`replayRun`), donc
 * il prouvait que le rejeu est cohérent avec lui-même, jamais que le chemin
 * du navigateur — l'enregistreur du jeu, `quantizeInput`, `CompressionStream`
 * — produit ce que le serveur attend.
 *
 * Une seule chaîne, ici : `createReplayRecorder` (le vrai module de
 * `game.ts`) enregistre une run scriptée pendant qu'elle tourne, `encodeReplay`
 * la sérialise, `CompressionStream`/`DecompressionStream` (les API du
 * navigateur, pas `node:zlib`) la compressent puis la décompressent,
 * `decodeReplay` la relit, et `replayRun` — le code que le serveur exécute
 * réellement — la rejoue. Le score qui en sort doit être celui que la run
 * directe a produit.
 */

/** Quantifie comme `sim/rng.ts` produit — ici volontairement PAS quantifié en
 * amont (contrairement à `sim/replay/run.test.ts`) : la valeur brute doit
 * atteindre `quantizeInput` pour que la falsification « retirer
 * `quantizeInput` de la boucle » ait un effet à observer. */
function writeScriptedInput(input: InputState, step: number, rng: Rng): void {
  // Change de direction toutes les 20 pas plutôt qu'à chaque pas : un joueur
  // qui zigzague à chaque frame ne ressemble à aucune entrée réelle, et se
  // stabilise en général avant de heurter quoi que ce soit.
  if (step % 20 === 0) {
    input.moveX = rng.range(-1, 1)
    input.moveY = rng.range(-1, 1)
  }
}

/** `Uint8Array` → gzip, avec l'API du NAVIGATEUR — celle que `game.ts` emploie
 * (voir `replay-recorder.ts#downloadReplay` et `leaderboard-client.ts#toBase64`),
 * jamais `node:zlib`, qui ne prouverait rien sur ce que Chromium, Firefox et
 * WebKit produisent réellement. */
async function gzipInBrowser(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzipInBrowser(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

/** Plafond de sécurité, jamais atteint pour cette graine : le joueur meurt
 * largement avant (voir l'assertion `alive`/`steps` plus bas). */
const MAX_STEPS = 72_000

describe('le replay du navigateur rend le score que le serveur recalculera', () => {
  it('score, vague et pas identiques après enregistrement, gzip navigateur et rejeu serveur', async () => {
    resetGlobals()
    // Choisie par recherche (≤ 300 graines) pour que la quantification
    // change réellement la trajectoire : à la graine 1234 (`sim/replay/run.test.ts`),
    // la run directe rend le même score avec et sans `quantizeInput` — la
    // seconde falsification (retirer `quantizeInput` de la boucle) resterait
    // verte pour une raison qui n'a rien à voir avec le code sous test.
    const seed = 42
    const arenaId = 0
    const world = createWorld({
      seed,
      width: ARENA.width,
      height: ARENA.height,
      rangeScale: ARENA.rangeScale,
    })
    spawnPlayer(world)
    const stats = createRunStats()
    const progress = createRunProgress()
    const recorder = createReplayRecorder(seed, arenaId)
    const inputRng = createRng(seed * 7919 + 13)

    let stepsPlayed = 0
    for (let i = 0; i < MAX_STEPS && world.alive; i++) {
      // Le chemin exact de `game.ts` : écrire l'entrée, la quantifier, puis
      // enregistrer, puis avancer. Tout autre ordre enregistrerait autre
      // chose que ce qui est simulé — voir la falsification ci-dessous.
      writeScriptedInput(world.input, i, inputRng)
      quantizeInput(world.input)
      recorder.step(world.input)
      stepAndAbsorb(world, stats, progress)
      stepsPlayed = i + 1
    }

    // Un plafond jamais atteint prouverait un rejeu qui s'est arrêté sans
    // rien avoir simulé, pas une vraie run — le service refuse d'ailleurs un
    // replay dont le joueur est encore vivant.
    expect(world.alive).toBe(false)
    expect(stepsPlayed).toBeLessThan(MAX_STEPS)
    expect(world.score).toBeGreaterThan(0)

    const replay = recorder.build()

    // Aller-retour par les API du NAVIGATEUR, celles que le jeu emploiera.
    const gz = await gzipInBrowser(encodeReplay(replay))
    const back = decodeReplay(await gunzipInBrowser(gz))

    // Ce que le serveur calculerait sur ces octets-là.
    const verified = replayRun(back, { maxSteps: MAX_STEPS })
    expect(verified.score).toBe(world.score)
    expect(verified.wave).toBe(world.wave)
    expect(verified.steps).toBe(stepsPlayed)
    expect(verified.alive).toBe(false)
    // Et le nombre que le joueur lit sur son écran de fin.
    expect(Math.round(verified.score)).toBe(Math.round(world.score))
  })
})
