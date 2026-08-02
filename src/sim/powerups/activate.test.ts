import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import {
  Attractor,
  Dashing,
  Halo,
  Hazard,
  Position,
  Ricochet,
  Seeker,
  Velocity,
} from '../components'
import {
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_BRAMBLE,
  HAZARD_FREEZE,
  HAZARD_QUILL,
  HAZARD_SPLATTER,
  POWERUP_BASE,
  POWERUP_KINDS,
  type PowerUpKind,
} from '../data/powerups'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { collisionSystem } from '../systems/collision'
import { deathSystem } from '../systems/death'
import { hazardSystem } from '../systems/hazards'
import { integrationSystem } from '../systems/integration'
import { lifetimeSystem } from '../systems/lifetime'
import { createRunStats } from '../upgrades/stats'
import { createWorld, type SimWorld } from '../world'
import { activatePowerUp } from './activate'

const hazards = defineQuery([Hazard])

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  return w
}

/**
 * L'empreinte propre à chaque genre : ce qu'il pose dans le monde, et lui seul.
 *
 * Le `switch` d'`activatePowerUp` associe un genre à un effet, mais rien ne
 * vérifiait cette association : deux branches interverties (les lanceurs de la
 * Volée et de la Bavure ont la même signature d'appel) compilaient et
 * laissaient toute la suite verte. Chaque empreinte doit donc être
 * **discriminante** — un compte d'entités ET un composant que les autres
 * genres ne posent pas.
 *
 * `Record<PowerUpKind, …>` : un genre de plus ne peut pas entrer dans le jeu
 * sans que quelqu'un dise ici ce qu'il produit.
 */
const EMPREINTES: Record<PowerUpKind, (w: SimWorld) => void> = {
  blast: (w) => {
    const list = hazards(w)
    expect(list).toHaveLength(1)
    expect(Hazard.kind[list[0]!]).toBe(HAZARD_BLAST)
    expect(Hazard.growthRate[list[0]!]).toBeGreaterThan(0)
  },
  freeze: (w) => {
    const list = hazards(w)
    expect(list).toHaveLength(1)
    expect(Hazard.kind[list[0]!]).toBe(HAZARD_FREEZE)
  },
  bramble: (w) => {
    const list = hazards(w)
    expect(list).toHaveLength(POWERUP_BASE.bramble.count)
    for (const eid of list) {
      expect(Hazard.kind[eid]).toBe(HAZARD_BRAMBLE)
    }
  },
  blotter: (w) => {
    const list = hazards(w)
    expect(list).toHaveLength(1)
    expect(Hazard.kind[list[0]!]).toBe(HAZARD_BLOTTER)
    expect(hasComponent(w, Attractor, list[0]!)).toBe(true)
  },
  dash: (w) => {
    // Sur le joueur, pas dans le monde : aucune zone n'est posée.
    expect(hazards(w)).toHaveLength(0)
    expect(hasComponent(w, Dashing, w.playerEid)).toBe(true)
  },
  halo: (w) => {
    expect(hazards(w)).toHaveLength(0)
    expect(hasComponent(w, Halo, w.playerEid)).toBe(true)
  },
  volley: (w) => {
    const list = hazards(w)
    expect(list).toHaveLength(createRunStats().volleyCount)
    for (const eid of list) {
      expect(Hazard.kind[eid]).toBe(HAZARD_QUILL)
      expect(hasComponent(w, Seeker, eid)).toBe(true)
    }
  },
  splatter: (w) => {
    const list = hazards(w)
    expect(list).toHaveLength(1)
    expect(Hazard.kind[list[0]!]).toBe(HAZARD_SPLATTER)
    expect(hasComponent(w, Ricochet, list[0]!)).toBe(true)
  },
}

describe('activatePowerUp — chaque genre pose son propre effet', () => {
  for (const kind of POWERUP_KINDS) {
    it(`« ${kind} » pose son effet à lui, et pas celui d’un autre genre`, () => {
      const w = setup()
      activatePowerUp(w, kind, createRunStats(), 400, 300)
      EMPREINTES[kind](w)
    })
  }
})

