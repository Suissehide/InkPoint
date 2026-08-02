import { addComponent, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Collider, Dashing, Invulnerable, Position, Velocity } from '../components'
import { spawnPlayer } from '../spawn'
import { createWorld, FIXED_DT } from '../world'
import { integrationSystem } from './integration'
import { playerMovementSystem } from './player-movement'

const world = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

const stepN = (w: ReturnType<typeof world>, n: number) => {
  for (let i = 0; i < n; i++) {
    playerMovementSystem(w)
    integrationSystem(w)
  }
}

describe('playerMovementSystem', () => {
  it("démarre immobile au centre de l'arène", () => {
    const w = world()
    expect(Position.x[w.playerEid]).toBe(400)
    expect(Position.y[w.playerEid]).toBe(300)
    expect(Velocity.x[w.playerEid]).toBe(0)
  })

  it('accélère dans la direction demandée', () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 5)
    expect(Velocity.x[w.playerEid]).toBeGreaterThan(0)
    expect(Position.x[w.playerEid]).toBeGreaterThan(400)
  })

  // Borné des deux côtés à dessein : un test à borne unique (« au moins 90%
  // avant X ms ») laisserait passer un accel deux fois plus rapide ou lent.
  it("n'atteint pas encore 90% de la vitesse max à ~100 ms", () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 6)
    expect(Velocity.x[w.playerEid]).toBeLessThan(240 * 0.9)
  })

  it('atteint 90% de la vitesse max à ~117 ms', () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 7)
    expect(Velocity.x[w.playerEid]).toBeGreaterThanOrEqual(240 * 0.9)
  })

  it('ne dépasse jamais 240 px/s en diagonale', () => {
    const w = world()
    w.input.moveX = 1
    w.input.moveY = 1
    stepN(w, 60)
    const speed = Math.hypot(Velocity.x[w.playerEid]!, Velocity.y[w.playerEid]!)
    expect(speed).toBeLessThanOrEqual(240.5)
  })

  // Même logique côté freinage : borner uniquement « arrêté avant X ms »
  // laisserait passer une friction plus faible sans jamais vérifier qu'il ne
  // s'arrête pas instantanément.
  it("continue de bouger nettement ~67 ms après le relâchement de l'entrée", () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 30)
    w.input.moveX = 0
    stepN(w, 4)
    expect(Math.abs(Velocity.x[w.playerEid]!)).toBeGreaterThan(60)
  })

  it("est quasiment arrêté ~83 ms après le relâchement de l'entrée", () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 30)
    w.input.moveX = 0
    stepN(w, 5)
    expect(Math.abs(Velocity.x[w.playerEid]!)).toBeLessThan(24)
  })

  it('est bloqué par les murs, sans rebond', () => {
    const w = world()
    w.input.moveX = -1
    stepN(w, 300)
    expect(Position.x[w.playerEid]).toBeGreaterThanOrEqual(0)
    expect(Position.x[w.playerEid]).toBeLessThan(20)
    expect(Velocity.x[w.playerEid]).toBe(0)
  })

  /**
   * La ruée écrase le contrôle : preuve positive (pas seulement une absence)
   * que l'entrée normale a bien été ignorée — on pousse une entrée qui, seule,
   * irait vers +x, et on vérifie que la vitesse suit quand même la direction
   * figée de la ruée (-y ici), pas l'entrée.
   */
  it('la ruée écrase la commande du joueur', () => {
    const w = world()
    w.input.moveX = 1
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 100
    Dashing.vx[w.playerEid] = 0
    Dashing.vy[w.playerEid] = -500
    stepN(w, 1)
    expect(Velocity.x[w.playerEid]).toBe(0)
    expect(Velocity.y[w.playerEid]).toBe(-500)
  })

  it('la ruée expire après sa durée et rend la main au joueur', () => {
    const w = world()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 10 // moins d'un pas (16,67 ms)
    Dashing.vx[w.playerEid] = 300
    Dashing.vy[w.playerEid] = 0
    stepN(w, 1)
    expect(hasComponent(w, Dashing, w.playerEid)).toBe(false)
  })

  // Grâce d'atterrissage (spec §4.1) : la Plume sert quand on est encerclé,
  // s'arrêter net au milieu de la foule ne doit plus être fatal. Deux pas
  // volontairement : le premier reste en pleine ruée (pas encore de grâce),
  // le second est celui de la transition où `Dashing` est retiré et
  // `Invulnerable` posé à la place.
  it('accorde une grâce à la fin de la ruée, pas pendant', () => {
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    spawnPlayer(w)
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = FIXED_DT * 2

    playerMovementSystem(w)
    expect(hasComponent(w, Invulnerable, w.playerEid)).toBe(false)

    playerMovementSystem(w)
    expect(hasComponent(w, Dashing, w.playerEid)).toBe(false)
    expect(hasComponent(w, Invulnerable, w.playerEid)).toBe(true)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(200, 0)
  })

  // Trois systèmes écrivent `Invulnerable.remaining` : waves.ts (500 ms),
  // collision.ts (1000 ms à la rupture du Halo) et cette grâce (200 ms).
  // Écrire sans comparer raccourcirait la plus longue : la grâce doit
  // allonger, jamais tronquer.
  it("n'écourte pas une invulnérabilité plus longue déjà en cours", () => {
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    spawnPlayer(w)
    addComponent(w, Invulnerable, w.playerEid)
    Invulnerable.remaining[w.playerEid] = 820
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = FIXED_DT

    playerMovementSystem(w)

    expect(hasComponent(w, Dashing, w.playerEid)).toBe(false)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(820, 0)
  })

  // Sans cette coupure, playerMovementSystem réécrirait Velocity depuis
  // Dashing à chaque image et le joueur resterait garé contre le mur,
  // immobile mais invulnérable et tuant dans son rayon.
  it('termine la ruée quand le mur bloque toute sa vitesse', () => {
    const w = world()
    const p = w.playerEid
    Position.y[p] = 9 // rayon du joueur : collé au mur du haut
    addComponent(w, Dashing, p)
    Dashing.remaining[p] = 500
    Dashing.vx[p] = 0
    Dashing.vy[p] = -720 // pousse dans le mur

    playerMovementSystem(w)

    expect(hasComponent(w, Dashing, p)).toBe(false)
    // La coupure passe par le même chemin de sortie que l'expiration normale,
    // donc la grâce d'atterrissage est accordée ici aussi — sans quoi on
    // relâcherait le joueur sans protection contre le mur, précisément là où
    // la foule s'accumule.
    expect(hasComponent(w, Invulnerable, p)).toBe(true)
  })

  it('termine la ruée dès qu’un mur bloque une seule de ses composantes', () => {
    // Même situation que l'ancien test « laisse filer une ruée qui rase le
    // mur » : oblique, collée à la paroi gauche. Elle avançait encore le long
    // du mur ; elle doit désormais s'arrêter au contact.
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    const p = spawnPlayer(w)
    Position.x[p] = Collider.radius[p]!
    Position.y[p] = 300
    addComponent(w, Dashing, p)
    Dashing.remaining[p] = 400
    Dashing.vx[p] = -600
    Dashing.vy[p] = -600

    playerMovementSystem(w)

    expect(hasComponent(w, Dashing, p)).toBe(false)
  })

  it('ne coupe pas une ruée parfaitement horizontale loin de tout mur', () => {
    // `vy === 0` ne doit PAS compter comme « bloqué par un mur » : c'est une
    // composante qui n'avance pas, pas une composante arrêtée par une paroi.
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    const p = spawnPlayer(w)
    Position.x[p] = 400
    Position.y[p] = 300
    addComponent(w, Dashing, p)
    Dashing.remaining[p] = 400
    Dashing.vx[p] = 600
    Dashing.vy[p] = 0

    playerMovementSystem(w)

    expect(hasComponent(w, Dashing, p)).toBe(true)
  })
})
