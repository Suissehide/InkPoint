import { addComponent, addEntity, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Hazard, Lifetime, Position, PrevPosition, Velocity } from '../components'
import { HAZARD_TRAIL } from '../data/powerups'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createWorld } from '../world'
import { hazardSystem } from './hazards'
import { trailSystem } from './trail'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

function makeTrailHazard(w: ReturnType<typeof setup>, x: number, y: number) {
  const eid = addEntity(w)
  addComponent(w, Position, eid)
  addComponent(w, Hazard, eid)
  addComponent(w, Lifetime, eid)
  addComponent(w, Velocity, eid)
  // Comme dans activatePowerUp : seule la traînée bouge, donc seule elle a
  // besoin de PrevPosition pour que le rendu puisse l'interpoler.
  addComponent(w, PrevPosition, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  PrevPosition.x[eid] = x
  PrevPosition.y[eid] = y
  Hazard.kind[eid] = HAZARD_TRAIL
  Hazard.radius[eid] = 12
  Hazard.maxRadius[eid] = 12
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = 3000
  return eid
}

describe('trailSystem', () => {
  it('recopie la position du joueur sur la zone de traînée à chaque pas', () => {
    const w = setup()
    const hid = makeTrailHazard(w, 0, 0)
    Position.x[w.playerEid] = 250
    Position.y[w.playerEid] = 175
    trailSystem(w)
    expect(Position.x[hid]).toBe(250)
    expect(Position.y[hid]).toBe(175)

    Position.x[w.playerEid] = 90
    Position.y[w.playerEid] = 500
    trailSystem(w)
    expect(Position.x[hid]).toBe(90)
    expect(Position.y[hid]).toBe(500)
  })

  /**
   * Le rendu interpole entre PrevPosition et Position (Task 15) : sans un pas
   * de retard exact, la traînée — la seule zone qui bouge — décrocherait
   * visiblement du joueur, lui-même interpolé, sur un écran à haut framerate.
   */
  it('PrevPosition accuse un pas de retard exact sur Position pendant que le joueur bouge', () => {
    const w = setup()
    const hid = makeTrailHazard(w, 0, 0)

    Position.x[w.playerEid] = 250
    Position.y[w.playerEid] = 175
    trailSystem(w)
    expect(Position.x[hid]).toBe(250)
    expect(Position.y[hid]).toBe(175)
    // Avant ce premier pas, la zone était encore à l'origine : PrevPosition
    // doit refléter cet état d'avant-pas, pas la nouvelle position.
    expect(PrevPosition.x[hid]).toBe(0)
    expect(PrevPosition.y[hid]).toBe(0)

    Position.x[w.playerEid] = 90
    Position.y[w.playerEid] = 500
    trailSystem(w)
    expect(Position.x[hid]).toBe(90)
    expect(Position.y[hid]).toBe(500)
    // PrevPosition doit maintenant valoir la position du pas précédent (250, 175).
    expect(PrevPosition.x[hid]).toBe(250)
    expect(PrevPosition.y[hid]).toBe(175)
  })

  it("n'affecte pas les zones qui ne sont pas des traînées", () => {
    const w = setup()
    const other = addEntity(w)
    addComponent(w, Position, other)
    addComponent(w, Hazard, other)
    Position.x[other] = 10
    Position.y[other] = 10
    Hazard.kind[other] = 99
    Position.x[w.playerEid] = 700
    Position.y[w.playerEid] = 500
    trailSystem(w)
    expect(Position.x[other]).toBe(10)
    expect(Position.y[other]).toBe(10)
  })

  /**
   * Enchaîné avec hazardSystem dans l'ordre réel (traînée d'abord, zones
   * ensuite) : la traînée ne devient une menace qu'en suivant le joueur —
   * preuve positive qu'un ennemi loin de la position d'origine, mais sur le
   * chemin du joueur, meurt une fois la zone recopiée sur cette position.
   */
  it('suit le joueur puis tue un ennemi désormais dans la zone (ordre réel)', () => {
    const w = setup()
    const hid = makeTrailHazard(w, 0, 0)
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    // Avant le suivi, l'ennemi est loin de la zone (à l'origine) : elle ne
    // devrait pas encore le toucher.
    hazardSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(false)

    Position.x[w.playerEid] = 400
    Position.y[w.playerEid] = 300
    trailSystem(w)
    expect(Position.x[hid]).toBe(400)

    hazardSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(true)
  })
})
