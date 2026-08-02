import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Facing, Hazard, Lifetime, Position, Ricochet } from '../components'
import { HAZARD_SPLATTER, POWERUP_BASE } from '../data/powerups'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '../world'
import { deathSystem } from './death'
import { hazardSystem } from './hazards'
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

/**
 * Épingle un dédoublement autour de `capReflechi` : deux gouttes, chacune
 * écartée de la MOITIÉ de `splitAngle`, de part et d'autre, et toutes deux à
 * court de budget.
 *
 * L'écart total entre les deux caps ne suffit pas à le dire : une mère laissée
 * sur son cap réfléchi et une fille déviée de l'angle entier donnent
 * exactement le même écart. C'est la position des deux gouttes *par rapport au
 * cap réfléchi* qui distingue les deux implémentations.
 */
const verifieDedoublement = (w: SimWorld, capReflechi: number): void => {
  const apres = drops(w)
  expect(apres).toHaveLength(2)

  const moitie = POWERUP_BASE.splatter.splitAngle / 2
  const ecarts = apres.map((eid) => ecartDeCap(Facing.angle[eid]!, capReflechi))
  for (const e of ecarts) {
    expect(Math.abs(e)).toBeCloseTo(moitie, 3)
  }
  // De part et d'autre, pas du même côté : le produit des écarts signés est négatif.
  expect(ecarts[0]! * ecarts[1]!).toBeLessThan(0)

  // Le budget est retombé sur les deux : sans ce plafond, chaque rebond
  // suivant redoublerait la population.
  for (const eid of apres) {
    expect(Ricochet.splitsLeft[eid]).toBe(0)
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
  it('dédouble symétriquement sur un mur vertical', () => {
    const w = setup()
    launchSplatter(w, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 790, 300)
    const eid = drops(w)[0]!
    Facing.angle[eid] = 0
    // Un seul pas : la photographie du rebond lui-même. Cinq pas plus tard, un
    // autre mur peut être passé par là et avoir recomposé les caps (voir le
    // test du coin, où c'est exactement ce qui masquait un défaut).
    run(w, 1)

    // Cap 0 contre un mur vertical : la composante horizontale s'inverse seule,
    // le cap réfléchi est π.
    verifieDedoublement(w, Math.PI)

    // `splitAngle` est bien l'écart TOTAL entre les deux gouttes, pas la
    // déviation de chacune — c'est ce que dit son commentaire dans `powerups.ts`.
    const [a, b] = drops(w).map((e) => Facing.angle[e]!)
    expect(Math.abs(ecartDeCap(a!, b!))).toBeCloseTo(POWERUP_BASE.splatter.splitAngle, 3)
  })

  it('dédouble symétriquement sur un mur horizontal', () => {
    const w = setup()
    launchSplatter(w, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 400, 595)
    const eid = drops(w)[0]!
    Facing.angle[eid] = Math.PI / 2
    run(w, 1)

    // Cap π/2 (vers le bas) contre le mur du bas : c'est la composante
    // VERTICALE qui s'inverse, le cap réfléchi est -π/2. Le mur vertical ne
    // prouvait rien pour celle-ci : ses deux gouttes s'écartaient autour de π,
    // où la moitié verticale du code n'est jamais sollicitée.
    verifieDedoublement(w, -Math.PI / 2)
  })

  it('dédouble symétriquement dans un coin, autour du cap doublement réfléchi', () => {
    const w = setup()
    launchSplatter(w, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 795, 595)
    const eid = drops(w)[0]!
    const r = Hazard.radius[eid]!
    Facing.angle[eid] = Math.PI / 4
    // UN SEUL pas, et c'est tout l'enjeu : sur cinq pas, un code qui ne
    // traiterait qu'un mur par passe rebondirait sur le second au pas suivant
    // et retomberait sur les mêmes caps. Le défaut ne se voit qu'au pas du
    // rebond — mesuré cinq pas plus tard, ce test passait sur une version
    // sabotée qui laissait la goutte dépasser d'un mur pendant une image.
    run(w, 1)

    // Les deux murs sont traités dans le MÊME pas : la goutte est déjà rentrée
    // sur les deux axes, elle n'a jamais dépassé.
    for (const drop of drops(w)) {
      expect(Position.x[drop]!).toBeCloseTo(800 - r, 3)
      expect(Position.y[drop]!).toBeCloseTo(600 - r, 3)
    }

    // Et le dédoublement s'écarte du cap DOUBLEMENT réfléchi (π/4 → -3π/4),
    // pas d'un cap réfléchi sur un seul axe (3π/4).
    verifieDedoublement(w, (-3 * Math.PI) / 4)

    // Un coin ne consomme qu'un seul dédoublement, pas un par mur touché.
    expect(drops(w)).toHaveLength(2)
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

  /**
   * Le pendant exact du filet de la Volée (« la plume seule ne tue pas ») :
   * là-bas il fallait prouver qu'une zone n'est PAS mortelle, ici qu'elle
   * l'est. `HAZARD_SPLATTER ∈ LETHAL` n'était jusque-là qu'une ligne de
   * données que rien n'exerçait.
   *
   * La goutte est la seule zone du monde : aucune explosion, aucun sillage ne
   * peut tuer à sa place. Et `ricochetSystem` tourne bien avant `hazardSystem`,
   * dans l'ordre de `step.ts` — la goutte ne parcourt que 5 px par pas, très en
   * deçà des 18 px de portée (rayon 11 + rayon d'un Point, 7), donc le contact
   * tient quoi qu'elle fasse. Ce test ne peut échouer que sur la létalité.
   */
  it('tue l’ennemi qu’elle touche : le disque affiché est le disque qui tue', () => {
    const w = setup()
    const cible = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    launchSplatter(w, createRunStats(), 400, 300)
    expect(drops(w)).toHaveLength(1)

    ricochetSystem(w)
    hazardSystem(w, createRunStats())
    deathSystem(w)

    expect(entityExists(w, cible) && !hasComponent(w, Doomed, cible)).toBe(false)
  })

  /**
   * L'éclaboussure du rebond est purement décorative — rien dans la
   * simulation ne consomme cet événement — mais sa **normale** ne l'est pas :
   * c'est elle qui décide du côté vers lequel l'encre gicle. Une normale
   * inversée projetterait la gerbe dans le mur, où personne ne la verrait.
   */
  describe('éclaboussure de rebond', () => {
    /** Les rebonds signalés par le dernier appel à `ricochetSystem`. */
    const rebonds = (w: SimWorld) =>
      w.events.filter(
        (e): e is Extract<typeof e, { type: 'splatterBounced' }> => e.type === 'splatterBounced',
      )

    it('ne signale rien tant que la goutte n’a touché aucun mur', () => {
      const w = setup()
      launchSplatter(w, createRunStats(), 400, 300)
      Facing.angle[drops(w)[0]!] = 0
      w.events.length = 0
      ricochetSystem(w)
      expect(rebonds(w)).toHaveLength(0)
    })

    it('pointe vers l’intérieur de l’arène sur un mur vertical', () => {
      const w = setup()
      launchSplatter(w, createRunStats(), 790, 300)
      Facing.angle[drops(w)[0]!] = 0
      let garde = 0
      while (rebonds(w).length === 0 && garde < 20) {
        w.events.length = 0
        ricochetSystem(w)
        garde++
      }
      const [rebond] = rebonds(w)
      expect(rebond, 'aucun rebond signalé').toBeDefined()
      // Mur droit heurté : la normale rentre vers la gauche.
      expect(rebond!.nx).toBeCloseTo(-1, 6)
      expect(rebond!.ny).toBeCloseTo(0, 6)
    })

    it('rend une diagonale unitaire dans un coin, pas un vecteur de norme √2', () => {
      const w = setup()
      launchSplatter(w, createRunStats(), 795, 595)
      Facing.angle[drops(w)[0]!] = Math.PI / 4
      let garde = 0
      while (rebonds(w).length === 0 && garde < 20) {
        w.events.length = 0
        ricochetSystem(w)
        garde++
      }
      const [rebond] = rebonds(w)
      expect(rebond, 'aucun rebond signalé').toBeDefined()
      expect(Math.hypot(rebond!.nx, rebond!.ny)).toBeCloseTo(1, 6)
      // Coin bas-droit : la normale rentre vers le haut-gauche.
      expect(rebond!.nx).toBeLessThan(0)
      expect(rebond!.ny).toBeLessThan(0)
    })
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
