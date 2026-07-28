import { addComponent, defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Dashing, Doomed, Enemy, Invulnerable, Materializing } from '../components'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createWorld } from '../world'
import { collisionSystem } from './collision'
import { dashKillSystem } from './dash-kill'
import { deathSystem } from './death'
import { integrationSystem } from './integration'
import { playerMovementSystem } from './player-movement'

const enemies = defineQuery([Enemy])

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

describe('dashKillSystem', () => {
  it('ne fait rien tant que le joueur ne porte pas Dashing', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    dashKillSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })

  it('tue un ennemi traversé pendant la ruée', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    addComponent(w, Dashing, w.playerEid)
    dashKillSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(true)
  })

  it('épargne un ennemi hors de portée', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    addComponent(w, Dashing, w.playerEid)
    dashKillSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })

  // Comme pour les collisions et les zones : un ennemi en pointillé (embuscade
  // en cours de matérialisation) doit rester inoffensif ET invulnérable —
  // sinon la ruée devient un moyen de « farmer » les embuscades avant qu'elles
  // ne soient réellement en jeu.
  it('épargne un ennemi en cours de matérialisation', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 1000 })
    expect(hasComponent(w, Materializing, eid)).toBe(true)
    addComponent(w, Dashing, w.playerEid)
    dashKillSystem(w)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })

  /**
   * Ordre réel de la boucle (mouvement joueur → intégration → dashKill →
   * collisions → morts) : la ruée doit tuer l'ennemi qu'elle traverse tout en
   * laissant le joueur indemne, dans le MÊME pas où le contact a lieu — c'est
   * tout l'intérêt du panique-bouton. Preuve positive que le contact a bien
   * eu lieu (l'ennemi est sur la trajectoire) avant de vérifier l'issue,
   * sinon « le joueur survit » passerait aussi si rien ne s'était produit.
   */
  it('en séquence réelle : la ruée tue au passage sans que le joueur ne meure', () => {
    const w = setup()
    // Ennemi hors de portée au départ (60 px, rayons cumulés 16 px) : la mort
    // ne peut venir que du déplacement de la ruée qui va suivre, pas d'un
    // contact déjà existant à l'image 0.
    const eid = spawnEnemy(w, { type: 'point', x: 460, y: 300, materializeMs: 0 })
    const px0 = 400
    const py0 = 300
    const initialDist = Math.hypot(460 - px0, 300 - py0)
    expect(initialDist).toBeGreaterThan(16)

    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 220
    Dashing.vx[w.playerEid] = 720
    Dashing.vy[w.playerEid] = 0
    // La ruée rend invulnérable, comme le fait activatePowerUp (Task 11).
    addComponent(w, Invulnerable, w.playerEid)
    Invulnerable.remaining[w.playerEid] = 220

    let killed = false
    for (let i = 0; i < 10 && !killed; i++) {
      playerMovementSystem(w)
      integrationSystem(w)
      dashKillSystem(w)
      collisionSystem(w)
      deathSystem(w)
      killed = !entityExists(w, eid)
    }

    expect(killed, 'la ruée aurait dû croiser et tuer l’ennemi sur sa trajectoire').toBe(true)
    expect(w.alive).toBe(true)
    expect(enemies(w)).toHaveLength(0)
  })
})
