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

  /**
   * removeComponent(world, Homing, eid) (déclenchement du télégraphe) remet
   * les champs de Homing à zéro (reset=true par défaut côté bitECS 0.3.40),
   * et addComponent(world, Homing, eid) (retour en approche, fin de charge)
   * ne les restaure pas (reset=false par défaut) : sans la ligne
   * `Homing.delayMs[eid] = ENEMIES.shard.homingDelayMs` dans shardSystem,
   * le délai de visée retomberait silencieusement à 0 après le premier
   * cycle complet. Un délai de 0 donne une poursuite parfaite, sans latence
   * — exactement ce que le design entier de la visée retardée existe pour
   * empêcher — et c'est invisible à l'œil : un Éclat qui vise parfaitement
   * après sa charge ressemble juste à un Éclat qui vous a eu.
   * Ce test fait tourner un cycle complet (déclenchement → télégraphe →
   * charge → retour en approche) et vérifie la valeur *exacte* du délai
   * restauré, pas seulement qu'il soit non nul.
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

  /**
   * Sans cette prise en compte du Séchage, l'Éclat charge à 420 px/s même dans
   * la zone ralentie et l'effet paraît cassé (spec §3.4) : c'est le seul
   * ennemi qui pourrait la traverser sans jamais ressentir le ralentissement.
   * Preuve positive : `world.slowUntil` est bien réglé dans le futur (le
   * ralentissement est actif) avant de vérifier la vitesse de charge.
   */
  it('charge à vitesse réduite pendant le Séchage', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'shard', x: 600, y: 300, materializeMs: 0 })
    Dasher.state[eid] = 1
    Dasher.timer[eid] = SHARD_TELEGRAPH_MS
    w.slowUntil = w.time + 10_000
    expect(w.time).toBeLessThan(w.slowUntil)
    for (let i = 0; i < Math.ceil(SHARD_TELEGRAPH_MS / FIXED_DT) + 2; i++) {
      step(w)
    }
    expect(Dasher.state[eid]).toBe(2)
    const speed = Math.hypot(Velocity.x[eid]!, Velocity.y[eid]!)
    expect(speed).toBeCloseTo(SHARD_DASH_SPEED * 0.35, 0)
    expect(speed).toBeLessThan(SHARD_DASH_SPEED * 0.6)
  })
})
