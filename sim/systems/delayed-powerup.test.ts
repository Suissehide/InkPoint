import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { DelayedPowerUp, Hazard, Pickup, Position } from '../components'
import { HAZARD_BLAST, POWERUP_ID, RULE_TUNING } from '../data/powerups'
import { UPGRADES } from '../data/upgrades'
import { spawnPlayer } from '../spawn'
import { stepWorld } from '../step'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '../world'
import { deathSystem } from './death'
import { delayedPowerUpSystem } from './delayed-powerup'
import { pickupSystem, spawnPickup } from './pickup'

/**
 * « Double trait » : chaque power-up ramassé se déclenche deux fois, la seconde
 * `delayMs` plus tard, à la position du joueur **à cet instant**.
 *
 * Tous les tests montent leurs `RunStats` en appelant `apply()` sur la **vraie
 * carte**, jamais en écrivant `rules.add('doubleStroke')` à la main : la règle
 * vit dans un `Set<string>` non typé, et une faute de frappe d'un côté ou de
 * l'autre rendrait la mythique silencieusement inerte sans qu'aucun
 * compilateur ni lint ne bronche. En passant par la carte, un seul de ces
 * tests suffit à mordre sur la faute, où qu'elle soit.
 */

const DELAY = RULE_TUNING.doubleStroke.delayMs
/** 24 images à 60 Hz : le retard tombe pile sur un nombre entier de pas. */
const DELAY_FRAMES = Math.round(DELAY / FIXED_DT)
/**
 * Le compte à rebours vit dans un `Float32Array` (`DelayedPowerUp.remaining`),
 * et 24 soustractions de 1000/60 arrondies en simple précision laissent
 * 3,8·10⁻⁵ ms au lieu de zéro : la salve part donc à la 25ᵉ image, une de plus
 * que l'arithmétique exacte ne le voudrait. Même phénomène que l'accumulation
 * de `world.time` documentée dans `tracing.test.ts`.
 *
 * 16,7 ms de retard supplémentaire sur 400 : invisible en jeu, mais le test
 * doit dire ce qui se passe vraiment plutôt que d'élargir sa marge jusqu'à ne
 * plus rien prouver.
 */
const DELAY_STEPS = DELAY_FRAMES + 1

const blastQuery = defineQuery([Hazard, Position])
const pendingQuery = defineQuery([DelayedPowerUp])

/** Les `RunStats` d'une run où la mythique a été prise, montées par la carte elle-même. */
function statsAvecCarte(): RunStats {
  const card = UPGRADES.find((u) => u.id === 'double-stroke')
  if (!card) {
    throw new Error('carte introuvable : double-stroke')
  }
  const stats = createRunStats()
  card.apply(stats)
  return stats
}

function setup(): SimWorld {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  return w
}

/** Les Bombes posées, dans leur ordre de création. */
const blasts = (w: SimWorld): number[] =>
  [...blastQuery(w)].filter((eid) => Hazard.kind[eid] === HAZARD_BLAST)

const pending = (w: SimWorld): number[] => [...pendingQuery(w)]

/** Pose une pastille de Bombe pile sur le joueur : elle sera ramassée au pas suivant. */
function poseBombe(w: SimWorld, x: number, y: number): number {
  const eid = spawnPickup(w)
  Position.x[eid] = x
  Position.y[eid] = y
  Pickup.kind[eid] = POWERUP_ID.blast
  return eid
}

/**
 * L'ordre réel de `step.ts`, réduit aux systèmes qui comptent ici :
 * `delayedPowerUpSystem` AVANT `pickupSystem` (la seconde salve traverse les
 * mêmes systèmes que la première, dans le même pas), `deathSystem` en dernier.
 */
function step(w: SimWorld, stats: RunStats): void {
  delayedPowerUpSystem(w, stats)
  pickupSystem(w, stats)
  deathSystem(w, stats)
  w.time += FIXED_DT
}

