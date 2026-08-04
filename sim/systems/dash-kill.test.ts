import { addComponent, defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Dashing, Doomed, Enemy, Facing, Materializing, Position, Velocity } from '../components'
import { activatePowerUp } from '../powerups/activate'
import { PLAYER_SPEED, spawnEnemy, spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { ARENA, createWorld, FIXED_DT } from '../world'
import { collisionSystem } from './collision'
import { dashKillSystem } from './dash-kill'
import { deathSystem } from './death'
import { integrationSystem } from './integration'
import { playerMovementSystem } from './player-movement'

const enemies = defineQuery([Enemy])

// `ARENA`, pas une miniature : la ruée porte ~480 px, un monde trop petit
// ferait toucher le mur avant la fin de la ruée et mesurerait le plaquage au
// mur plutôt que la ruée elle-même.
const setup = () => {
  const w = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  spawnPlayer(w)
  return w
}

/** Position d'apparition du joueur : centre de l'arène. */
const playerAt = (w: ReturnType<typeof setup>) => ({
  x: Position.x[w.playerEid]!,
  y: Position.y[w.playerEid]!,
})

describe('dashKillSystem', () => {
  it('ne fait rien tant que le joueur ne porte pas Dashing', () => {
    const w = setup()
    const p = playerAt(w)
    const eid = spawnEnemy(w, { type: 'point', x: p.x, y: p.y, materializeMs: 0 })
    dashKillSystem(w, createRunStats())
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })

  it('tue un ennemi traversé pendant la ruée', () => {
    const w = setup()
    const p = playerAt(w)
    const eid = spawnEnemy(w, { type: 'point', x: p.x, y: p.y, materializeMs: 0 })
    addComponent(w, Dashing, w.playerEid)
    dashKillSystem(w, createRunStats())
    expect(hasComponent(w, Doomed, eid)).toBe(true)
  })

  it('épargne un ennemi hors de portée', () => {
    const w = setup()
    const p = playerAt(w)
    // 300 px, très au-delà des 77 px de portée de la ruée (dashRadius 70 + 7).
    const eid = spawnEnemy(w, { type: 'point', x: p.x + 300, y: p.y, materializeMs: 0 })
    addComponent(w, Dashing, w.playerEid)
    dashKillSystem(w, createRunStats())
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })

  it('épargne un ennemi en cours de matérialisation', () => {
    const w = setup()
    const p = playerAt(w)
    const eid = spawnEnemy(w, { type: 'point', x: p.x, y: p.y, materializeMs: 1000 })
    expect(hasComponent(w, Materializing, eid)).toBe(true)
    addComponent(w, Dashing, w.playerEid)
    dashKillSystem(w, createRunStats())
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })

  // Ennemi à 30 px : hors de portée du seul rayon du joueur (9+7=16), dans
  // celle de la ruée (dashRadius 70+7=77).
  it('tue à la portée de `dashRadius`, pas au rayon du joueur', () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 200
    const enemy = spawnEnemy(w, {
      type: 'point',
      x: Position.x[w.playerEid]! + 30,
      y: Position.y[w.playerEid]!,
      materializeMs: 0,
    })
    dashKillSystem(w, stats)
    expect(hasComponent(w, Doomed, enemy)).toBe(true)
  })

  it('ne tue pas au-delà de `dashRadius`', () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 200
    const enemy = spawnEnemy(w, {
      type: 'point',
      x: Position.x[w.playerEid]! + 200,
      y: Position.y[w.playerEid]!,
      materializeMs: 0,
    })
    dashKillSystem(w, stats)
    expect(hasComponent(w, Doomed, enemy)).toBe(false)
  })

  it('en séquence réelle : la ruée tue au passage sans que le joueur ne meure', () => {
    const w = setup()
    const stats = createRunStats()
    // Ennemi hors de portée au départ (60 px, rayons cumulés 16 px) : la mort
    // ne peut venir que du déplacement de la ruée, pas d'un contact à l'image 0.
    const p = playerAt(w)
    const eid = spawnEnemy(w, { type: 'point', x: p.x + 60, y: p.y, materializeMs: 0 })
    const initialDist = Math.hypot(p.x + 60 - p.x, p.y - p.y)
    expect(initialDist).toBeGreaterThan(16)

    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 220
    Dashing.vx[w.playerEid] = 720
    Dashing.vy[w.playerEid] = 0

    let killed = false
    for (let i = 0; i < 10 && !killed; i++) {
      playerMovementSystem(w)
      integrationSystem(w)
      dashKillSystem(w, stats)
      collisionSystem(w, stats)
      deathSystem(w, createRunStats())
      killed = !entityExists(w, eid)
    }

    expect(killed, 'la ruée aurait dû croiser et tuer l’ennemi sur sa trajectoire').toBe(true)
    expect(w.alive).toBe(true)
    expect(enemies(w)).toHaveLength(0)
  })

  /**
   * Garde la régression où, sur l'image où `Dashing` expire, la vitesse de
   * charge (720 px/s) fuitait un pas de plus sans jamais passer par le
   * plafond `maxSpeed` — tandis que `dashKillSystem` avait déjà cessé de tuer
   * pour le joueur et `collisionSystem` le rendait de nouveau vulnérable : il
   * mourait à pleine vitesse sur sa propre image de transition. L'invariant
   * vérifié directement (vitesse ≤ `maxSpeed` dès que `Dashing` est retiré)
   * plutôt qu'un ennemi-piège à distance fixe, dont la position n'isole plus
   * fiablement le bug depuis l'allongement du glissé (player-movement.test.ts).
   */
  it('la ruée ne tue plus son propre porteur sur son image de transition', () => {
    const w = setup()
    const stats = createRunStats()
    // Facing par défaut du joueur : -π/2 (vers le haut). On le remet à 0
    // (vers +x) pour raisonner sur une trajectoire simple et vérifiable.
    Facing.angle[w.playerEid] = 0

    const p = playerAt(w)
    const enemyA = spawnEnemy(w, { type: 'point', x: p.x + 60, y: p.y, materializeMs: 0 })

    activatePowerUp(w, 'dash', stats, p.x, p.y)
    expect(hasComponent(w, Dashing, w.playerEid)).toBe(true)

    let framesWithDash = 0
    let sawTerminalTransition = false
    let speedOnTerminalFrame = 0
    // durationMs=665, FIXED_DT≈16,667ms → 40 images actives avant la
    // transition ; marge de 4 images pour l'observer sans compte pile-poil.
    for (let i = 0; i < 44; i++) {
      const wasDashing = hasComponent(w, Dashing, w.playerEid)
      const remainingBefore = wasDashing ? Dashing.remaining[w.playerEid]! : 0

      playerMovementSystem(w)
      integrationSystem(w)
      dashKillSystem(w, stats)
      collisionSystem(w, stats)
      deathSystem(w, createRunStats())

      if (wasDashing) {
        framesWithDash++
        if (remainingBefore - FIXED_DT <= 0) {
          sawTerminalTransition = true
          speedOnTerminalFrame = Math.hypot(Velocity.x[w.playerEid]!, Velocity.y[w.playerEid]!)
        }
      }
      // Le joueur ne doit jamais mourir, ni pendant la ruée ni sur l'image où
      // elle se termine.
      expect(w.alive, `image ${i + 1} : le joueur est mort`).toBe(true)
    }

    expect(framesWithDash).toBeGreaterThan(0)
    expect(
      sawTerminalTransition,
      "l'image de transition (fin de la ruée) n'a jamais été observée",
    ).toBe(true)
    expect(hasComponent(w, Dashing, w.playerEid), 'la ruée aurait dû se terminer').toBe(false)
    expect(entityExists(w, enemyA), 'l’ennemi balayé en pleine ruée aurait dû mourir').toBe(false)
    // Garde-fou de l'assertion qui suit, et non un test du jeu : plaqué contre
    // un mur, `integrationSystem` remet la vitesse à zéro, et le plafond
    // ci-dessous deviendrait vrai quoi qu'il arrive — y compris si le bug
    // revenait. Exiger une vitesse non nulle rend l'assertion falsifiable :
    // elle mesure bien la ruée, pas un plaquage.
    expect(
      speedOnTerminalFrame,
      "l'image de transition a été mesurée à l'arrêt (mur ?) : le plafond ci-dessous ne prouverait plus rien",
    ).toBeGreaterThan(0)
    // C'est l'invariant que le bug violait : sur l'image de transition, la
    // vitesse de charge (720 px/s) ne doit plus jamais fuiter telle quelle,
    // elle doit déjà être passée par le plafond normal du joueur.
    expect(
      speedOnTerminalFrame,
      "la vitesse sur l'image de transition dépasse encore la vitesse de charge plafonnée",
    ).toBeLessThanOrEqual(PLAYER_SPEED + 0.5)
  })
})
