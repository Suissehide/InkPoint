import { defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Facing, Hazard, Lifetime, Position, Ricochet } from '../components'
import { HAZARD_SPLATTER, POWERUP_BASE } from '../data/powerups'
import { spawnPlayer } from '../spawn'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '../world'
import { launchSplatter, ricochetSystem } from './ricochet'

const hazardsIn = defineQuery([Hazard, Position])

const setup = (): SimWorld => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  Facing.angle[w.playerEid] = 0
  return w
}

const drops = (w: SimWorld): number[] =>
  hazardsIn(w).filter(
    (eid) => Hazard.kind[eid] === HAZARD_SPLATTER && !hasComponent(w, Doomed, eid),
  )

/** Écart signé entre deux caps, rabattu dans (-π, π]. */
const ecartDeCap = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b))

const run = (w: SimWorld, steps: number): void => {
  for (let i = 0; i < steps; i++) {
    ricochetSystem(w)
    w.time += FIXED_DT
  }
}

describe('launchSplatter', () => {
  it('pose une goutte unique dans la direction du regard', () => {
    const w = setup()
    Facing.angle[w.playerEid] = Math.PI / 2
    launchSplatter(w, createRunStats(), 400, 300)
    const posees = drops(w)
    expect(posees).toHaveLength(1)
    expect(Facing.angle[posees[0]!]).toBeCloseTo(Math.PI / 2, 4)
  })

  it('lit sa durée dans les stats, pas dans la constante de base', () => {
    const w = setup()
    const stats: RunStats = { ...createRunStats(), splatterLifeMs: 9_000 }
    launchSplatter(w, stats, 400, 300)
    expect(Lifetime.remaining[drops(w)[0]!]).toBe(9_000)
  })

  it('n’arme le dédoublement que si la règle est prise', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 400, 300)
    expect(Ricochet.splitsLeft[drops(w)[0]!]).toBe(0)

    const w2 = setup()
    launchSplatter(w2, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 400, 300)
    expect(Ricochet.splitsLeft[drops(w2)[0]!]).toBe(1)
  })
})

describe('ricochetSystem', () => {
  it('ne laisse jamais la goutte sortir de l’arène', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 400, 300)
    const eid = drops(w)[0]!
    Facing.angle[eid] = 0.7
    const r = Hazard.radius[eid]!
    run(w, 2_000)
    for (const drop of drops(w)) {
      expect(Position.x[drop]!).toBeGreaterThanOrEqual(r - 1e-3)
      expect(Position.x[drop]!).toBeLessThanOrEqual(800 - r + 1e-3)
      expect(Position.y[drop]!).toBeGreaterThanOrEqual(r - 1e-3)
      expect(Position.y[drop]!).toBeLessThanOrEqual(600 - r + 1e-3)
    }
  })

  it('inverse la composante horizontale sur un mur vertical', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 790, 300)
    const eid = drops(w)[0]!
    Facing.angle[eid] = 0
    run(w, 5)
    expect(Math.cos(Facing.angle[eid]!)).toBeLessThan(0)
    expect(Math.sin(Facing.angle[eid]!)).toBeCloseTo(0, 3)
  })

  it('inverse les deux composantes dans un coin', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 795, 595)
    const eid = drops(w)[0]!
    Facing.angle[eid] = Math.PI / 4
    run(w, 5)
    expect(Math.cos(Facing.angle[eid]!)).toBeLessThan(0)
    expect(Math.sin(Facing.angle[eid]!)).toBeLessThan(0)
  })

  it('avance à sa vitesse nominale', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 100, 300)
    const eid = drops(w)[0]!
    Facing.angle[eid] = 0
    const avant = Position.x[eid]!
    ricochetSystem(w)
    const parcouru = Position.x[eid]! - avant
    expect(parcouru).toBeCloseTo((POWERUP_BASE.splatter.speed * FIXED_DT) / 1000, 3)
  })

  // Garder la goutte d'origine sur son cap et ne dévier que la nouvelle
  // donnerait une paire dont une seule branche a vraiment été dirigée : le
  // rebond se lirait comme un bug.
  it('dédouble symétriquement au premier rebond', () => {
    const w = setup()
    launchSplatter(w, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 790, 300)
    const eid = drops(w)[0]!
    Facing.angle[eid] = 0
    run(w, 5)
    const apres = drops(w)
    expect(apres).toHaveLength(2)
    const [a, b] = apres.map((e) => Facing.angle[e]!)
    const ecart = Math.abs(ecartDeCap(a!, b!))
    expect(ecart).toBeCloseTo(POWERUP_BASE.splatter.splitAngle, 3)

    // L'écart total ne dit rien de la SYMÉTRIE : une mère laissée sur son cap
    // réfléchi et une fille déviée de l'angle entier donnent le même écart. Ce
    // qu'il faut épingler, c'est que chacune s'écarte d'une demie du cap
    // réfléchi — ici π, puisque la goutte arrivait cap 0 sur un mur vertical.
    const reflechi = Math.PI
    const moitie = POWERUP_BASE.splatter.splitAngle / 2
    const ecarts = [a!, b!].map((cap) => ecartDeCap(cap, reflechi))
    for (const e of ecarts) {
      expect(Math.abs(e)).toBeCloseTo(moitie, 3)
    }
    // Et de part et d'autre, pas du même côté : le produit des deux écarts
    // signés est négatif.
    expect(ecarts[0]! * ecarts[1]!).toBeLessThan(0)
  })

  // Sans ce plafond, chaque rebond doublerait la population : la carte
  // deviendrait un déni de service sur elle-même.
  it('ne redédouble jamais les gouttes issues d’un dédoublement', () => {
    const w = setup()
    launchSplatter(w, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 790, 300)
    Facing.angle[drops(w)[0]!] = 0
    run(w, 2_000)
    expect(drops(w)).toHaveLength(2)
    for (const eid of drops(w)) {
      expect(Ricochet.splitsLeft[eid]).toBe(0)
    }
  })

  it('donne à la goutte née d’un dédoublement le sursis restant de sa mère', () => {
    const w = setup()
    launchSplatter(w, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 790, 300)
    const mere = drops(w)[0]!
    Facing.angle[mere] = 0
    const restant = Lifetime.remaining[mere]!
    run(w, 5)
    for (const eid of drops(w)) {
      expect(Lifetime.remaining[eid]).toBeCloseTo(restant, 3)
    }
  })
})
