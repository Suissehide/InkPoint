import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Facing, Hazard, Orbiting, Position } from '../components'
import { HAZARD_BRAMBLE, POWERUP_BASE } from '../data/powerups'
import { activatePowerUp } from '../powerups/activate'
import { spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { createWorld } from '../world'
import { brambleAngle, brambleSystem } from './bramble'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  activatePowerUp(w, 'bramble', createRunStats(), 400, 300)
  return w
}

// bitECS alloue les entity id dans un compteur global au module, pas par
// monde (voir dist/index.cjs, globalEntityCursor) : un simple parcours
// `eid < 200` ramasserait aussi les épines des `it()` précédents dans ce même
// fichier. La requête bitECS, elle, est correctement filtrée par `w`.
const hazardsIn = defineQuery([Hazard, Position])

const bramblePositions = (w: ReturnType<typeof setup>) => {
  const out: { x: number; y: number }[] = []
  for (const eid of hazardsIn(w)) {
    if (Hazard.kind[eid] === HAZARD_BRAMBLE) {
      out.push({ x: Position.x[eid]!, y: Position.y[eid]! })
    }
  }
  return out
}

describe('brambleAngle', () => {
  it("part de l'angle de base à t = 0", () => {
    expect(brambleAngle(1.2, 0.0016, 0)).toBeCloseTo(1.2, 10)
  })

  it('tourne proportionnellement au temps de simulation', () => {
    expect(brambleAngle(0, 0.0016, 1000)).toBeCloseTo(1.6, 10)
  })

  it('est déterministe : deux appels au même instant donnent le même angle', () => {
    expect(brambleAngle(0.5, 0.0016, 1234)).toBe(brambleAngle(0.5, 0.0016, 1234))
  })
})

describe('brambleSystem', () => {
  it('crée autant d’épines que le réglage le demande', () => {
    const w = setup()
    expect(bramblePositions(w)).toHaveLength(POWERUP_BASE.bramble.count)
  })

  // `Hazard.growthRate` n'est pas un champ libre : `hazardSystem` le lit sur
  // TOUTE entité `Hazard`, épines comprises, et fait croître le rayon dès qu'il
  // est strictement positif. Y ranger le taux angulaire couplait deux nombres
  // sans rapport — seule l'égalité `radius === maxRadius` au spawn empêchait la
  // couronne de grossir. Le taux angulaire vit désormais sur `Orbiting.rate`.
  it('ne déclare aucune croissance de rayon', () => {
    const w = setup()
    const eids = hazardsIn(w).filter((eid) => Hazard.kind[eid] === HAZARD_BRAMBLE)
    expect(eids.length).toBe(POWERUP_BASE.bramble.count)
    for (const eid of eids) {
      expect(Hazard.growthRate[eid]).toBe(0)
      expect(Orbiting.rate[eid]).toBeCloseTo(POWERUP_BASE.bramble.angularRate, 6)
    }
  })

  it("place les épines sur le cercle d'orbite autour du joueur", () => {
    const w = setup()
    brambleSystem(w)
    const px = Position.x[w.playerEid]!
    const py = Position.y[w.playerEid]!
    // Précision 4 : Position/Orbiting sont des champs f32 (voir components/index.ts),
    // pas des float64 — l'arrondi simple précision sur des coordonnées de cet
    // ordre de grandeur (~400) vaut déjà quelques 1e-5, une précision 6 échoue
    // donc même sur un calcul par ailleurs correct.
    for (const p of bramblePositions(w)) {
      expect(Math.hypot(p.x - px, p.y - py)).toBeCloseTo(POWERUP_BASE.bramble.orbitRadius, 4)
    }
  })

  it('répartit les épines à intervalles angulaires égaux', () => {
    const w = setup()
    brambleSystem(w)
    const px = Position.x[w.playerEid]!
    const py = Position.y[w.playerEid]!
    const angles = bramblePositions(w)
      .map((p) => Math.atan2(p.y - py, p.x - px))
      .sort((a, b) => a - b)
    const expected = (Math.PI * 2) / POWERUP_BASE.bramble.count
    for (let i = 1; i < angles.length; i++) {
      // Même raison qu'au-dessus : les angles dérivent de positions f32.
      expect(angles[i]! - angles[i - 1]!).toBeCloseTo(expected, 4)
    }
  })

  it('suit le joueur quand il se déplace', () => {
    const w = setup()
    Position.x[w.playerEid] = 100
    Position.y[w.playerEid] = 120
    brambleSystem(w)
    for (const p of bramblePositions(w)) {
      expect(Math.hypot(p.x - 100, p.y - 120)).toBeCloseTo(POWERUP_BASE.bramble.orbitRadius, 4)
    }
  })

  it('tourne avec le temps de simulation', () => {
    const w = setup()
    brambleSystem(w)
    const before = bramblePositions(w)[0]
    w.time = 500
    brambleSystem(w)
    const after = bramblePositions(w)[0]
    expect(Math.hypot(after!.x - before!.x, after!.y - before!.y)).toBeGreaterThan(1)
  })

  // Écart volontaire par rapport au code d'avant le retrait : c'est le système
  // qui pose l'orientation dans `Facing`, comme `dashWakeSystem` pour le
  // sillage de la ruée, plutôt qu'un `atan2` recalculé dans `stage.ts`.
  it('pose son angle de rotation dans Facing, pas seulement dans Position', () => {
    const w = setup()
    w.time = 500
    brambleSystem(w)
    const px = Position.x[w.playerEid]!
    const py = Position.y[w.playerEid]!
    for (const eid of hazardsIn(w)) {
      if (Hazard.kind[eid] !== HAZARD_BRAMBLE) {
        continue
      }
      const expected = Math.atan2(Position.y[eid]! - py, Position.x[eid]! - px)
      // `Facing.angle` n'est pas rabattu dans (-π, π] comme le rend `atan2` —
      // il accumule `baseAngle + rate · time` sans y être contraint. Comparer
      // cos/sin plutôt que la valeur brute évite un faux échec sur un simple
      // tour de cercle en plus.
      expect(Math.cos(Facing.angle[eid]!)).toBeCloseTo(Math.cos(expected), 4)
      expect(Math.sin(Facing.angle[eid]!)).toBeCloseTo(Math.sin(expected), 4)
    }
  })
})
