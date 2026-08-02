import { addComponent, addEntity, defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import {
  Attractor,
  Doomed,
  Enemy,
  Frozen,
  Hazard,
  Lifetime,
  Position,
  Velocity,
} from '../components'
import {
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_BRAMBLE,
  HAZARD_TRAIL,
  POWERUP_BASE,
} from '../data/powerups'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createWorld, FIXED_DT } from '../world'
import { collisionSystem } from './collision'
import { deathSystem } from './death'
import { freezeSystem } from './freeze'
import { hazardSystem } from './hazards'
import { integrationSystem } from './integration'

const enemies = defineQuery([Enemy])

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

function makeHazard(
  w: ReturnType<typeof setup>,
  kind: number,
  x: number,
  y: number,
  opts: {
    radius: number
    maxRadius: number
    growthRate: number
    lifeMs: number
  },
) {
  const eid = addEntity(w)
  addComponent(w, Position, eid)
  addComponent(w, Hazard, eid)
  addComponent(w, Lifetime, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = kind
  Hazard.radius[eid] = opts.radius
  Hazard.maxRadius[eid] = opts.maxRadius
  Hazard.growthRate[eid] = opts.growthRate
  Lifetime.remaining[eid] = opts.lifeMs
  return eid
}

describe('hazardSystem', () => {
  it("l'anneau d'explosion grandit jusqu'à son rayon max, sans le dépasser", () => {
    const w = setup()
    const h = makeHazard(w, HAZARD_BLAST, 400, 300, {
      radius: 10,
      maxRadius: 150,
      growthRate: 320,
      lifeMs: 2000,
    })
    for (let i = 0; i < 120; i++) {
      hazardSystem(w)
    }
    expect(Hazard.radius[h]).toBeCloseTo(150, 0)
  })

  it("l'explosion marque les ennemis dans la zone", () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 420, y: 300, materializeMs: 0 })
    makeHazard(w, HAZARD_BLAST, 400, 300, {
      radius: 60,
      maxRadius: 150,
      growthRate: 320,
      lifeMs: 2000,
    })
    hazardSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(true)
  })

  it("l'explosion épargne les ennemis hors de la zone", () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    makeHazard(w, HAZARD_BLAST, 400, 300, {
      radius: 60,
      maxRadius: 150,
      growthRate: 0,
      lifeMs: 2000,
    })
    hazardSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })

  // Létalité tenant uniquement à l'appartenance à l'ensemble `LETHAL` de
  // hazards.ts : retirer la constante laisserait cette suite au vert.
  it("une épine de Ronce d'encre tue ce qu'elle touche", () => {
    const w = setup()
    const { thornRadius } = POWERUP_BASE.bramble
    const eid = spawnEnemy(w, { type: 'point', x: 400 + thornRadius, y: 300, materializeMs: 0 })
    makeHazard(w, HAZARD_BRAMBLE, 400, 300, {
      radius: thornRadius,
      maxRadius: thornRadius,
      growthRate: 0,
      lifeMs: 5000,
    })
    hazardSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(true)
  })

  it('le sillage de la ruée tue ce qui entre dans le couloir', () => {
    const w = setup()
    const { radius } = POWERUP_BASE.dash
    const eid = spawnEnemy(w, { type: 'point', x: 400 + radius, y: 300, materializeMs: 0 })
    makeHazard(w, HAZARD_TRAIL, 400, 300, {
      radius,
      maxRadius: radius,
      growthRate: 0,
      lifeMs: POWERUP_BASE.dash.wakeLifeMs,
    })
    hazardSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(true)
  })

  it('un ennemi gelé meurt quand le joueur le traverse', () => {
    const w = setup()
    Position.x[w.playerEid] = 400
    Position.y[w.playerEid] = 300
    const eid = spawnEnemy(w, { type: 'point', x: 402, y: 300, materializeMs: 0 })
    addComponent(w, Frozen, eid)
    Frozen.remaining[eid] = 2000
    freezeSystem(w)
    deathSystem(w)
    expect(enemies(w).length).toBe(0)
  })

  it("le gel expire et rend l'ennemi mobile", () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 100, materializeMs: 0 })
    addComponent(w, Frozen, eid)
    Frozen.remaining[eid] = FIXED_DT
    freezeSystem(w)
    freezeSystem(w)
    expect(hasComponent(w, Frozen, eid)).toBe(false)
  })

  it("le Buvard aspire sans tuer tant qu'on est hors de son noyau", () => {
    // Assertion positive, pas seulement une absence : on prouve que la zone a
    // traité l'ennemi (vitesse tirée vers le centre) avant de vérifier qu'elle
    // ne l'a pas marqué pour la mort — sinon ce test passerait même si
    // hazardSystem ignorait le Buvard.
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 490, y: 300, materializeMs: 0 })
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
    const hid = makeHazard(w, HAZARD_BLOTTER, 400, 300, {
      radius: 190,
      maxRadius: 190,
      growthRate: 0,
      lifeMs: 2500,
    })
    addComponent(w, Attractor, hid)
    Attractor.strength[hid] = 260
    hazardSystem(w)
    // L'ennemi est à droite du centre (x: 490 > 400) : l'attraction doit le
    // pousser vers la gauche, donc vx devient négatif.
    expect(Velocity.x[eid]!).toBeLessThan(0)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })

  const blotterAt = (w: ReturnType<typeof setup>, x: number, y: number) => {
    const hid = makeHazard(w, HAZARD_BLOTTER, x, y, {
      radius: POWERUP_BASE.blotter.radius,
      maxRadius: POWERUP_BASE.blotter.radius,
      growthRate: 0,
      lifeMs: POWERUP_BASE.blotter.lifeMs,
    })
    addComponent(w, Attractor, hid)
    Attractor.strength[hid] = POWERUP_BASE.blotter.strength
    return hid
  }

  it('le noyau du Buvard tue ce qui atteint le centre', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    blotterAt(w, 400, 300)

    hazardSystem(w)

    expect(hasComponent(w, Doomed, eid)).toBe(true)
  })

  /**
   * Ordre réel de la boucle : gel → collision → mort (différée). Sans
   * `Not(Frozen)` dans `activeEnemies`, cette même image tuerait le joueur :
   * `freezeSystem` marque l'ennemi `Doomed`, mais ne le supprime pas — il reste
   * visible à `collisionSystem` tant que `deathSystem` n'a pas tourné.
   */
  it('le joueur traverse un ennemi gelé sans mourir : lui meurt, le joueur survit', () => {
    const w = setup()
    Position.x[w.playerEid] = 400
    Position.y[w.playerEid] = 300
    const eid = spawnEnemy(w, { type: 'point', x: 402, y: 300, materializeMs: 0 })
    addComponent(w, Frozen, eid)
    Frozen.remaining[eid] = 2000

    // Preuve que la situation a bien eu lieu : l'ennemi est gelé et au contact
    // avant de lancer la séquence — sinon « le joueur survit » passerait aussi
    // si rien ne s'était produit.
    expect(hasComponent(w, Frozen, eid)).toBe(true)
    const dx = Position.x[eid]! - Position.x[w.playerEid]!
    const dy = Position.y[eid]! - Position.y[w.playerEid]!
    expect(Math.hypot(dx, dy)).toBeLessThan(20)

    freezeSystem(w)
    collisionSystem(w)
    deathSystem(w)

    expect(w.alive).toBe(true)
    expect(entityExists(w, eid)).toBe(false)
  })

  /**
   * Composition à trois : hazardSystem (Buvard) → freezeSystem → integrationSystem.
   * Le Buvard n'exclut pas `Frozen` (spec §3.4 : il aspire tout), donc il
   * écrit une vélocité non nulle sur un ennemi gelé ; freezeSystem doit la
   * remettre à zéro *après* dans le même pas, sinon integrationSystem
   * l'intègre au pas suivant. Égalité stricte (`toBe`) : une dérive d'une
   * fraction de pixel est exactement ce que ce test doit détecter.
   */
  it('un ennemi gelé dans un Buvard actif reste parfaitement immobile pas après pas', () => {
    const w = setup()
    // Assez loin du joueur (spawné au centre, 400/300) pour ne jamais déclencher
    // la mort par contact de freezeSystem, qui fausserait le test en supprimant
    // l'ennemi avant la fin de la boucle.
    // Décalé du centre du Buvard (et non pile dessus) : sinon le vecteur
    // d'attraction est nul et le test ne prouverait rien.
    const eid = spawnEnemy(w, { type: 'point', x: 220, y: 300, materializeMs: 0 })
    addComponent(w, Frozen, eid)
    Frozen.remaining[eid] = 100_000
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0

    const hid = makeHazard(w, HAZARD_BLOTTER, 200, 300, {
      radius: 190,
      maxRadius: 190,
      growthRate: 0,
      lifeMs: 100_000,
    })
    addComponent(w, Attractor, hid)
    Attractor.strength[hid] = 260

    const x0 = Position.x[eid]!
    const y0 = Position.y[eid]!

    for (let i = 0; i < 30; i++) {
      integrationSystem(w)
      hazardSystem(w)
      freezeSystem(w)
      expect(Position.x[eid]).toBe(x0)
      expect(Position.y[eid]).toBe(y0)
    }
  })
})
