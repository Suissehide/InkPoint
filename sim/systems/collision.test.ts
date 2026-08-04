import { addComponent, defineQuery, entityExists, hasComponent, removeComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Enemy, Halo, Hazard, Invulnerable, Position, Velocity } from '../components'
import { HAZARD_BLAST, RULE_TUNING } from '../data/powerups'
import { UPGRADES } from '../data/upgrades'
import { activatePowerUp } from '../powerups/activate'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '../world'
import { collisionSystem } from './collision'
import { deathSystem } from './death'
import { hazardSystem } from './hazards'

const enemies = defineQuery([Enemy])

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  return w
}

/**
 * `stats` est partagé entre les deux systèmes, au lieu d'en fabriquer un par
 * appel : les cartes se lisent des deux côtés, et deux instances distinctes
 * feraient silencieusement mentir tout test qui en prend une.
 */
const step = (w: ReturnType<typeof setup>, stats: RunStats = createRunStats()) => {
  collisionSystem(w, stats)
  deathSystem(w, stats)
}

// Helper local : marque un ennemi pour la mort, comme le feraient les zones mortelles.
function killEnemy(w: SimWorld, eid: number) {
  addComponent(w, Doomed, eid)
}

const hazardsIn = defineQuery([Hazard, Position])

/** La carte d'id donné, ou une erreur si elle a disparu de `UPGRADES`. */
function cardById(id: string) {
  const card = UPGRADES.find((u) => u.id === id)
  if (!card) {
    throw new Error(`carte introuvable : ${id}`)
  }
  return card
}

describe('collisionSystem', () => {
  it("tue le joueur au contact d'un ennemi actif", () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w)
    expect(w.alive).toBe(false)
    expect(w.events.some((e) => e.type === 'playerDied')).toBe(true)
  })

  it('ignore un ennemi encore en apparition — il est traversable', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 1000 })
    step(w)
    expect(w.alive).toBe(true)
    // Sans cette assertion, le test passerait aussi si la requête de collision
    // ne trouvait simplement rien — il faut prouver que l'ennemi existe bien
    // et se trouve exactement sur le joueur.
    expect(entityExists(w, eid)).toBe(true)
    expect(Position.x[eid]).toBe(400)
    expect(Position.y[eid]).toBe(300)
  })

  it("ignore le contact pendant l'invulnérabilité", () => {
    const w = setup()
    addComponent(w, Invulnerable, w.playerEid)
    Invulnerable.remaining[w.playerEid] = 500
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w)
    expect(w.alive).toBe(true)
  })

  it('ne tue pas quand les cercles ne se touchent pas', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 600, y: 300, materializeMs: 0 })
    step(w)
    expect(w.alive).toBe(true)
  })

  it('ne tue pas un ennemi proche mais dont les cercles ne se recouvrent pas', () => {
    // Rayons joueur (9) + point (7) = 16 : à distance 25, les cellules du
    // hachage spatial voisinent (donc l'ennemi est bien candidat), mais les
    // cercles ne se touchent pas. Contrairement au test à 200 px, celui-ci
    // ne peut pas passer simplement parce que le hachage a tout filtré en
    // amont — il vérifie réellement le calcul de distance cercle à cercle.
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 425, y: 300, materializeMs: 0 })
    step(w)
    expect(w.alive).toBe(true)
    expect(entityExists(w, eid)).toBe(true)
  })

  it('un ennemi déjà condamné (Doomed) au contact ne tue pas le joueur — une bombe ne se retourne pas contre son utilisateur', () => {
    // Reproduit ce que ferait hazardSystem (blast/trail) : l'ennemi est
    // marqué Doomed pendant le même pas, avant que collisionSystem ne tourne,
    // mais sa suppression est différée à deathSystem. Sans Not(Doomed) dans la
    // requête, collisionSystem le verrait encore comme un ennemi actif au
    // contact et tuerait le joueur alors que l'ennemi est déjà mort.
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    killEnemy(w, eid)
    step(w)
    expect(w.alive).toBe(true)
    expect(entityExists(w, eid)).toBe(false)
  })

  it("le Halo absorbe le contact, détruit l'ennemi et donne 1 s d'invulnérabilité", () => {
    const w = setup()
    addComponent(w, Halo, w.playerEid)
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w)
    expect(w.alive).toBe(true)
    expect(hasComponent(w, Halo, w.playerEid)).toBe(false)
    expect(entityExists(w, eid)).toBe(false)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(1000, 0)
    expect(w.events.some((e) => e.type === 'haloBroken')).toBe(true)
  })

  it('sans « Onde de rupture », le Halo brisé ne pose aucune zone', () => {
    const w = setup()
    addComponent(w, Halo, w.playerEid)
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w)
    expect(hazardsIn(w)).toHaveLength(0)
  })

  it('avec « Onde de rupture », le Halo brisé pose une explosion au point de contact', () => {
    const w = setup()
    const stats = createRunStats()
    cardById('halo-burst').apply(stats)
    addComponent(w, Halo, w.playerEid)
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w, stats)

    const zones = hazardsIn(w)
    expect(zones).toHaveLength(1)
    const zone = zones[0]!
    expect(Hazard.kind[zone]).toBe(HAZARD_BLAST)
    // Au point de contact, c'est-à-dire sur le joueur — pas sur l'ennemi.
    expect(Position.x[zone]).toBe(400)
    expect(Position.y[zone]).toBe(300)
    // `rangeScale` vaut 1 dans ce monde de test : la valeur brute s'applique.
    expect(Hazard.maxRadius[zone]).toBeCloseTo(RULE_TUNING.haloBurst.radius, 5)
  })

  /**
   * Le seul test qui distingue cette carte d'une décoration. L'ennemi fautif
   * mourait déjà sans elle ; ce qui change, c'est le sort de son voisin.
   *
   * Le voisin est à 80 px, hors de portée du contact. La zone naît à 6 px et
   * grandit de 5,33 px par pas (320 px/s) : il lui faut ~13 pas pour l'atteindre
   * (rayon utile 80 − 7 de rayon d'ennemi). Trente pas laissent de la marge des
   * deux côtés — la zone est à son maximum au 26ᵉ, et elle vit ~738 ms, soit 44
   * pas.
   */
  it('l’explosion emporte un ennemi voisin que le Halo seul aurait épargné', () => {
    const voisinPos = { type: 'point' as const, x: 480, y: 300, materializeMs: 0 }

    const sans = setup()
    addComponent(sans, Halo, sans.playerEid)
    spawnEnemy(sans, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    const voisinSans = spawnEnemy(sans, voisinPos)
    const statsSans = createRunStats()
    step(sans, statsSans)
    for (let i = 0; i < 30; i++) {
      hazardSystem(sans)
      deathSystem(sans, statsSans)
    }
    expect(entityExists(sans, voisinSans)).toBe(true)

    const avec = setup()
    const statsAvec = createRunStats()
    cardById('halo-burst').apply(statsAvec)
    addComponent(avec, Halo, avec.playerEid)
    const fautif = spawnEnemy(avec, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    const voisinAvec = spawnEnemy(avec, voisinPos)
    step(avec, statsAvec)
    // L'ennemi fautif meurt dans les deux cas : l'explosion s'ajoute à `Doomed`,
    // elle ne le remplace pas.
    expect(entityExists(avec, fautif)).toBe(false)
    for (let i = 0; i < 30; i++) {
      hazardSystem(avec)
      deathSystem(avec, statsAvec)
    }
    expect(entityExists(avec, voisinAvec)).toBe(false)
  })
})

