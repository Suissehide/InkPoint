import { defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Hazard, Lifetime, Position, PrevPosition, Tracing } from '../components'
import { HAZARD_TRACING, RULE_TUNING } from '../data/powerups'
import { UPGRADES } from '../data/upgrades'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '../world'
import { hazardSystem } from './hazards'
import { tracingSystem } from './tracing'

/**
 * « Papier calque » : le fantôme du trajet du joueur d'il y a `delayMs`.
 *
 * Tous les tests montent leurs `RunStats` en appelant `apply()` sur la **vraie
 * carte**, jamais en écrivant `rules.add('tracingPaper')` à la main : la règle
 * vit dans un `Set<string>` non typé, et une faute de frappe d'un côté ou de
 * l'autre rendrait la mythique silencieusement inerte sans qu'aucun
 * compilateur ni lint ne bronche. En passant par la carte, un seul de ces
 * tests suffit à mordre sur la faute, où qu'elle soit.
 */

const DELAY = RULE_TUNING.tracingPaper.delayMs
/** 150 images à 60 Hz : le retard tombe pile sur un pas de simulation. */
const DELAY_FRAMES = Math.round(DELAY / FIXED_DT)

const ghostQuery = defineQuery([Tracing, Hazard, Position])

/** Les `RunStats` d'une run où la mythique a été prise, montées par la carte elle-même. */
function statsAvecCarte(): RunStats {
  const card = UPGRADES.find((u) => u.id === 'tracing-paper')
  if (!card) {
    throw new Error('carte introuvable : tracing-paper')
  }
  const stats = createRunStats()
  card.apply(stats)
  return stats
}

function setup(): SimWorld {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 200
  Position.y[w.playerEid] = 300
  return w
}

/**
 * Un pas réduit à ce que le calque traverse en jeu. Le joueur est téléporté
 * plutôt que piloté : ce qui est mesuré est le retard, pas le mouvement.
 */
function step(w: SimWorld, stats: RunStats, px?: number, py?: number): void {
  if (px !== undefined) {
    Position.x[w.playerEid] = px
  }
  if (py !== undefined) {
    Position.y[w.playerEid] = py
  }
  tracingSystem(w, stats)
  w.time += FIXED_DT
}

const ghosts = (w: SimWorld): number[] => [...ghostQuery(w)]