describe('activatePowerUp', () => {
  it("blast crée une zone explosive à la position d'activation passée en argument", () => {
    const w = setup()
    activatePowerUp(w, 'blast', createRunStats(), 400, 300)
    const list = hazards(w)
    expect(list).toHaveLength(1)
    expect(Hazard.kind[list[0]!]).toBe(HAZARD_BLAST)
    expect(Position.x[list[0]!]).toBe(400)
    expect(Hazard.growthRate[list[0]!]).toBeGreaterThan(0)
  })

  it("la position d'activation n'est pas celle du joueur : c'est bien l'argument qui compte", () => {
    // Le joueur est à (400, 300), mais la pastille peut être n'importe où sur
    // son cercle de collision au contact : c'est l'argument, pas
    // `world.playerEid`, qui doit fixer la zone.
    const w = setup()
    activatePowerUp(w, 'blast', createRunStats(), 120, 55)
    const [hid] = hazards(w)
    expect(Position.x[hid!]).toBe(120)
    expect(Position.y[hid!]).toBe(55)
  })

  it('freeze crée une zone de gel qui ne grandit pas', () => {
    const w = setup()
    activatePowerUp(w, 'freeze', createRunStats(), 400, 300)
    const h = hazards(w)[0]!
    expect(Hazard.kind[h]).toBe(HAZARD_FREEZE)
    expect(Hazard.growthRate[h]).toBe(0)
  })

  it('bramble fait naître une couronne de six épines, pas une zone unique', () => {
    // Chacune est une vraie zone mortelle (spec §3.1) : six entités, pas une
    // seule zone avec des épines peintes dessus.
    const w = setup()
    activatePowerUp(w, 'bramble', createRunStats(), 400, 300)
    const list = hazards(w)
    expect(list).toHaveLength(POWERUP_BASE.bramble.count)
    for (const eid of list) {
      expect(Hazard.kind[eid!]).toBe(HAZARD_BRAMBLE)
    }
  })

  it("blotter crée une zone d'attraction non létale", () => {
    const w = setup()
    activatePowerUp(w, 'blotter', createRunStats(), 400, 300)
    expect(Hazard.kind[hazards(w)[0]!]).toBe(HAZARD_BLOTTER)
  })

  it("halo s'attache au joueur au lieu de créer une zone", () => {
    const w = setup()
    activatePowerUp(w, 'halo', createRunStats(), 400, 300)
    expect(hasComponent(w, Halo, w.playerEid)).toBe(true)
    expect(hazards(w)).toHaveLength(0)
  })

  it('dash fige une vitesse et vaut invulnérabilité (un seul minuteur, pas deux)', () => {
    // Un seul composant Dashing porte la protection (pas d'Invulnerable
    // séparé qui pourrait diverger d'un pas). Preuve positive que
    // collisionSystem traite Dashing comme une invulnérabilité.
    const w = setup()
    activatePowerUp(w, 'dash', createRunStats(), 400, 300)
    expect(hasComponent(w, Dashing, w.playerEid)).toBe(true)

    const eid = spawnEnemy(w, {
      type: 'point',
      x: Position.x[w.playerEid]!,
      y: Position.y[w.playerEid]!,
      materializeMs: 0,
    })
    // Preuve que le contact a bien lieu (même position) avant de vérifier l'issue.
    expect(Position.x[eid]).toBe(Position.x[w.playerEid])
    collisionSystem(w)
    expect(w.alive, 'le joueur ne devrait pas mourir pendant la ruée').toBe(true)
  })

  it('émet toujours un événement powerupUsed', () => {
    const w = setup()
    activatePowerUp(w, 'blast', createRunStats(), 400, 300)
    expect(w.events.some((e) => e.type === 'powerupUsed')).toBe(true)
  })

  it("applique les modificateurs de RunStats au rayon d'explosion", () => {
    const w = setup()
    const stats = createRunStats()
    stats.blastRadius *= 2
    activatePowerUp(w, 'blast', stats, 400, 300)
    expect(Hazard.maxRadius[hazards(w)[0]!]).toBeCloseTo(300, 0)
  })

  /**
   * En séquence réelle (zones → durées de vie → morts) : l'anneau du Bombe
   * doit encore exister une fois son rayon max atteint — ce n'est pas un
   * flash instantané. Preuve positive que le rayon max a bien été atteint
   * avant de vérifier que la zone survit encore quelques pas, puis qu'elle
   * finit par disparaître (le sursis n'est pas infini non plus).
   */
  it('le Bombe persiste après avoir atteint son rayon max, puis finit par expirer', () => {
    const w = setup()
    const stats = createRunStats()
    activatePowerUp(w, 'blast', stats, 400, 300)
    const [hid] = hazards(w)
    if (hid === undefined) {
      throw new Error('hazard de Bombe introuvable')
    }

    // Avance jusqu'à atteindre le rayon max (croissance de POWERUP_BASE.blast.growthRate).
    let reachedMax = false
    for (let i = 0; i < 200 && !reachedMax; i++) {
      hazardSystem(w)
      lifetimeSystem(w)
      deathSystem(w)
      reachedMax = Hazard.radius[hid] === stats.blastRadius
    }
    expect(reachedMax, "le rayon max n'a jamais été atteint dans la fenêtre de test").toBe(true)

    // Encore là un bon moment après avoir atteint le rayon max : sans le
    // sursis de lingerMs, la zone s'éteindrait au plus 3 pas après avoir
    // atteint son rayon max (la seule marge restante venant de l'écart entre
    // le rayon de départ et 0 dans le calcul de la durée) — 20 pas
    // supplémentaires (~333 ms) ne laissent aucune ambiguïté possible.
    for (let i = 0; i < 20; i++) {
      hazardSystem(w)
      lifetimeSystem(w)
      deathSystem(w)
    }
    expect(entityExists(w, hid), "la zone n'a pas persisté après son rayon max").toBe(true)

    // Puis elle finit par expirer (le sursis n'est pas infini).
    for (let i = 0; i < 400 && entityExists(w, hid); i++) {
      hazardSystem(w)
      lifetimeSystem(w)
      deathSystem(w)
    }
    expect(entityExists(w, hid)).toBe(false)
  })

  /**
   * Le joueur se tient sur la pastille au ramassage (spec §3.4) : un Bombe
   * est donc toujours activé pile sous ses pieds. `hazardSystem` puis
   * `collisionSystem` tournent dans leur ordre réel (step.ts) pendant toute
   * la croissance de l'anneau. `hazardSystem` ne cible que les ennemis
   * (hazards.ts) : le joueur ne peut être tué que par `collisionSystem`.
   */
  it('un Bombe activé pile sur le joueur ne le tue jamais, du premier pas jusqu’à expiration', () => {
    const w = setup()
    const stats = createRunStats()
    activatePowerUp(w, 'blast', stats, Position.x[w.playerEid]!, Position.y[w.playerEid]!)

    for (let i = 0; i < 400 && w.alive; i++) {
      hazardSystem(w)
      collisionSystem(w)
      lifetimeSystem(w)
      deathSystem(w)
    }

    expect(w.alive).toBe(true)
  })

  /**
   * Enchaîne plusieurs pas dans l'ordre réel (zone → intégration → mort)
   * pour vérifier qu'un ennemi capturé au bord finit broyé par le noyau. La
   * disparition de l'entité est une preuve plus forte que `Doomed` : elle
   * exige que la chaîne complète ait tourné.
   */
  it('le Buvard créé par activatePowerUp aspire puis broie ce qu’il capture', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 460, y: 300, materializeMs: 0 })
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
    activatePowerUp(w, 'blotter', createRunStats(), 400, 300)

    for (let i = 0; i < 90; i++) {
      hazardSystem(w)
      integrationSystem(w)
      deathSystem(w)
    }

    // L'ennemi est à droite du centre (joueur en x:400) : l'attraction doit
    // l'avoir tiré vers la gauche, puis le noyau l'avoir tué — `deathSystem`
    // tournant dans la boucle, l'entité a fini par disparaître.
    expect(entityExists(w, eid)).toBe(false)
  })
})

