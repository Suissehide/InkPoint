import { describe, expect, it } from 'vitest'

import { Dasher, Position, Velocity } from '../components'
import { SHARD_DASH_SPEED, SHARD_TELEGRAPH_MS } from '../data/enemies'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createWorld, FIXED_DT } from '../world'
import { homingSystem } from './homing'
import { integrationSystem } from './integration'
import { shardSystem } from './shard'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 700
  Position.y[w.playerEid] = 300
  return w
}

const step = (w: ReturnType<typeof setup>) => {
  shardSystem(w)
  homingSystem(w)
  integrationSystem(w)
  w.time += FIXED_DT
}

describe('shardSystem', () => {
  /**
   * Version originale du brief : elle bouclait 400 fois puis ne vérifiait
   * l'immobilité que *si* l'état final était 1 — sur ce nombre de pas,
   * l'ennemi a largement le temps d'enchaîner approche → télégraphe → charge
   * → nouvelle approche, si bien que l'état final observé est aussi
   * plausiblement 0 ou 2. Une implémentation qui supprimerait totalement le
   * télégraphe (état 1 jamais atteint) passait quand même, car l'assertion
   * ne s'exécutait simplement jamais. Ici on scrute chaque image de la
   * boucle : dès que l'état 1 apparaît, la vitesse doit être *exactement*
   * nulle cette image-là, et on exige d'avoir vu le télégraphe au moins une
   * fois. Vérifié par sabotage : en retirant la remise à zéro de Velocity au
   * moment du déclenchement (transition état 0 → 1) dans shardSystem, ce test
   * échoue bien (vitesse ~145 observée en télégraphe, l'élan de l'approche
   * n'étant jamais coupé) — la remise à zéro dans la branche `state === 1`
   * elle-même n'est, elle, pas discriminante ici : une fois Homing retiré
   * plus rien d'autre ne touche à la vitesse, donc la supprimer seule ne fait
   * pas échouer ce test précis ; elle reste nécessaire pour couvrir le cas où
   * un appelant force `Dasher.state` à 1 directement (cf. les deux tests
   * suivants, qui font exactement cela).
   */
  it("passe en télégraphe et s'immobilise", () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'shard', x: 100, y: 300, materializeMs: 0 })
    let sawTelegraph = false
    // Approche jusqu'au déclenchement du télégraphe (et au-delà).
    for (let i = 0; i < 400; i++) {
      step(w)
      if (Dasher.state[eid] === 1) {
        sawTelegraph = true
        expect(Math.hypot(Velocity.x[eid]!, Velocity.y[eid]!), `image ${i} en télégraphe`).toBe(0)
      }
    }
    expect(sawTelegraph, "le télégraphe n'a jamais été observé sur la fenêtre de test").toBe(true)
  })

  it('charge à 420 px/s après le télégraphe', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'shard', x: 600, y: 300, materializeMs: 0 })
    Dasher.state[eid] = 1
    Dasher.timer[eid] = SHARD_TELEGRAPH_MS
    for (let i = 0; i < Math.ceil(SHARD_TELEGRAPH_MS / FIXED_DT) + 2; i++) {
      step(w)
    }
    expect(Dasher.state[eid]).toBe(2)
    expect(Math.hypot(Velocity.x[eid]!, Velocity.y[eid]!)).toBeCloseTo(SHARD_DASH_SPEED, 0)
  })

  it('ne corrige pas sa trajectoire pendant la charge', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'shard', x: 600, y: 300, materializeMs: 0 })
    Dasher.state[eid] = 1
    Dasher.timer[eid] = 0
    step(w)
    const vx = Velocity.x[eid]!
    const vy = Velocity.y[eid]!
    // Le joueur se téléporte : la charge doit ignorer le changement.
    Position.y[w.playerEid] = 50
    step(w)
    expect(Velocity.x[eid]!).toBeCloseTo(vx, 1)
    expect(Velocity.y[eid]!).toBeCloseTo(vy, 1)
  })
})
