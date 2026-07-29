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

/** Empreinte de l'état complet : positions arrondies, score, vague, compte d'entités. */
function fingerprint(world: SimWorld): string {
  const parts = Array.from(enemies(world))
    .map((eid) => `${eid}:${Position.x[eid]!.toFixed(3)}:${Position.y[eid]!.toFixed(3)}`)
    .sort()
  return [
    parts.join('|'),
    world.score.toFixed(4),
    world.wave,
    world.combo,
    world.alive ? '1' : '0',
    Position.x[world.playerEid]!.toFixed(3),
    Position.y[world.playerEid]!.toFixed(3),
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
    // Change de direction toutes les 20 images, et déclenche parfois un power-up.
    if (i % 20 === 0) {
      world.input.moveX = inputRng.range(-1, 1)
      world.input.moveY = inputRng.range(-1, 1)
    }
    const fire = i % 37 === 0
    world.input.slots = [fire, false, false]
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
})
