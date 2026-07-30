import { addComponent, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Frozen, Materializing, Position, Velocity } from '../components'
import { ENEMIES, MATERIALIZE_EDGE_MS } from '../data/enemies'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createWorld, FIXED_DT } from '../world'
import { freezeSystem } from './freeze'
import { homingSystem } from './homing'
import { integrationSystem } from './integration'
import { materializationSystem } from './materialization'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

const step = (w: ReturnType<typeof setup>) => {
  materializationSystem(w)
  homingSystem(w)
  integrationSystem(w)
  w.time += FIXED_DT
}

describe('materializationSystem', () => {
  it("garde l'ennemi immobile pendant l'apparition", () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 100, materializeMs: MATERIALIZE_EDGE_MS })
    for (let i = 0; i < 10; i++) {
      step(w)
    }
    expect(Position.x[eid]).toBe(100)
    expect(Position.y[eid]).toBe(100)
  })

  it('retire le composant Materializing à échéance et émet un événement', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 100, materializeMs: 100 })
    for (let i = 0; i < Math.ceil(100 / FIXED_DT) + 1; i++) {
      step(w)
    }
    expect(hasComponent(w, Materializing, eid)).toBe(false)
    expect(w.events.some((e) => e.type === 'enemyMaterialized' && e.eid === eid)).toBe(true)
  })
})

describe('homingSystem', () => {
  it("déplace l'ennemi vers le joueur une fois actif", () => {
    const w = setup()
    Position.x[w.playerEid] = 700
    Position.y[w.playerEid] = 300
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 300, materializeMs: 0 })
    const before = Position.x[eid]!
    for (let i = 0; i < 60; i++) {
      step(w)
    }
    expect(Position.x[eid]!).toBeGreaterThan(before)
  })

  /**
   * Ce test doit **discriminer**, pas seulement passer. Une première version
   * mesurait `vy` sur une seule image après téléportation et la comparait à un
   * seuil : elle passait aussi avec une implémentation lisant la position
   * courante, parce que le pilotage est limité par l'accélération et que `vy`
   * reste petit dans les deux cas. La signature qui distingue réellement les deux
   * est que `vy` vaut **exactement 0** tant que le retard court — l'ennemi vise
   * encore une ordonnée qu'il a déjà atteinte — puis devient non nul d'un coup.
   * Vérifié par sabotage volontaire : sans le retard, `vy` est non nul dès la
   * première image.
   */
  it('ignore le joueur pendant exactement la durée du retard', () => {
    const w = setup()
    // Joueur immobile à droite : l'historique se remplit, la poursuite s'établit sur X.
    Position.x[w.playerEid] = 700
    Position.y[w.playerEid] = 300
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    for (let i = 0; i < 60; i++) {
      step(w)
    }

    Velocity.y[eid] = 0
    Position.y[w.playerEid] = 50 // téléportation verticale brutale

    const delayFrames = Math.floor(ENEMIES.point.homingDelayMs / FIXED_DT)
    for (let i = 0; i < delayFrames - 1; i++) {
      step(w)
      expect(Velocity.y[eid], `image ${i} : l'ennemi ne doit pas encore réagir`).toBe(0)
    }

    for (let i = 0; i < 5; i++) {
      step(w)
    }
    expect(Math.abs(Velocity.y[eid]!)).toBeGreaterThan(0)
  })

  it('ne dépasse pas la vitesse max assignée', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 100, materializeMs: 0 })
    for (let i = 0; i < 600; i++) {
      step(w)
    }
    expect(Math.hypot(Velocity.x[eid]!, Velocity.y[eid]!)).toBeLessThanOrEqual(195.5)
  })

  /**
   * Ordre réel de la boucle : homing → intégration → gel. Sans `Not(Frozen)`
   * sur `hunters`, un ennemi gelé se verrait quand même attribuer une vitesse
   * par homingSystem, serait déplacé par integrationSystem, et seulement
   * ensuite remis à zéro par freezeSystem — une dérive d'une fraction de pixel
   * par image, alors qu'il est affiché comme parfaitement immobile.
   */
  it('un ennemi gelé ne dérive pas, même poursuivi puis intégré avant le gel', () => {
    const w = setup()
    // Loin du joueur pour maximiser la vitesse de poursuite assignée par homingSystem.
    Position.x[w.playerEid] = 700
    Position.y[w.playerEid] = 300
    const eid = spawnEnemy(w, { type: 'point', x: 100, y: 100, materializeMs: 0 })
    addComponent(w, Frozen, eid)
    Frozen.remaining[eid] = 5000

    const x0 = Position.x[eid]!
    const y0 = Position.y[eid]!

    for (let i = 0; i < 30; i++) {
      homingSystem(w)
      integrationSystem(w)
      freezeSystem(w)
      w.time += FIXED_DT
    }

    // Valeur exacte, pas une tolérance : une dérive d'une fraction de pixel
    // par image est précisément le défaut recherché, et une tolérance le masquerait.
    expect(Position.x[eid]).toBe(x0)
    expect(Position.y[eid]).toBe(y0)
  })
})