describe('deathSystem', () => {
  it('scinde une Tache en 3 Points', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'blot', x: 200, y: 200, materializeMs: 0 })
    killEnemy(w, eid)
    deathSystem(w, createRunStats())
    expect(enemies(w).length).toBe(3)
    for (const e of enemies(w)) {
      expect(Enemy.type[e]).toBe(0)
    }
  })

  it('ne scinde pas un Point', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 200, y: 200, materializeMs: 0 })
    killEnemy(w, eid)
    deathSystem(w, createRunStats())
    expect(enemies(w).length).toBe(0)
  })

  it('émet enemyKilled avec la position de la mort', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 210, y: 220, materializeMs: 0 })
    killEnemy(w, eid)
    deathSystem(w, createRunStats())
    const evt = w.events.find((e) => e.type === 'enemyKilled')
    expect(evt).toMatchObject({ x: 210, y: 220 })
  })

  it('les enfants de la scission héritent de la moitié de la vitesse du parent (spec §3.3)', () => {
    // Le test précédent laisse le parent immobile (vx = vy = 0), donc il ne
    // ferait pas la différence si le terme d'héritage disparaissait. On
    // identifie ici chaque enfant par sa position (déterministe, indépendante
    // de la vitesse) pour vérifier sa vitesse sans dépendre de l'ordre de la requête.
    const w = setup()
    const x = 200
    const y = 200
    const eid = spawnEnemy(w, { type: 'blot', x, y, materializeMs: 0 })
    Velocity.x[eid] = 100
    Velocity.y[eid] = 40
    killEnemy(w, eid)
    deathSystem(w, createRunStats())
    const children = enemies(w)
    expect(children.length).toBe(3)
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2
      const cx = x + Math.cos(angle) * 18
      const cy = y + Math.sin(angle) * 18
      // Tolérance large : Position est stockée en f32 (SoA bitECS), donc
      // l'arrondi introduit un écart de l'ordre de 1e-5 par rapport au f64.
      const child = children.find(
        (e) => Math.abs(Position.x[e]! - cx) < 1e-2 && Math.abs(Position.y[e]! - cy) < 1e-2,
      )
      expect(child).toBeDefined()
      expect(Velocity.x[child!]).toBeCloseTo(100 * 0.5 + Math.cos(angle) * 60, 5)
      expect(Velocity.y[child!]).toBeCloseTo(40 * 0.5 + Math.sin(angle) * 60, 5)
    }
  })

  it('les enfants de la scission survivent réellement au pas suivant (pas juste au décompte)', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'blot', x: 200, y: 200, materializeMs: 0 })
    killEnemy(w, eid)
    deathSystem(w, createRunStats())
    const children = enemies(w)
    expect(children.length).toBe(3)
    for (const child of children) {
      expect(entityExists(w, child)).toBe(true)
      expect(hasComponent(w, Doomed, child)).toBe(false)
    }
  })
})

