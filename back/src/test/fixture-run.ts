import { INPUT_FIELDS, QUANTUM } from '@sim/input'
import type { Replay } from '@sim/replay/format'
import { createRng } from '@sim/rng'
import { spawnPlayer } from '@sim/spawn'
import { stepWorld } from '@sim/step'
import { createRunStats } from '@sim/upgrades/stats'
import { SIM_VERSION } from '@sim/version.generated'
import { ARENA_BY_ID, createWorld } from '@sim/world'
import * as bitecs from 'bitecs'

const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

/**
 * Une run scriptée jouée jusqu'à la mort du joueur, et arrêtée là.
 *
 * Jouer jusqu'à la mort n'est pas un détail : le service refuse tout replay où
 * le joueur est encore vivant (`not_dead`), donc un fixture qui s'arrête à un
 * nombre de pas fixe serait refusé et le test d'acceptation ne testerait rien.
 * Aucun `grantInvulnerability` ici, pour la même raison qu'à l'étape 2 : une
 * boucle d'enregistrement ne peut faire que ce qu'un replay peut reproduire.
 */
export function recordDeadRun(seed: number, arenaId: 0 | 1): Replay {
  resetGlobals()
  const arena = ARENA_BY_ID[arenaId]
  const world = createWorld({
    seed,
    width: arena.width,
    height: arena.height,
    rangeScale: arena.rangeScale,
  })
  spawnPlayer(world)
  const stats = createRunStats()
  const inputRng = createRng(seed * 7919 + 13)
  const collected: number[] = []

  for (let i = 0; i < 72_000 && world.alive; i++) {
    if (i % 20 === 0) {
      world.input.moveX = Math.round(inputRng.range(-1, 1) / QUANTUM) * QUANTUM
      world.input.moveY = Math.round(inputRng.range(-1, 1) / QUANTUM) * QUANTUM
    }
    for (const field of INPUT_FIELDS) {
      collected.push(Math.round(world.input[field] / QUANTUM))
    }
    stepWorld(world, stats)
  }

  return {
    simVersion: SIM_VERSION,
    seed,
    arenaId,
    inputs: Int16Array.from(collected),
    choices: [],
  }
}