/** Portée publiée par le `powerupUsed` du pas, ou `undefined` si aucun n'a été émis. */
function porteePubliee(w: SimWorld): number | null | undefined {
  for (const event of w.events) {
    if (event.type === 'powerupUsed') {
      return event.radius
    }
  }
  return undefined
}

describe("powerupUsed publie la portée de l'effet", () => {
  it('le Gel publie son rayon de stats, « Gel élargi » compris', () => {
    // La valeur des stats, pas la constante de base : sinon la couche FX
    // dessinerait toujours la même taille quelles que soient les cartes.
    const w = setup()
    const stats = createRunStats()
    stats.freezeRadius = 175
    activatePowerUp(w, 'freeze', stats, 400, 300)
    expect(porteePubliee(w)).toBe(175)
  })

  it('le Buvard publie son rayon de stats', () => {
    const w = setup()
    const stats = createRunStats()
    activatePowerUp(w, 'blotter', stats, 400, 300)
    expect(porteePubliee(w)).toBe(stats.blotterRadius)
  })

  it('la Bombe publie null, bien qu’elle ait un rayon', () => {
    // Le sien part de 12 px et grandit jusqu'à `stats.blastRadius` : aucun
    // nombre unique ne la décrit à l'activation, et publier son maximum lui
    // donnerait une portée qu'elle n'a pas encore.
    const w = setup()
    activatePowerUp(w, 'blast', createRunStats(), 400, 300)
    expect(porteePubliee(w)).toBeNull()
  })

  it('les power-ups sans portée ponctuelle publient null', () => {
    for (const kind of ['bramble', 'dash', 'halo', 'volley', 'splatter'] as const) {
      const w = setup()
      activatePowerUp(w, kind, createRunStats(), 400, 300)
      expect(porteePubliee(w), `« ${kind} » devrait publier null`).toBeNull()
    }
  })
})
