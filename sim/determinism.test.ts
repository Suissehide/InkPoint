import * as bitecs from 'bitecs'
import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Enemy, Position, Seeker } from './components'
import { grantInvulnerability } from './invulnerability'
import { activatePowerUp } from './powerups/activate'
import { createRng } from './rng'
import { spawnPlayer } from './spawn'
import { stepWorld } from './step'
import { createRunStats } from './upgrades/stats'
import { createWorld, type SimWorld } from './world'

const enemies = defineQuery([Enemy])
const seekers = defineQuery([Seeker])

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
  '268:4423303f:44132975|269:43f495c7:43e45142|272:42fe1e81:44012455|273:43096a00:43fef0cd|274:431911b0:4401a737|275:431ab18c:44079907|276:4303854f:440c4f18|277:42c16d98:440a0b92|278:42a16e02:44004f79|279:42d23436:43ebcd8c|280:431f1806:43e8643e|281:4349e672:43fdd6d9|282:434189da:440f7c22|284:43b3deb6:43a0c9cb|285:43b54bbc:44081adb|286:43b58ff5:4408fc74|291:441db812:44128187|295:431eee4b:43b4593a|296:442cffe9:432ceb6b|297:4410d733:432ab202|298:443fcdbe:4296a225|299:428d7170:439b1ebc|300:44448000:4378437f|301:41600000:4340372e|302:43e78d08:44128000|304:41600000:4400428b|305:4191d89d:41600000#40d40a7fffffff8d#40eb89fffffffeab#2#0#1#442d6dcf#440657da'

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
  seekersSeen: number
} {
  resetGlobals()
  const world = createWorld({ seed, width: 800, height: 600 })
  spawnPlayer(world)
  const stats = createRunStats()
  const inputRng = createRng(seed * 7919 + 13)
  let seekersSeen = 0

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
    // Une Volée toutes les quatre secondes. Sans elle, `seekerSystem` ne tourne
    // jamais et la run ne couvre ni le repli de `Facing.angle` ni `wrapAngle` —
    // les deux seuls changements de la migration qui ne soient pas de simples
    // derniers bits. Mesuré : trois plumes simultanées au plus.
    if (i % 240 === 0) {
      activatePowerUp(
        world,
        'volley',
        stats,
        Position.x[world.playerEid]!,
        Position.y[world.playerEid]!,
      )
    }
    stepWorld(world, stats)
    seekersSeen += seekers(world).length
  }

  return {
    digest: fingerprint(world),
    alive: world.alive,
    wave: world.wave,
    enemyCount: enemies(world).length,
    seekersSeen,
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

  it('fait voler des plumes, sans quoi le repli d’angle ne serait jamais éprouvé', () => {
    expect(runSimulation(1234, 3600).seekersSeen).toBeGreaterThan(0)
  })
})