describe('bouclier de la Ronce d’encre', () => {
  // La couronne est étanche par construction (powerups.test.ts le vérifie sur
  // les trois genres d'ennemis), mais c'est un argument géométrique sur un
  // anneau STATIQUE : un ennemi rapide peut la traverser en un seul pas. Le
  // bouclier est ce qui rend la promesse vraie quoi qu'il arrive.
  it('rend le joueur invulnérable au contact pendant toute la durée de la couronne', () => {
    const w = setup()
    activatePowerUp(w, 'bramble', createRunStats(), 400, 300)
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w)
    expect(w.alive).toBe(true)
  })

  it('protège pendant toute la couronne, puis laisse mourir', () => {
    // Fait avancer le temps par les vrais systèmes (collisionSystem décrémente
    // `Invulnerable.remaining` de `FIXED_DT * timeScale` à chaque appel), pour
    // distinguer le comportement correct de son absence — écrire directement
    // dans le tableau SoA ne le permettrait pas, `activatePowerUp` non corrigé
    // ne posant aucun `Invulnerable` sur lequel écrire n'aurait aucun effet.
    const w = setup()
    const stats = createRunStats()
    activatePowerUp(w, 'bramble', stats, 400, 300)
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })

    // `step` (voir plus haut) n'appelle que collisionSystem et deathSystem :
    // rien ne déplace l'ennemi, il reste au contact du joueur tout du long.
    // Un pas avant la fin de la grâce : l'ennemi est au contact depuis le
    // début et n'a toujours pas tué.
    const pas = Math.floor(stats.brambleDurationMs / FIXED_DT)
    for (let i = 0; i < pas; i++) {
      step(w)
      expect(w.alive, `mort au pas ${i}, avant la fin de la couronne`).toBe(true)
    }

    // Passé la grâce, le même ennemi au même endroit tue.
    for (let i = 0; i < 5 && w.alive; i++) {
      step(w)
    }
    expect(w.alive).toBe(false)
  })

  // collisionSystem expire `Invulnerable` AVANT que lifetimeSystem ne tue les
  // épines : à durée strictement égale, il existe une image où la couronne est
  // encore à l'écran et le joueur redevenu mortel. C'est exactement le piège
  // que le commentaire de `Dashing` raconte avoir déjà vécu.
  it('accorde un pas de marge de plus que la durée des épines', () => {
    const w = setup()
    const stats = createRunStats()
    activatePowerUp(w, 'bramble', stats, 400, 300)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(stats.brambleDurationMs + FIXED_DT, 3)
  })

  // Les tableaux SoA de bitECS ne sont jamais remis à zéro au retrait d'un
  // composant : lire `Invulnerable.remaining` sans `hasComponent` ferait durer
  // la Ronce aussi longtemps que la plus longue invulnérabilité de la partie.
  it('ignore la valeur résiduelle d’une invulnérabilité révolue', () => {
    const w = setup()
    addComponent(w, Invulnerable, w.playerEid)
    Invulnerable.remaining[w.playerEid] = 999_999
    removeComponent(w, Invulnerable, w.playerEid)
    const stats = createRunStats()
    activatePowerUp(w, 'bramble', stats, 400, 300)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(stats.brambleDurationMs + FIXED_DT, 3)
  })

  // Un Halo brisé pose 1000 ms. Ramasser une Ronce dans la seconde qui suit ne
  // doit jamais raccourcir cette grâce.
  it('garde la plus longue des deux grâces', () => {
    const w = setup()
    addComponent(w, Invulnerable, w.playerEid)
    Invulnerable.remaining[w.playerEid] = 60_000
    activatePowerUp(w, 'bramble', createRunStats(), 400, 300)
    expect(Invulnerable.remaining[w.playerEid]).toBe(60_000)
  })
})
