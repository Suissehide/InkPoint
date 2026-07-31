import { describe, expect, it } from 'vitest'

import { Dasher, Homing, Position, Velocity } from '../components'
import {
  ENEMIES,
  SHARD_DASH_DURATION_MS,
  SHARD_DASH_SPEED,
  SHARD_TELEGRAPH_MS,
} from '../data/enemies'
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
   * Scrute chaque image plutôt que le seul état final : sur 400 pas, l'ennemi
   * a le temps d'enchaîner plusieurs cycles complets, donc une implémentation
   * qui supprimerait le télégraphe passerait quand même si on ne vérifiait
   * qu'à la fin. On exige en plus d'avoir vu le télégraphe au moins une fois,
   * pour ne pas passer par vacuité.
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

  /**
   * bitECS remet les champs de Homing à zéro au removeComponent (déclenchement
   * du télégraphe) et ne les restaure pas à l'addComponent (fin de charge) :
   * sans la ligne qui réécrit `Homing.delayMs` dans shardSystem, le délai de
   * visée retomberait silencieusement à 0, donnant une poursuite parfaite et
   * invisible à l'œil. Vérifie la valeur exacte après un cycle complet.
   */
  it('restaure le délai de visée exact après un cycle complet de charge', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'shard', x: 100, y: 300, materializeMs: 0 })
    // Force un cycle déterministe : déclenchement immédiat du télégraphe.
    Dasher.state[eid] = 1
    Dasher.timer[eid] = SHARD_TELEGRAPH_MS
    // Avance jusqu'à la fin du télégraphe (passage en charge).
    for (let i = 0; i < Math.ceil(SHARD_TELEGRAPH_MS / FIXED_DT) + 2; i++) {
      step(w)
    }
    expect(Dasher.state[eid]).toBe(2)
    // Avance jusqu'au retour en approche (état 0). La charge parcourt assez
    // de distance pour ramener le joueur dans le rayon de déclenchement, donc
    // l'ennemi peut repartir en télégraphe dès l'image suivante : on s'arrête
    // au tout premier passage à l'état 0 plutôt que de boucler un nombre fixe
    // d'images, pour ne pas dépasser cette fenêtre d'une seule image.
    let safety = 0
    while (Dasher.state[eid] !== 0 && safety < Math.ceil(SHARD_DASH_DURATION_MS / FIXED_DT) + 5) {
      step(w)
      safety++
    }
    expect(Dasher.state[eid]).toBe(0)
    expect(Homing.delayMs[eid]).toBe(ENEMIES.shard.homingDelayMs)
  })
})
