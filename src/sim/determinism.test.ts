import * as bitecs from 'bitecs'
import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Enemy, Position } from './components'
import { createRng } from './rng'
import { spawnPlayer } from './spawn'
import { stepWorld } from './step'
import { createRunStats } from './upgrades/stats'
import { createWorld, type SimWorld } from './world'

const enemies = defineQuery([Enemy])

/**
 * bitecs alloue les eid depuis un compteur GLOBAL AU MODULE (`globalEntityCursor`),
 * partagé par tous les mondes créés dans le même process — ce que ses propres
 * types ne déclarent pas, mais que son build JS exporte bel et bien. En jeu réel
 * il n'existe qu'un monde par session (le compteur démarre donc toujours à 0),
 * mais ce test en crée plusieurs dans le même process Vitest : sans remise à
 * zéro, la deuxième `runSimulation` hérite du compteur laissé par la première et
 * ses eid sont décalés d'autant — une contamination du harnais de test, pas une
 * divergence de la simulation. On force donc la remise à zéro avant chaque run
 * pour retrouver l'allocation d'eid qu'un client frais obtiendrait.
 */
const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

/**
 * Empreinte d'une run de référence. Ce n'est pas un test de comportement mais
 * un test de caractérisation : il n'affirme rien sur ce que la simulation
 * *devrait* produire, seulement qu'elle produit toujours la même chose. C'est
 * ce qui permet de prouver qu'un refactor n'a rien déplacé — et, une fois le
 * fichier rejoué dans un navigateur, que deux moteurs JavaScript s'accordent
 * au bit près.
 *
 * Elle ne change qu'avec une modification volontaire de la simulation.
 */
const EMPREINTE_REFERENCE =
  '1:4422c72d:44123ade|2:4422c72d:44123ade|4:4422c72d:44123ade|5:4422c72d:44123ade|6:4422c72d:44123ade|7:4422c72d:44123ade#403a155555555539#40ed4bfffffffe63#1#0#0#442f6ea9#440657da'

/**
 * Empreinte binaire exacte de l'état du monde. Les valeurs ne sont pas
 * arrondies : `toFixed(3)` absorberait justement les divergences d'un ULP que
 * ce test existe pour détecter, maintenant qu'il sert aussi à prouver la
 * portabilité entre moteurs JavaScript.
 */
const scratch = new DataView(new ArrayBuffer(8))

/** Les composants sont des `Types.f32` : leur valeur tient exactement sur 32 bits. */
function f32bits(v: number): string {
  scratch.setFloat32(0, v)
  return scratch.getUint32(0).toString(16).padStart(8, '0')
}

/** Les scalaires de `SimWorld` (score, time) sont des doubles. */
function f64bits(v: number): string {
  scratch.setFloat64(0, v)
  return scratch.getBigUint64(0).toString(16).padStart(16, '0')
}

function fingerprint(world: SimWorld): string {
  const parts = Array.from(enemies(world))
    .map((eid) => `${eid}:${f32bits(Position.x[eid]!)}:${f32bits(Position.y[eid]!)}`)
    .sort()
  return [
    parts.join('|'),
    f64bits(world.score),
    f64bits(world.time),
    world.wave,
    world.combo,
    world.alive ? '1' : '0',
    f32bits(Position.x[world.playerEid]!),
    f32bits(Position.y[world.playerEid]!),
  ].join('#')
}

/** Rejoue une run scriptée : les entrées sont générées par un PRNG à part. */
function runSimulation(seed: number, steps: number): string {
  resetGlobals()
  const world = createWorld({ seed, width: 800, height: 600 })
  spawnPlayer(world)
  const stats = createRunStats()
  const inputRng = createRng(seed * 7919 + 13)

  for (let i = 0; i < steps; i++) {
    // Change de direction toutes les 20 images.
    if (i % 20 === 0) {
      world.input.moveX = inputRng.range(-1, 1)
      world.input.moveY = inputRng.range(-1, 1)
    }
    stepWorld(world, stats)
  }

  return fingerprint(world)
}

describe('déterminisme de la simulation', () => {
  it('deux runs de même graine produisent le même état après 60 s', () => {
    expect(runSimulation(1234, 3600)).toBe(runSimulation(1234, 3600))
  })

  it('des graines différentes produisent des états différents', () => {
    expect(runSimulation(1, 1800)).not.toBe(runSimulation(2, 1800))
  })

  it('reste déterministe sur une run longue, au-delà de plusieurs vagues', () => {
    expect(runSimulation(99, 9000)).toBe(runSimulation(99, 9000))
  })

  it('produit une empreinte identique à la référence figée', () => {
    expect(runSimulation(1234, 3600)).toBe(EMPREINTE_REFERENCE)
  })
})
