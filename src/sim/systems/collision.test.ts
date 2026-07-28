import { addComponent, defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Enemy, Halo, Invulnerable, Position, Velocity } from '../components'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createWorld, type SimWorld } from '../world'
import { collisionSystem } from './collision'
import { deathSystem } from './death'

const enemies = defineQuery([Enemy])

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  return w
}

const step = (w: ReturnType<typeof setup>) => {
  collisionSystem(w)
  deathSystem(w)
}

// Helper local : marque un ennemi pour la mort, comme le feraient les zones mortelles.
function killEnemy(w: SimWorld, eid: number) {
  addComponent(w, Doomed, eid)
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
})

describe('deathSystem', () => {
  it('scinde une Tache en 3 Points', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'blot', x: 200, y: 200, materializeMs: 0 })
    killEnemy(w, eid)
    deathSystem(w)
    expect(enemies(w).length).toBe(3)
    for (const e of enemies(w)) {
      expect(Enemy.type[e]).toBe(0)
    }
  })

  it('ne scinde pas un Point', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 200, y: 200, materializeMs: 0 })
    killEnemy(w, eid)
    deathSystem(w)
    expect(enemies(w).length).toBe(0)
  })

  it('émet enemyKilled avec la position de la mort', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 210, y: 220, materializeMs: 0 })
    killEnemy(w, eid)
    deathSystem(w)
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
    deathSystem(w)
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
    deathSystem(w)
    const children = enemies(w)
    expect(children.length).toBe(3)
    for (const child of children) {
      expect(entityExists(w, child)).toBe(true)
      expect(hasComponent(w, Doomed, child)).toBe(false)
    }
  })
})