describe('tracingSystem', () => {
  it("suit la position du joueur d'il y a delayMs, pas la position courante", () => {
    const w = setup()
    const stats = statsAvecCarte()

    // Le joueur file en ligne droite à 1 px par image depuis x = 200 : sa
    // position à l'image i est connue exactement, sans intégration ni friction.
    const frames = DELAY_FRAMES + 50
    for (let i = 0; i < frames; i++) {
      step(w, stats, 200 + i, 300)
    }

    const ghost = ghosts(w)[0]
    expect(ghost).toBeDefined()

    // À la dernière image traitée (frames - 1), le calque rejoue l'image
    // `frames - 1 - DELAY_FRAMES` : 50 px derrière un joueur qui en a parcouru 249.
    const attendu = 200 + (frames - 1 - DELAY_FRAMES)
    expect(Position.x[ghost!]!).toBeCloseTo(attendu, 1)

    // Et surtout : loin du joueur. C'est cette moitié-là qui discrimine — une
    // implémentation lisant la position courante passerait la précédente si le
    // joueur ne bougeait pas.
    const courant = 200 + (frames - 1)
    expect(Math.abs(Position.x[ghost!]! - courant)).toBeGreaterThan(DELAY_FRAMES - 5)
  })

  it("ne naît pas avant que la run n'ait duré delayMs", () => {
    const w = setup()
    const stats = statsAvecCarte()

    // Le joueur reste à son point d'apparition : un calque né trop tôt y
    // camperait, immobile et mortel, pendant deux secondes et demie.
    for (let i = 0; i < DELAY_FRAMES; i++) {
      step(w, stats, 200, 300)
      expect(ghosts(w), `image ${i} : rien ne doit exister avant l'heure`).toHaveLength(0)
    }

    // Deux images de plus, pas une : `world.time` s'accumule par pas de
    // 1000/60 et vaut 2499,999… après 150 images. Le calque naît donc à la
    // première image où le total dépasse *strictement* le retard.
    step(w, stats, 200, 300)
    expect(ghosts(w)).toHaveLength(0)
    step(w, stats, 200, 300)
    expect(ghosts(w)).toHaveLength(1)
  })

  it("tue ce qu'il touche", () => {
    const w = setup()
    const stats = statsAvecCarte()
    // Posé au point de départ du joueur : c'est là que le calque apparaîtra,
    // le joueur, lui, sera parti depuis longtemps.
    const enemy = spawnEnemy(w, { type: 'point', x: 200, y: 300, materializeMs: 0 })

    for (let i = 0; i <= DELAY_FRAMES + 1; i++) {
      step(w, stats, 200 + i * 4, 300)
      hazardSystem(w, stats)
    }

    expect(ghosts(w)).toHaveLength(1)
    expect(hasComponent(w, Doomed, enemy)).toBe(true)
  })

  it("laisse intact ce qu'il ne touche pas", () => {
    const w = setup()
    const stats = statsAvecCarte()
    // À plus d'un rayon mortel du trajet du joueur (qui longe y = 300) :
    // contre-épreuve du test précédent, sans quoi « tout meurt » le passerait.
    const enemy = spawnEnemy(w, { type: 'point', x: 200, y: 460, materializeMs: 0 })

    for (let i = 0; i <= DELAY_FRAMES + 1; i++) {
      step(w, stats, 200 + i * 4, 300)
      hazardSystem(w, stats)
    }

    expect(hasComponent(w, Doomed, enemy)).toBe(false)
  })

  it("n'en existe jamais deux, et celui-là ne meurt pas", () => {
    const w = setup()
    const stats = statsAvecCarte()

    for (let i = 0; i < DELAY_FRAMES * 3; i++) {
      step(w, stats, 200 + (i % 120), 300)
    }

    expect(ghosts(w)).toHaveLength(1)
    // Pas de `Lifetime` : le calque accompagne la run entière, il n'expire pas.
    expect(hasComponent(w, Lifetime, ghosts(w)[0]!)).toBe(false)
  })

  it('sans la carte, aucun calque', () => {
    const w = setup()
    const stats = createRunStats()

    for (let i = 0; i < DELAY_FRAMES * 2; i++) {
      step(w, stats, 200 + i, 300)
    }

    expect(ghosts(w)).toHaveLength(0)
  })

  it('porte PrevPosition à jour, pour que le rendu puisse interpoler', () => {
    const w = setup()
    const stats = statsAvecCarte()

    for (let i = 0; i < DELAY_FRAMES + 30; i++) {
      step(w, stats, 200 + i, 300)
    }

    const ghost = ghosts(w)[0]!
    // `stage.ts` interpole une zone ssi elle porte `PrevPosition` : sans le
    // composant, le calque avancerait par saccades d'un pas de simulation.
    expect(hasComponent(w, PrevPosition, ghost)).toBe(true)

    const avant = Position.x[ghost]!
    const prevAvant = PrevPosition.x[ghost]!
    step(w, stats, 200 + DELAY_FRAMES + 30, 300)
    // Le pas suivant range l'ancienne position dans `PrevPosition` et avance
    // `Position` : les deux doivent différer d'exactement une image de trajet.
    expect(PrevPosition.x[ghost]!).toBe(avant)
    expect(Position.x[ghost]!).toBeGreaterThan(avant)
    expect(prevAvant).not.toBe(Position.x[ghost]!)
  })

  it('est bien un genre de zone mortelle à part entière', () => {
    const w = setup()
    const stats = statsAvecCarte()
    for (let i = 0; i <= DELAY_FRAMES + 1; i++) {
      step(w, stats, 200 + i, 300)
    }
    const ghost = ghosts(w)[0]!
    expect(Hazard.kind[ghost]).toBe(HAZARD_TRACING)
    // Le rayon affiché est le rayon qui tue : le rendu lit `Hazard.radius`.
    expect(Hazard.radius[ghost]).toBe(RULE_TUNING.tracingPaper.radius)
  })
})
