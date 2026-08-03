import * as bitecs from 'bitecs'
import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Enemy, Position, Seeker } from './components'
import type { PowerUpKind } from './data/powerups'
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
 * Rotation plutôt que tirage : le tirage pondéré de `pickup.ts` ne visitait pas
 * `'splatter'`, laissant `ricochet.ts` et son `atan2` de réflexion hors de toute
 * preuve, et ne touchait `'dash'` que par chance. Une rotation garantit que
 * chaque chemin d'activation est emprunté, donc couvert par le rejeu
 * inter-moteurs. `'blotter'` est exclu (désactivé) et `'halo'` aussi (aucune
 * géométrie d'angle).
 */
const ROTATED_POWERUPS: PowerUpKind[] = ['volley', 'splatter', 'dash', 'blast', 'freeze', 'bramble']

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
  '1030:42e05441:440631b7|1031:4383c4c6:4412f13a|1038:441791d3:43504def|1039:441ba4fb:434b0d06|1040:44201ce5:435c64f6|1041:441e85a3:437ce429|1042:44150ddc:4386edb7|1043:440a305a:437532bb|1044:44085182:433b305f|1045:44143dad:430c1232|1046:4426f837:43165046|1052:42f59f9c:44051ac1|1053:4385b702:4411d587|1054:42ea0436:440763d6|29:423667e9:4334013f|42:43a9633f:43d7a39f|44:43d42300:44128000|45:4406f79f:41600000|46:418c3d16:41600000|891:43af5d4c:43d18560|936:43456ade:43f9425a|938:42ba58f3:43c1b29b|992:430d70b8:4405b417|993:42fe619a:440ad428#40e4133fffffffcb#40eac1fffffffecb#2#79#1#43558571#440a7148'

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
  forced: Partial<Record<PowerUpKind, number>>
} {
  resetGlobals()
  const world = createWorld({ seed, width: 800, height: 600 })
  spawnPlayer(world)
  const stats = createRunStats()
  const inputRng = createRng(seed * 7919 + 13)
  let seekersSeen = 0
  const forced: Partial<Record<PowerUpKind, number>> = {}

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
    if (i % 120 === 0) {
      const kind = ROTATED_POWERUPS[(i / 120) % ROTATED_POWERUPS.length]!
      activatePowerUp(
        world,
        kind,
        stats,
        Position.x[world.playerEid]!,
        Position.y[world.playerEid]!,
      )
      forced[kind] = (forced[kind] ?? 0) + 1
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
    forced,
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

  it('emprunte tous les chemins de power-up, sans quoi la preuve serait trouée', () => {
    const run = runSimulation(1234, 3600)
    for (const kind of ROTATED_POWERUPS) {
      expect(run.forced[kind] ?? 0, `power-up ${kind}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('fait voler assez de plumes pour que le repli d’angle soit éprouvé', () => {
    // Seuil à 500, et non à 0 : un `> 0` reste vert même si la rotation est
    // retirée, parce que le tirage naturel produit une soixantaine de plumes par
    // accident. Un garde-fou qui survit au retrait de ce qu'il garde ne garde
    // rien. Mesuré avec la rotation : 1256.
    expect(runSimulation(1234, 3600).seekersSeen).toBeGreaterThan(500)
  })
})
