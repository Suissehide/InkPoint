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
 * types ne déclarent pas, mais que son build JS exporte bel et bien.
 *
 * En jeu réel, ce compteur N'EST PAS borné à un monde par session : `game.ts`
 * (`startRun()`) crée un nouveau `SimWorld` sans jamais appeler
 * `resetGlobals` — à chaque relance (« Rejouer ») et à chaque retour au menu
 * après une partie. Le compteur continue donc de monter d'une partie à
 * l'autre dans un même onglet, exactement comme il le ferait ici sans la
 * remise à zéro ci-dessous. La mesure interne (voir la docstring de
 * `resetGlobals` dans `sim/replay/run.ts`) est que ce décalage des eid ne
 * change aucun score : seul `replayRun`, qui doit reproduire un score
 * EXACT depuis une graine et des entrées, a besoin de repartir du même point
 * à chaque rejeu — ce que ce commentaire disait par erreur être aussi le cas
 * du jeu. Ici, dans ce test, plusieurs `runSimulation` tournent dans le même
 * process Vitest : sans remise à zéro, la deuxième hérite du compteur laissé
 * par la première et ses eid sont décalés d'autant — une contamination du
 * harnais de test, pas une divergence de la simulation. On force donc la
 * remise à zéro avant chaque run pour retrouver l'allocation d'eid qu'un
 * premier monde du processus obtiendrait.
 */
const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

/**
 * Empreinte d'une run de référence. Ce n'est pas un test de comportement mais
 * un test de caractérisation : il n'affirme rien sur ce que la simulation
 * *devrait* produire, seulement qu'elle produit toujours la même chose. C'est
 * ce qui permet de prouver qu'un refactor n'a rien déplacé, et, rejoué dans
 * trois navigateurs par `vitest.browser.config.ts`, c'est aussi un bon test
 * de fumée de bout en bout : les mêmes entrées y produisent la même
 * empreinte partout.
 *
 * Ce que cette empreinte ne prouve **pas** : la portabilité bit-à-bit de
 * `sim/math.ts`. Mesuré en perturbant chacun de ses six résultats d'un ulp :
 * `REFERENCE_DIGEST` ne bouge pas. Le plancher de détection de l'empreinte
 * est entre 1e-12 et 1e-9 relatif — trois à sept ordres de grandeur plus
 * grossier que l'écart d'un ulp que la spec ECMAScript autorise entre
 * moteurs. La raison : elle n'observe que des positions en `Types.f32` (qui
 * n'en retient que ~23 bits de mantisse) plus `world.score` et `world.time`,
 * et aucun de ces trois n'est en aval d'un transcendant d'assez près pour
 * qu'un ulp y survive à l'échelle d'une run. Seul `math.golden.test.ts`,
 * à tolérance zéro sur les valeurs mêmes que produit `sim/math.ts`, porte
 * cette preuve-là.
 *
 * C'est une bonne nouvelle, pas seulement une lacune : puisqu'un écart d'un
 * ulp entre client et serveur ne peut pas changer un `f32` stocké, il ne peut
 * pas non plus changer un score — le stockage en `f32` de ces composants est
 * une vraie marge de sécurité pour le leaderboard, pas seulement une limite
 * de ce test.
 *
 * Un dernier angle mort, pour que personne ne le redécouvre : l'empreinte
 * n'interroge que `[Enemy]` et le joueur. Les plumes de seeker et les
 * gouttes de splatter — dont les systèmes tournent bel et bien dans cette
 * run de référence — ont leur position observée par rien, et `Facing.angle`
 * n'est jamais observé du tout.
 *
 * Elle ne change qu'avec une modification volontaire de la simulation.
 */
const REFERENCE_DIGEST =
  '1048:43302fcf:436f2ae6|114:43fecde3:43d3589b|121:43fc2ab1:44128000|123:43fc2ab1:440a0000|124:43fc2ab1:44018000|125:43fc2ab1:43f20000|126:43fc2ab1:43e10000|127:43fc2ab1:43d00000|128:43fc2ab1:43bf0000|129:43fc2ab1:43ae0000|130:43fc2ab1:439d0000|131:43fc2ab1:438c0000|132:43fc2ab1:43760000|143:440d2b6b:431702b0|145:4322b393:43527f11|146:442e2f9f:437879b5|157:439fef8a:44127f08|159:41600000:43cf2ab1|51:435451ea:440c9f91|5:43be6c8d:4412fd7a|68:420ca75f:43585094|77:43ae9828:43e233c1|97:430387ed:43c9ab7f|98:43c37e85:44124a27#40e6cf0aaaaaab36#40ea985555555427#2#134#1#4307fa94#44096bb3'

/**
 * Empreinte binaire exacte de l'état du monde. Les valeurs ne sont pas
 * arrondies : `toFixed(3)` masquerait des divergences que la comparaison
 * de chaînes actuelle détecte déjà. Voir la docstring de `REFERENCE_DIGEST`
 * pour ce que cette empreinte prouve, et ne prouve pas, sur la portabilité
 * entre moteurs.
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
  kills: number
} {
  resetGlobals()
  const world = createWorld({ seed, width: 800, height: 600 })
  spawnPlayer(world)
  const stats = createRunStats()
  const inputRng = createRng(seed * 7919 + 13)
  let seekersSeen = 0
  let kills = 0
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
    for (const event of world.events) {
      if (event.type === 'enemyKilled') {
        kills++
      }
    }
  }

  return {
    digest: fingerprint(world),
    alive: world.alive,
    wave: world.wave,
    enemyCount: enemies(world).length,
    seekersSeen,
    forced,
    kills,
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

  it('tue, sinon le rejeu inter-moteurs ne dirait rien du chemin gelé', () => {
    expect(runSimulation(1234, 3600).kills).toBeGreaterThan(0)
  })
})
