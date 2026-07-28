import { addComponent, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Dashing, Position, Velocity } from '../components'
import { spawnPlayer } from '../spawn'
import { createWorld } from '../world'
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

  // Borné des deux côtés à dessein : mesuré sur cette implémentation, 90% de la
  // vitesse max est atteint vers 50 ms (3 pas) et la vitesse plafonne à 240 dès
  // 67 ms (4 pas). Un test à borne unique (« au moins 90% avant X ms ») laisse
  // passer un accel deux fois plus rapide ou deux fois plus lent — exactement le
  // problème qui a fait dériver les constantes du plan sans que rien ne le
  // détecte. Si ce test échoue, le ressenti du mouvement a changé : c'est une
  // décision à assumer, pas un bug à corriger en relâchant l'assertion.
  it("n'atteint pas encore 90% de la vitesse max à ~33 ms", () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 2)
    expect(Velocity.x[w.playerEid]).toBeLessThan(240 * 0.9)
  })

  it('atteint 90% de la vitesse max à ~67 ms', () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 4)
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

  // Même logique côté freinage : mesuré ici, le joueur perd l'essentiel de sa
  // vitesse dès les deux premiers pas suivant le relâchement (arrêt vers 33-50 ms).
  // Borner uniquement « doit être arrêté avant X ms » laisserait passer une
  // friction deux fois plus faible (le joueur glisserait bien plus longtemps) tout
  // en interdisant de vérifier qu'il ne s'arrête pas *instantanément*. Un échec ici
  // signale un changement du ressenti, pas une régression à masquer.
  it("continue de bouger nettement ~17 ms après le relâchement de l'entrée", () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 30)
    w.input.moveX = 0
    stepN(w, 1)
    expect(Math.abs(Velocity.x[w.playerEid]!)).toBeGreaterThan(60)
  })

  it("est quasiment arrêté ~50 ms après le relâchement de l'entrée", () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 30)
    w.input.moveX = 0
    stepN(w, 3)
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
})
