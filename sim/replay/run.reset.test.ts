import { addEntity, createWorld as createBitWorld } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { SIM_VERSION } from '../version.generated'
import type { Replay } from './format'
import { replayRun } from './run'

/**
 * Un replay sans le moindre pas : `spawnPlayer` est le seul appel à `addEntity`
 * que `replayRun` fait alors, inconditionnel et en tête de la fonction, avant
 * la boucle de pas (`steps` vaut 0, la boucle ne s'exécute jamais) — donc
 * exactement un `eid` consommé par rejeu, sans dépendre du hasard d'un ennemi
 * ou d'une pastille qui apparaîtrait au premier pas.
 */
function emptyReplay(seed: number): Replay {
  return { simVersion: SIM_VERSION, seed, arenaId: 0, inputs: new Int16Array(0), choices: [] }
}

/**
 * Consomme un `eid` témoin sur un monde bitECS jetable, sans jamais appeler
 * `resetGlobals` nous-mêmes : ce que ce nombre vaut d'un appel à l'autre est
 * l'effet observable que `replayRun` doit garantir en remettant son propre
 * compteur à zéro à chaque entrée — pas besoin de mock, ni d'accès au monde
 * interne de `replayRun`, pour l'éprouver.
 */
function witnessEid(): number {
  return addEntity(createBitWorld())
}

describe('remise à zéro de bitECS entre deux rejeux', () => {
  it('le compteur d’eid de bitECS repart du même point après chaque rejeu', () => {
    replayRun(emptyReplay(11), { maxSteps: 72_000 })
    const afterFirst = witnessEid()

    replayRun(emptyReplay(22), { maxSteps: 72_000 })
    const afterSecond = witnessEid()

    // Si `replayRun` ne remettait pas son compteur à zéro à chaque entrée, le
    // second rejeu hériterait de celui laissé par le premier (plus le témoin
    // ci-dessus) : `afterSecond` serait strictement supérieur à `afterFirst`,
    // jamais égal. Supprimer `resetGlobals()` dans `run.ts` fait rougir cette
    // assertion — vérifié manuellement, voir le rapport de correction.
    //
    // Aucun mock : ce test tourne dans les trois moteurs, contrairement au
    // test d'ordre `absorbEvents`/`waveEnded` de `run.mocked.test.ts`, dont la
    // nature structurelle (pas numérique) rend une couverture Node seule
    // suffisante — voir ce fichier.
    expect(afterSecond).toBe(afterFirst)
  })
})
