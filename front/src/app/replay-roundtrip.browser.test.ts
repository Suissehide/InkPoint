import type { InputState } from '@sim/input'
import { decodeReplay, encodeReplay } from '@sim/replay/format'
import { recordAndStep } from '@sim/replay/record-and-step'
import { replayRun } from '@sim/replay/run'
import { createRng, type Rng } from '@sim/rng'
import { spawnPlayer } from '@sim/spawn'
import { createRunProgress } from '@sim/upgrades/progress'
import { createRunStats } from '@sim/upgrades/stats'
import { ARENA, ARENA_MOBILE, type Arena, type ArenaId, createWorld } from '@sim/world'
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
 *
 * La boucle appelle `recordAndStep` (sim/replay/record-and-step.ts), pas
 * `quantizeInput`/`recorder.step`/`stepAndAbsorb` séparément : c'est le chemin
 * exact de `game.ts` depuis la tâche 7, qui a rendu cet ordre structurel après
 * que la tâche 5 (voir sa docstring dans `record-and-step.ts`) a montré
 * qu'aucune run scriptée n'atteint la fin de vague qui aurait pu le faire
 * rougir.
 */

/** Quantifie comme `sim/rng.ts` produit — ici volontairement PAS quantifié en
 * amont (contrairement à `sim/replay/run.test.ts`) : la valeur brute doit
 * atteindre la quantification interne à `recordAndStep` pour que la
 * falsification « retirer `quantizeInput` de `recordAndStep` » (voir
 * `record-and-step.ts`) ait un effet à observer. */
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

/**
 * Le corps de la chaîne, factorisé pour être rejoué sur deux arènes distinctes
 * (tâche du lot final : `ARENA_MOBILE`, `rangeScale: 0.7`, en plus de `ARENA`,
 * `rangeScale: 1`, qui à elle seule ne peut jamais faire rougir un
 * `createRunStats()` appelé sans argument — 1 est déjà sa valeur par défaut).
 * La seule différence avec le côté navigateur (`game.ts#createRun`) : ce
 * fichier appelle `createRunStats(arena.rangeScale)` explicitement, plutôt que
 * de lire `world.arena.rangeScale` après coup — les deux valent la même chose,
 * `createWorld` recopiant `rangeScale` tel quel dans `world.arena` (voir
 * `sim/world.ts`), donc l'un ou l'autre convient ; celui-ci colle de plus près
 * à ce que `replayRun` doit reconstruire depuis `arena.rangeScale` seul, sans
 * `world` construit au préalable.
 */
async function runRoundTrip(
  seed: number,
  arena: Arena,
  arenaId: ArenaId,
): Promise<{ direct: number; verified: number }> {
  resetGlobals()
  const world = createWorld({
    seed,
    width: arena.width,
    height: arena.height,
    rangeScale: arena.rangeScale,
  })
  spawnPlayer(world)
  const stats = createRunStats(arena.rangeScale)
  const progress = createRunProgress()
  const recorder = createReplayRecorder(seed, arenaId)
  const inputRng = createRng(seed * 7919 + 13)

  let stepsPlayed = 0
  for (let i = 0; i < MAX_STEPS && world.alive; i++) {
    // Le chemin exact de `game.ts` : écrire l'entrée, puis `recordAndStep`
    // (quantifier, enregistrer, avancer, dans cet ordre). Un autre ordre
    // enregistrerait autre chose que ce qui est simulé — voir la
    // falsification documentée dans `record-and-step.ts` (tâche 5).
    writeScriptedInput(world.input, i, inputRng)
    recordAndStep(recorder, world, stats, progress)
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
  expect(verified.wave).toBe(world.wave)
  expect(verified.steps).toBe(stepsPlayed)
  expect(verified.alive).toBe(false)

  return { direct: world.score, verified: verified.score }
}

describe('le replay du navigateur rend le score que le serveur recalculera', () => {
  it('score, vague et pas identiques après enregistrement, gzip navigateur et rejeu serveur', async () => {
    // Choisie par recherche (≤ 300 graines) pour que la quantification
    // change réellement la trajectoire : à la graine 1234 (`sim/replay/run.test.ts`),
    // la run directe rend le même score avec et sans `quantizeInput` — la
    // seconde falsification (retirer `quantizeInput` de la boucle) resterait
    // verte pour une raison qui n'a rien à voir avec le code sous test.
    const { direct, verified } = await runRoundTrip(42, ARENA, 0)
    expect(verified).toBe(direct)
    // Et le nombre que le joueur lit sur son écran de fin.
    expect(Math.round(verified)).toBe(Math.round(direct))
  })

  /**
   * `ARENA_MOBILE` (`rangeScale: 0.7`) — le cas que le test ci-dessus ne peut
   * pas couvrir : lui seul fait diverger `createRunStats()` (côté serveur,
   * défaut 1) de `createRunStats(world.arena.rangeScale)` (côté jeu,
   * `game.ts#createRun`). Avant correctif, `replayRun` rejoue avec des rayons
   * de bonus (`blastRadius`, `freezeRadius`, `blotterRadius`) 1/0,7 ≈ 1,43×
   * trop grands, donc un joueur mobile ramasse plus d'ennemis par power-up que
   * ce qu'il a réellement vu — un score serveur plus HAUT que le score
   * affiché, jamais plus bas, cohérent avec des zones d'effet plus larges.
   * Graine choisie par recherche (≤ 400 graines, même méthode que la graine
   * 42 ci-dessus) pour qu'un écart survive à l'arrondi de `Math.round` (spec
   * §8) : beaucoup de graines divergent en interne sans que la différence ne
   * franchisse l'unité affichée au joueur. Mesuré avant correctif : score
   * direct (jeu, `rangeScale` 0,7) 125,83 → affiché "126" ; score serveur
   * (bug, `rangeScale` 1 par défaut) 205,50 → stocké "206".
   */
  it('arène mobile : mêmes score, vague et pas après enregistrement, gzip navigateur et rejeu serveur', async () => {
    const { direct, verified } = await runRoundTrip(183, ARENA_MOBILE, 1)
    expect(verified).toBe(direct)
    expect(Math.round(verified)).toBe(Math.round(direct))
  })
})
