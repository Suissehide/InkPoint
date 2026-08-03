import * as bitecs from 'bitecs'
import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Enemy, Position } from '../components'
import { grantInvulnerability } from '../invulnerability'
import { createRng } from '../rng'
import { spawnPlayer } from '../spawn'
import { stepWorld } from '../step'
import { createRunStats } from '../upgrades/stats'
import { ARENA, createWorld } from '../world'

/**
 * `game.ts` (`front/src/app/game.ts`) n'appelle jamais `resetGlobals` : ni au
 * premier `startRun()`, ni à aucun des suivants (relance, retour au menu).
 * `replayRun` (`./run.ts`), lui, l'appelle systématiquement en entrée. La
 * docstring de `resetGlobals` dans `./run.ts` affirme, mesuré, que ce décalage
 * du compteur d'`eid` bitECS ne change rien — mais **toute** la suite de tests
 * part de `resetGlobals()`, donc rien jusqu'ici n'exerçait la situation où le
 * jeu se trouve réellement : un second monde du même process, jamais remis à
 * zéro entre les deux. Le jour où quelqu'un départage une égalité de collision
 * par `eid`, la deuxième partie de chaque joueur cesse de se rejouer.
 *
 * **L'observable est l'état du monde, pas le score, et c'est le point du
 * test.** Une première version comparait `world.score` : mesuré, une run
 * scriptée de 1 800 pas fait *zéro* kill, et son score vaut exactement
 * `time / 200` — une fonction du seul nombre de pas. Elle concordait donc par
 * construction, y compris avec une dépendance à l'`eid` injectée exprès dans
 * `integrationSystem` (`dt * (1 + eid * 1e-3)`, soit +50 % de vitesse pour
 * l'entité 500) : le test restait vert. Un test qu'on n'a jamais vu échouer
 * n'est pas un garde-fou.
 *
 * `fingerprint` de `determinism.test.ts` ne convient pas non plus : elle
 * préfixe chaque position de son `eid`, donc elle diffère entre les deux mondes
 * même quand la simulation est identique — c'est précisément ce dont on veut
 * être insensible. D'où l'empreinte locale ci-dessous, triée et **sans `eid`** :
 * invariante au réétiquetage, sensible à la moindre position qui bouge.
 *
 * `grantInvulnerability` est légitime ici, à la différence du harnais
 * d'enregistrement de `run.test.ts` : ce test n'encode aucun replay, il compare
 * deux runs directes. Sans elle le joueur meurt au pas 407 et les 1 393 pas
 * suivants comparent deux mondes morts — le défaut exact qu'avait la run de
 * référence de l'étape 1.
 */
const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

const enemies = defineQuery([Enemy])

const SEED = 4242
const STEPS = 1800

/**
 * Positions des ennemis, triées et **sans `eid`**. Les composants sont en f32,
 * donc `toString` est une conversion exacte : deux positions différant d'un
 * seul bit donnent deux chaînes différentes.
 */
function positionDigest(world: ReturnType<typeof createWorld>): string {
  return Array.from(enemies(world))
    .map((eid) => `${Position.x[eid]!}:${Position.y[eid]!}`)
    .sort()
    .join('|')
}

interface ScriptedRun {
  digest: string
  enemyCount: number
  alive: boolean
}

/** Rejoue un script d'entrées déterministe et rend l'état final du monde. */
function scriptedRun(seed: number): ScriptedRun {
  const world = createWorld({ seed, width: ARENA.width, height: ARENA.height })
  spawnPlayer(world)
  const stats = createRunStats()
  const inputRng = createRng(seed * 7919 + 13)

  for (let i = 0; i < STEPS; i++) {
    if (i % 20 === 0) {
      world.input.moveX = inputRng.range(-1, 1)
      world.input.moveY = inputRng.range(-1, 1)
    }
    // Renouvelée : on mesure l'invariance sur une run qui vit, pas la vitesse à
    // laquelle un script aveugle se fait tuer.
    grantInvulnerability(world, world.playerEid, 1200)
    stepWorld(world, stats)
  }

  return {
    digest: positionDigest(world),
    enemyCount: enemies(world).length,
    alive: world.alive,
  }
}

describe('invariance au décalage du compteur d’eid bitECS', () => {
  it(
    'une run scriptée rend le même état de monde en premier monde du process ' +
      'qu’en second monde après une run non apparentée sans remise à zéro',
    () => {
      resetGlobals()
      const asFirstWorld = scriptedRun(SEED)

      // Ce que `game.ts` fait réellement entre deux parties : la run non
      // apparentée consomme sa part d'`eid`, et AUCUN `resetGlobals` ne suit.
      resetGlobals()
      scriptedRun(SEED + 1)
      const asSecondWorld = scriptedRun(SEED)

      expect(asSecondWorld.digest).toBe(asFirstWorld.digest)

      // Garde-fous de la mesure : deux mondes vides, ou deux mondes morts,
      // concorderaient trivialement et ce test ne prouverait plus rien.
      expect(asFirstWorld.enemyCount).toBeGreaterThan(5)
      expect(asFirstWorld.alive).toBe(true)
    },
  )
})
