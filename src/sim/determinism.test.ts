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
const EMPREINTE_REFERENCE =
  '171:442241bd:44129bd8|174:44218a2e:4412a09b|176:4421e1a7:44127a5d|178:442183bf:4412a491|184:4420e508:4412b40c|188:44223bfb:4412b6dd|189:442220c7:4412b24a|190:4422acf4:44129ecf|194:441fe6e6:44124572|195:441ea94e:441297a1|196:441e8fc7:4413f6cd|198:4427fb40:441325ee|199:441f7efe:4413d6ec|200:441e98d8:44140daf|201:441ca297:440d9e69|202:43cfdeda:43f26eee|203:441ed564:4413da62|204:441ecc7c:4413daaf|206:43adf64b:4406d153|207:43ae3125:4407c20e|208:4353165c:438c31b4|209:443b44cf:438931f9|210:440a87ba:441306bd|212:440bb6ed:4283e26a|213:443a5f5d:43fe8abf|214:41600000:438d33a6|215:43adaf3f:43882d37|216:440feac1:43882d37|217:4401a5f8:43882d37|218:43adaf3f:43a4b6c8|219:43adaf3f:440b6e85|220:43adaf3f:43c14058|221:43e6c260:43882d37|222:441e2f89:43882d37|223:43ca38d0:43882d37|224:43adaf3f:43ddc9e9|225:43adaf3f:43fa5379|226:44448000:43c3ffe2|227:43c96dbb:41600000#40e7b380000000e4#40ed4bfffffffe63#2#0#1#442f6ea9#440657da'

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
  empreinte: string
  vivant: boolean
  vague: number
  ennemis: number
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
    empreinte: fingerprint(world),
    vivant: world.alive,
    vague: world.wave,
    ennemis: enemies(world).length,
  }
}

describe('déterminisme de la simulation', () => {
  it('deux runs de même graine produisent le même état après 60 s', () => {
    expect(runSimulation(1234, 3600).empreinte).toBe(runSimulation(1234, 3600).empreinte)
  })

  it('des graines différentes produisent des états différents', () => {
    expect(runSimulation(1, 1800).empreinte).not.toBe(runSimulation(2, 1800).empreinte)
  })

  it('reste déterministe sur une run longue, au-delà de plusieurs vagues', () => {
    expect(runSimulation(99, 9000).empreinte).toBe(runSimulation(99, 9000).empreinte)
  })

  it('produit une empreinte identique à la référence figée', () => {
    expect(runSimulation(1234, 3600).empreinte).toBe(EMPREINTE_REFERENCE)
  })

  it('reste vivante et atteint la deuxième vague, sans quoi elle ne couvrirait rien', () => {
    const run = runSimulation(1234, 3600)
    expect(run.vivant).toBe(true)
    expect(run.vague).toBeGreaterThanOrEqual(2)
    expect(run.ennemis).toBeGreaterThan(20)
  })
})
