import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Hazard, Orbiting, Position } from '../components'
import { HAZARD_SPIKE, POWERUP_BASE } from '../data/powerups'
import { activatePowerUp } from '../powerups/activate'
import { spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { createWorld } from '../world'
import { spikeAngle, spikeSystem } from './spikes'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  activatePowerUp(w, 'trail', createRunStats(), 400, 300)
  return w
}

// bitECS alloue les entity id dans un compteur global au module, pas par
// monde (voir dist/index.cjs, globalEntityCursor) : un simple parcours
// `eid < 200` ramasserait aussi les piques des `it()` précédents dans ce même
// fichier. La requête bitECS, elle, est correctement filtrée par `w`.
const hazardsIn = defineQuery([Hazard, Position])

const spikePositions = (w: ReturnType<typeof setup>) => {
  const out: { x: number; y: number }[] = []
  for (const eid of hazardsIn(w)) {
    if (Hazard.kind[eid] === HAZARD_SPIKE) {
      out.push({ x: Position.x[eid]!, y: Position.y[eid]! })
    }
  }
  return out
}

describe('spikeAngle', () => {
  it("part de l'angle de base à t = 0", () => {
    expect(spikeAngle(1.2, 0.0016, 0)).toBeCloseTo(1.2, 10)
  })

  it('tourne proportionnellement au temps de simulation', () => {
    expect(spikeAngle(0, 0.0016, 1000)).toBeCloseTo(1.6, 10)
  })

  it('est déterministe : deux appels au même instant donnent le même angle', () => {
    expect(spikeAngle(0.5, 0.0016, 1234)).toBe(spikeAngle(0.5, 0.0016, 1234))
  })
})

describe('spikeSystem', () => {
  it('crée autant de piques que le réglage le demande', () => {
    const w = setup()
    expect(spikePositions(w)).toHaveLength(POWERUP_BASE.trail.count)
  })

  // `Hazard.growthRate` n'est pas un champ libre : `hazardSystem` le lit sur
  // TOUTE entité `Hazard`, piques comprises, et fait croître le rayon dès qu'il
  // est strictement positif. Y ranger le taux angulaire couplait deux nombres
  // sans rapport — seule l'égalité `radius === maxRadius` au spawn empêchait la
  // couronne de grossir. Le taux angulaire vit désormais sur `Orbiting.rate`.
  it('ne déclare aucune croissance de rayon', () => {
    const w = setup()
    const eids = hazardsIn(w).filter((eid) => Hazard.kind[eid] === HAZARD_SPIKE)
    expect(eids.length).toBe(POWERUP_BASE.trail.count)
    for (const eid of eids) {
      expect(Hazard.growthRate[eid]).toBe(0)
      expect(Orbiting.rate[eid]).toBeCloseTo(POWERUP_BASE.trail.angularRate, 6)
    }
  })

  it("place les piques sur le cercle d'orbite autour du joueur", () => {
    const w = setup()
    spikeSystem(w)
    const px = Position.x[w.playerEid]!
    const py = Position.y[w.playerEid]!
    // Précision 4 : Position/Orbiting sont des champs f32 (voir components/index.ts),
    // pas des float64 — l'arrondi simple précision sur des coordonnées de cet
    // ordre de grandeur (~400) vaut déjà quelques 1e-5, une précision 6 échoue
    // donc même sur un calcul par ailleurs correct.
    for (const p of spikePositions(w)) {
      expect(Math.hypot(p.x - px, p.y - py)).toBeCloseTo(POWERUP_BASE.trail.orbitRadius, 4)
    }
  })

  it('répartit les piques à intervalles angulaires égaux', () => {
    const w = setup()
    spikeSystem(w)
    const px = Position.x[w.playerEid]!
    const py = Position.y[w.playerEid]!
    const angles = spikePositions(w)
      .map((p) => Math.atan2(p.y - py, p.x - px))
      .sort((a, b) => a - b)
    const expected = (Math.PI * 2) / POWERUP_BASE.trail.count
    for (let i = 1; i < angles.length; i++) {
      // Même raison qu'au-dessus : les angles dérivent de positions f32.
      expect(angles[i]! - angles[i - 1]!).toBeCloseTo(expected, 4)
    }
  })

  it('suit le joueur quand il se déplace', () => {
    const w = setup()
    Position.x[w.playerEid] = 100
    Position.y[w.playerEid] = 120
    spikeSystem(w)
    for (const p of spikePositions(w)) {
      expect(Math.hypot(p.x - 100, p.y - 120)).toBeCloseTo(POWERUP_BASE.trail.orbitRadius, 4)
    }
  })

  it('tourne avec le temps de simulation', () => {
    const w = setup()
    spikeSystem(w)
    const before = spikePositions(w)[0]
    w.time = 500
    spikeSystem(w)
    const after = spikePositions(w)[0]
    expect(Math.hypot(after!.x - before!.x, after!.y - before!.y)).toBeGreaterThan(1)
  })
})
