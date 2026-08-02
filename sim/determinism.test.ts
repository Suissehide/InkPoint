import * as bitecs from 'bitecs'
import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Enemy, Position } from './components'
import { grantInvulnerability } from './invulnerability'
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
const REFERENCE_DIGEST =
  '171:441f1d7c:4412c0af|172:441d91c8:441272fe|173:441da578:44126e98|174:441dab66:44126dee|178:441d9e73:44129d97|180:441d8fa8:4412719d|184:441c516a:4413f228|191:441eb19a:4412c4d2|192:441f897d:44128cfd|193:441ba297:4413da38|194:4420b94c:44111469|195:441e2b06:44114c25|196:441aea83:4412cb97|198:44221776:4414052c|199:441b3895:4413f6ef|200:441b2c45:4413f6f3|201:44191281:440e6da0|202:43bb4511:43ebfcc1|203:441b434a:44140d8e|204:441b43ee:44140d8c|206:43988156:440616d9|207:4398b91f:4407231e|208:432fa74b:437fdb2d|209:443c9ed9:436735b1|210:43ef7c71:4412daf8|212:4409f168:41bf4394|213:4442c99d:43de97e9|214:41600000:438d33a6#40e7634aaaaaab88#40ed2255555553bf#2#0#1#442c10d6#440657da'

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
function runSimulation(
  seed: number,
  steps: number,
): {
  digest: string
  alive: boolean
  wave: number
  enemyCount: number
} {
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
    // La run de référence doit survivre à ses 60 secondes. Le joueur, piloté au
    // hasard, meurt sinon au bout de cinq secondes et l'empreinte ne
    // caractériserait qu'un monde à l'arrêt. La grâce est renouvelée plutôt
    // qu'accordée une fois : `grantInvulnerability` ne raccourcit jamais une
    // grâce en cours, donc ce renouvellement est sans effet de bord.
    if (i % 60 === 0) {
      grantInvulnerability(world, world.playerEid, 1200)
    }
    stepWorld(world, stats)
  }

  return {
    digest: fingerprint(world),
    alive: world.alive,
    wave: world.wave,
    enemyCount: enemies(world).length,
  }
}

describe('déterminisme de la simulation', () => {
  it('deux runs de même graine produisent le même état après 60 s', () => {
    expect(runSimulation(1234, 3600).digest).toBe(runSimulation(1234, 3600).digest)
  })

  it('des graines différentes produisent des états différents', () => {
    expect(runSimulation(1, 1800).digest).not.toBe(runSimulation(2, 1800).digest)
  })

  it('reste déterministe sur une run longue, au-delà de plusieurs vagues', () => {
    expect(runSimulation(99, 9000).digest).toBe(runSimulation(99, 9000).digest)
  })

  it('produit une empreinte identique à la référence figée', () => {
    expect(runSimulation(1234, 3600).digest).toBe(REFERENCE_DIGEST)
  })

  it('reste vivante et atteint la deuxième vague, sans quoi elle ne couvrirait rien', () => {
    const run = runSimulation(1234, 3600)
    expect(run.alive).toBe(true)
    expect(run.wave).toBeGreaterThanOrEqual(2)
    expect(run.enemyCount).toBeGreaterThan(20)
  })
})
