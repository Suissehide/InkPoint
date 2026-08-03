import * as bitecs from 'bitecs'
import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Pickup, Position } from '../components'
import { INPUT_FIELDS, QUANTUM } from '../input'
import { grantInvulnerability } from '../invulnerability'
import { createRng } from '../rng'
import { spawnPlayer } from '../spawn'
import { stepWorld } from '../step'
import { absorbEvents, createRunProgress } from '../upgrades/progress'
import { createRunStats } from '../upgrades/stats'
import { SIM_VERSION } from '../version.generated'
import { ARENA, ARENA_MOBILE, type Arena, type ArenaId, createWorld, type SimWorld } from '../world'
import type { Replay } from './format'
import { replayRun } from './run'

const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

/** Quantifie comme `app/mouse.ts`, pour que la run enregistrée soit rejouable. */
const quantize = (v: number): number => Math.round(v / QUANTUM) * QUANTUM

const pickupsQuery = defineQuery([Pickup, Position])

/**
 * Dirige le joueur vers la pastille visible la plus proche — un joueur immobile,
 * lui, ne peut jamais en ramasser une hors de son propre pas d'apparition (voir
 * plus bas). Ce n'est pas fabriquer la collision recherchée : rien ici ne force
 * `waveEnded` ni ne pose `powerupPicked` à la main, seule `world.input` est
 * pilotée, exactement comme le ferait un joueur qui va aux pastilles — c'est
 * même le comportement le plus naturel qui soit pour ce mécanisme. Que ce
 * ramassage tombe pile sur le pas où la vague se termine reste entièrement
 * confié à la graine.
 */
function steerTowardNearestPickup(world: SimWorld): void {
  const px = Position.x[world.playerEid] ?? 0
  const py = Position.y[world.playerEid] ?? 0
  let bestDistSq = Number.POSITIVE_INFINITY
  let targetX = px
  let targetY = py
  for (const eid of pickupsQuery(world)) {
    const dx = Position.x[eid]! - px
    const dy = Position.y[eid]! - py
    const distSq = dx * dx + dy * dy
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      targetX = Position.x[eid]!
      targetY = Position.y[eid]!
    }
  }
  if (bestDistSq === Number.POSITIVE_INFINITY) {
    world.input.moveX = 0
    world.input.moveY = 0
    return
  }
  const dx = targetX - px
  const dy = targetY - py
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  world.input.moveX = dx / len
  world.input.moveY = dy / len
}

/**
 * Joue une run scriptée en enregistrant ses entrées, et rend le replay obtenu
 * plus le résultat direct. Aucune carte : le tirage demande une interaction, et
 * il est couvert par ses propres tests (`sim/upgrades/offer.test.ts`).
 *
 * `arena`/`arenaId` par défaut sur `ARENA`/0 : c'est ce que tous les appels
 * antérieurs à l'arène mobile attendent. Le test mobile plus bas passe
 * `ARENA_MOBILE`/1 explicitement.
 */
function recordScriptedRun(
  seed: number,
  steps: number,
  arena: Arena = ARENA,
  arenaId: ArenaId = 0,
) {
  resetGlobals()
  const world = createWorld({
    seed,
    width: arena.width,
    height: arena.height,
    rangeScale: arena.rangeScale,
  })
  spawnPlayer(world)
  const stats = createRunStats()
  const progress = createRunProgress()
  const inputRng = createRng(seed * 7919 + 13)
  const inputs = new Int16Array(steps * INPUT_FIELDS.length)

  for (let i = 0; i < steps; i++) {
    if (i % 20 === 0) {
      world.input.moveX = quantize(inputRng.range(-1, 1))
      world.input.moveY = quantize(inputRng.range(-1, 1))
    }
    // Pas de `grantInvulnerability` ici : c'est un appel direct sur `world`, hors de
    // tout ce que `seed` + `inputs` + `choices` peut encoder — `replayRun` ne
    // l'importe même pas. L'inclure ici a d'abord semblé anodin, jusqu'à ce que le
    // premier test échoue avec un score de 30 contre 150 : sans lui, le joueur
    // meurt au pas 367 dans les deux boucles ; avec lui seulement dans celle-ci,
    // il ne meurt jamais. Diagnostiqué pas à pas (deux boucles instrumentées,
    // seed 1234) avant de le retirer d'ici — il reste légitime dans le test de
    // collision plus bas, qui ne compare jamais à un rejeu. Règle retenue pour
    // tout ce chantier : une boucle d'enregistrement ne peut faire que ce qu'un
    // replay peut reproduire.
    for (let f = 0; f < INPUT_FIELDS.length; f++) {
      inputs[i * INPUT_FIELDS.length + f] = Math.round(world.input[INPUT_FIELDS[f]!] / QUANTUM)
    }
    stepWorld(world, stats)
    absorbEvents(progress, world)
  }

  const replay: Replay = { simVersion: SIM_VERSION, seed, arenaId, inputs, choices: [] }
  return { replay, direct: { score: world.score, wave: world.wave, alive: world.alive } }
}