describe('delayedPowerUpSystem', () => {
  it('rejoue le power-up une seconde fois, après delayMs et pas avant', () => {
    const w = setup()
    const stats = statsAvecCarte()
    poseBombe(w, 400, 300)

    step(w, stats)
    // La première salve part au ramassage même : elle n'est jamais différée.
    expect(blasts(w), 'la première salve part au ramassage').toHaveLength(1)
    expect(pending(w), 'la seconde est en attente').toHaveLength(1)

    // Le pas du ramassage ne décompte pas : le système tourne AVANT
    // `pickupSystem`. Chacune de ces images doit laisser la salve en attente —
    // c'est cette assertion-là, répétée, qui tombe si le délai est ignoré.
    for (let i = 0; i < DELAY_STEPS - 1; i++) {
      step(w, stats)
      expect(blasts(w), `image ${i} : rien avant l'heure`).toHaveLength(1)
    }

    step(w, stats)
    expect(blasts(w), 'la seconde salve part au terme du délai').toHaveLength(2)
    expect(pending(w), "plus rien en attente : l'entité est consommée").toHaveLength(0)
  })

  it('part à la position COURANTE du joueur, pas à celle du ramassage', () => {
    const w = setup()
    const stats = statsAvecCarte()
    // La pastille est décalée du joueur, dans son cercle de contact : le point
    // de ramassage et la position du joueur ne se confondent donc jamais, même
    // au premier pas.
    poseBombe(w, 405, 298)

    step(w, stats)
    const premiere = blasts(w)[0]!
    expect(Position.x[premiere]).toBe(405)
    expect(Position.y[premiere]).toBe(298)

    // Le joueur file à l'autre bout de l'arène pendant les 400 ms d'attente.
    // C'est ce déplacement qui fait la carte : la première salve tombe où l'on
    // était, la seconde où l'on va.
    Position.x[w.playerEid] = 120
    Position.y[w.playerEid] = 540

    for (let i = 0; i < DELAY_STEPS; i++) {
      step(w, stats)
    }

    const posées = blasts(w)
    expect(posées).toHaveLength(2)
    const seconde = posées[1]!
    expect(Position.x[seconde], 'la seconde salve suit le joueur').toBe(120)
    expect(Position.y[seconde]).toBe(540)
    // Et surtout : loin du point de ramassage. C'est cette moitié-là qui
    // discrimine — une implémentation rejouant au point de ramassage passerait
    // la précédente si le joueur n'avait pas bougé.
    expect(Math.hypot(Position.x[seconde]! - 405, Position.y[seconde]! - 298)).toBeGreaterThan(200)
  })

  /**
   * La garde anti-récursion. Si la seconde salve en programmait une troisième,
   * le nombre de salves doublerait toutes les 400 ms jusqu'à la fin de la run —
   * une bombe à retardement au sens propre. Trois fois le délai suffit à la
   * faire exploser : on en compterait 8 au lieu de 2.
   */
  it("n'en programme jamais une troisième", () => {
    const w = setup()
    const stats = statsAvecCarte()
    poseBombe(w, 400, 300)

    for (let i = 0; i < DELAY_FRAMES * 3 + 5; i++) {
      step(w, stats)
    }

    expect(blasts(w), 'deux salves en tout, jamais une de plus').toHaveLength(2)
    expect(pending(w), 'aucune salve ne reste en attente indéfiniment').toHaveLength(0)
  })

  it('sans la carte, rien n’est programmé et le power-up ne part qu’une fois', () => {
    const w = setup()
    const stats = createRunStats()
    poseBombe(w, 400, 300)

    step(w, stats)
    expect(pending(w)).toHaveLength(0)

    for (let i = 0; i < DELAY_FRAMES * 2; i++) {
      step(w, stats)
    }
    expect(blasts(w)).toHaveLength(1)
  })

  /**
   * Deux pastilles ramassées coup sur coup doivent produire deux salves
   * distinctes. C'est ce qui justifie une entité par salve plutôt qu'un champ
   * posé sur le joueur, où la seconde écraserait le compte à rebours de la
   * première.
   */
  it('tient plusieurs salves en vol de front, chacune avec son propre délai', () => {
    const w = setup()
    const stats = statsAvecCarte()

    poseBombe(w, 400, 300)
    step(w, stats)
    expect(blasts(w)).toHaveLength(1)

    // Dix images plus tard, une seconde pastille.
    for (let i = 0; i < 10; i++) {
      step(w, stats)
    }
    poseBombe(w, 400, 300)
    step(w, stats)
    expect(blasts(w)).toHaveLength(2)
    expect(pending(w), 'deux salves en attente, indépendantes').toHaveLength(2)

    for (let i = 0; i < DELAY_FRAMES * 2; i++) {
      step(w, stats)
    }
    expect(blasts(w), 'deux ramassages, quatre salves').toHaveLength(4)
    expect(pending(w)).toHaveLength(0)
  })

  it('ne déclenche rien une fois le joueur mort', () => {
    const w = setup()
    const stats = statsAvecCarte()
    poseBombe(w, 400, 300)
    step(w, stats)
    expect(pending(w)).toHaveLength(1)

    w.alive = false
    for (let i = 0; i < DELAY_FRAMES * 2; i++) {
      step(w, stats)
    }
    // Une salve posée sur un cadavre après l'écran de fin n'a aucun sens.
    expect(blasts(w)).toHaveLength(1)
  })

  /**
   * Le système est câblé dans `step.ts`, pas seulement écrit. Sans ce test,
   * oublier son appel — ou le placer après `pickupSystem` — ne ferait tomber
   * aucun des tests ci-dessus, qui montent l'ordre à la main.
   */
  it('est bien branché dans stepWorld', () => {
    const w = createWorld({ seed: 3, width: 800, height: 600 })
    spawnPlayer(w)
    Position.x[w.playerEid] = 400
    Position.y[w.playerEid] = 300
    const stats = statsAvecCarte()
    poseBombe(w, 400, 300)

    stepWorld(w, stats)
    expect(pending(w), 'le ramassage a bien programmé une seconde salve').toHaveLength(1)
    const avant = blasts(w).length

    for (let i = 0; i < DELAY_STEPS; i++) {
      stepWorld(w, stats)
    }
    expect(pending(w), 'la salve a été consommée par le pas de simulation réel').toHaveLength(0)
    expect(blasts(w).length, 'une Bombe de plus qu’après le ramassage').toBe(avant + 1)
  })
})