describe('rejeu', () => {
  it('reproduit exactement le résultat de la run directe', () => {
    // Graine et longueur choisies pour que la comparaison ne soit pas vide :
    // à 400 pas, le joueur (sans la grâce ci-dessus) est déjà mort au pas 367
    // avec un score non nul. Un score à 0 ou un `alive` vrai signaleraient un
    // rejeu qui n'a pas vraiment tourné, pas seulement une run où tout reste à
    // sa valeur par défaut — vague toujours 1, `alive` toujours faux, qu'un
    // `ReplayResult` tout à zéro validerait par accident.
    const { replay, direct } = recordScriptedRun(1234, 400)
    expect(direct.alive).toBe(false)
    expect(direct.score).toBeGreaterThan(0)

    const result = replayRun(replay)
    // Au bit près, et non à une tolérance près : c'est l'objet de tout le
    // chantier précédent.
    expect(result.score).toBe(direct.score)
    expect(result.wave).toBe(direct.wave)
    expect(result.alive).toBe(direct.alive)
    expect(result.steps).toBe(400)
  })

  it(
    'rejoue une run enregistrée sur ARENA_MOBILE à l’identique — le défaut ' +
      'exact que ce chantier corrige (`replayRun` rejouait sur `ARENA` sans regarder l’arène enregistrée)',
    () => {
      // Même graine et même longueur que le test ARENA ci-dessus, mais sur
      // l'arène mobile : `spawnPlayer` place le joueur au centre de
      // `world.arena` (896×504, et non 1280×720), donc toute la trajectoire —
      // et l'instant de la mort — diffère dès le premier pas si `replayRun`
      // se trompe d'arène. Vérifié en sens inverse : forcer `ARENA` dans
      // `replayRun` fait rougir cette assertion (voir le rapport de ce chantier).
      const { replay, direct } = recordScriptedRun(1234, 400, ARENA_MOBILE, 1)
      expect(direct.alive).toBe(false)
      expect(direct.score).toBeGreaterThan(0)

      const result = replayRun(replay)
      expect(result.score).toBe(direct.score)
      expect(result.wave).toBe(direct.wave)
      expect(result.alive).toBe(direct.alive)
      expect(result.steps).toBe(400)
    },
  )

  it('refuse un id d’arène inconnu de ARENA_BY_ID', () => {
    const { replay } = recordScriptedRun(7, 60)
    expect(() => replayRun({ ...replay, arenaId: 2 as unknown as ArenaId })).toThrow(
      /id d'arène 2 inconnu/,
    )
  })

  it('refuse un replay d’une autre version de simulation', () => {
    const { replay } = recordScriptedRun(7, 60)
    expect(() => replayRun({ ...replay, simVersion: '0000000000000000' })).toThrow(/version/i)
  })

  it('refuse un nombre d’entrées qui ne tombe pas rond sur INPUT_FIELDS.length', () => {
    // `decodeReplay` ne peut pas produire ce cas (voir `format.test.ts`), mais
    // `replayRun` est le point d'entrée exposé au serveur : un `Replay`
    // reconstruit à la main depuis du JSON y arrive directement. Sans ce
    // garde-fou, `steps` fractionnaire lit `replay.inputs` au-delà de sa fin et
    // écrit un `NaN` silencieux dans `world.input` plutôt que de lever.
    const replay: Replay = {
      simVersion: SIM_VERSION,
      seed: 1,
      arenaId: 0,
      inputs: new Int16Array(INPUT_FIELDS.length + 1),
      choices: [],
    }
    expect(() => replayRun(replay)).toThrow(/entier/i)
  })

  it('refuse un choix enregistré si aucune fin de vague n’est rencontrée', () => {
    // Construit à la main, sans passer par une vraie partie : `WAVE_DURATION_MS`
    // vaut 40 000 ms (2400 pas), donc 10 pas n'atteignent jamais de `waveEnded` —
    // pas besoin d'y survivre pour éprouver ce refus (le contrôle de compte en
    // fin de fonction).
    const replay: Replay = {
      simVersion: SIM_VERSION,
      seed: 1,
      arenaId: 0,
      inputs: new Int16Array(10 * INPUT_FIELDS.length),
      choices: [{ step: 3, index: 0 }],
    }
    expect(() => replayRun(replay)).toThrow(/1 choix enregistrés, 0 fins? de vague/i)
  })

  it('le pas de bascule qu’exploite le garde-fou d’ordre existe réellement, à la graine 210', () => {
    // Ne prouve rien sur `replayRun` : ce test n'appelle ni `replayRun` ni la
    // moindre ligne de `run.ts` — il ne fait que constater, sur la simulation
    // réelle, qu'un `powerupPicked` et un `waveEnded` peuvent tomber sur le
    // même pas. C'est le scénario dont dépend le garde-fou d'ordre, pas le
    // garde-fou lui-même : la preuve que `replayRun` traite ce pas dans le bon
    // ordre (`absorbEvents` avant de tirer l'offre de `waveEnded`, comme
    // `game.ts` le fait avec `handleSimEvents`) vit dans `run.mocked.test.ts`,
    // sur un pas contrôlé plutôt que sur une vraie survie jusque-là — mesuré,
    // aucune politique d'entrées scriptée ne tient assez longtemps pour
    // atteindre une vraie fin de vague (voir ce fichier).
    //
    // Un joueur immobile ne peut ramasser une pastille qu'au pas même de son
    // apparition — la sienne et celle du joueur sont fixes toutes les deux, donc
    // rien ne les rapproche à un autre instant. Or l'horaire d'apparition des
    // pastilles (`pickupInterval`) est purement fonction du temps, sans tirage :
    // il tombe aux mêmes pas quelle que soit la graine, et aucun de ces pas ne
    // coïncide avec la fin de la vague 1 (fixe elle aussi, à ~40 s / 2400 pas
    // en l'absence de tout ralentissement) — vérifié en instrumentant l'horaire
    // seul : 2150 puis 2423, jamais 2399/2400. Sans mouvement la collision est
    // donc impossible pour **toute** graine, ce que 5000 graines ont confirmé
    // avant qu'on ne le comprenne. `steerTowardNearestPickup` vise
    // systématiquement la pastille la plus proche, comme le ferait tout joueur
    // sensé ; la graine 210 a été trouvée ainsi (recherche ≤ 400 graines) et est
    // pinglée ici plutôt que recherchée à nouveau à chaque exécution — la
    // recherche coûtait 6,4 s en Node et autant en Chromium sans rien éprouver
    // de `run.ts`.
    //
    // Le **pas**, lui, suit les réglages de simulation : tout chiffre qui
    // déplace le flux le décale, et le test échoue alors sur une graine encore
    // bonne. C'est arrivé en élargissant la traînée de la Bavure (2508 → 2504),
    // la graine 210 restant la seule des 400. Refaire la recherche plutôt que
    // de conclure à une régression : rejouer cette boucle en balayant les pas
    // au lieu d'en tester un seul rend le couple (graine, pas) à repingler.
    resetGlobals()
    const world = createWorld({ seed: 210, width: ARENA.width, height: ARENA.height })
    spawnPlayer(world)
    const stats = createRunStats()
    let sawCollision = false
    for (let i = 0; i <= 2504; i++) {
      steerTowardNearestPickup(world)
      grantInvulnerability(world, world.playerEid, 1200)
      stepWorld(world, stats)
      if (i === 2504) {
        const kinds = new Set(world.events.map((e) => e.type))
        sawCollision = kinds.has('powerupPicked') && kinds.has('waveEnded')
      }
    }
    expect(sawCollision).toBe(true)
  })
})
