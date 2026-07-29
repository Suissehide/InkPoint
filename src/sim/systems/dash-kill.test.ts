import { addComponent, defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Dashing, Doomed, Enemy, Facing, Materializing, Velocity } from '../components'
import { activatePowerUp } from '../powerups/activate'
import { PLAYER_SPEED, spawnEnemy, spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT } from '../world'
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
    // Depuis le fix round 1, `Dashing` vaut à lui seul invulnérabilité pour
    // `collisionSystem` — plus de composant `Invulnerable` séparé à poser ici.

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

  /**
   * Fix round 1 : reproduit le scénario exact du relecteur.
   *
   * `Dashing` et `Invulnerable` avaient la même durée mais étaient décrémentés
   * par deux systèmes différents. Sur l'image où le minuteur s'épuise (l'image
   * 14 ici : dashDurationMs=220, FIXED_DT≈16,667ms → 13 images actives),
   * l'ancien code appliquait *encore* la vitesse de charge (720 px/s) avant de
   * retirer `Dashing` (le `continue` était inconditionnel) — le joueur
   * parcourait donc un 14ᵉ pas complet à 720 px/s, *sans jamais passer par le
   * plafond `maxSpeed`* (ce plafond n'est appliqué qu'après la branche
   * `Dashing`, que l'ancien code ne quittait jamais ce jour-là). Sur cette
   * même image, `dashKillSystem` voyait déjà `Dashing` absent (aucun ennemi
   * tué) tandis que `collisionSystem` voyait `Invulnerable` tout juste expiré
   * (le joueur mourait) — en plein panique-bouton, à pleine vitesse.
   *
   * Avec le fix, l'image 14 ne porte plus la vitesse de charge : `Dashing` est
   * retiré *avant* d'appliquer une vitesse, le mouvement normal reprend la
   * main dans la foulée et passe donc par le plafond `maxSpeed` dès cette
   * même image.
   *
   * Round 2 (playtest du glissé) : un ennemi placé au point exact que
   * l'ancien code atteignait à l'image 14 ne suffit plus à distinguer les deux
   * comportements. Le glissé plus long qui corrige le ressenti « trop sec »
   * (cf. player-movement.test.ts) fait qu'avec le code corrigé, le joueur finit
   * de toute façon par glisser jusqu'à quasiment ce même point quelques images
   * plus tard — l'écart entre « seul le bug l'atteint » et « le code corrigé
   * l'atteint aussi, mais plus tard » s'est réduit à moins d'un pixel. Un
   * ennemi-piège à distance fixe n'est donc plus un test fiable de ce bug
   * précis ; on vérifie directement l'invariant que le bug violait : la
   * vitesse ne doit jamais dépasser `maxSpeed` une fois `Dashing` retiré, pas
   * même sur l'image de transition.
   *
   * Un seul ennemi désormais :
   * - « A », balayé en pleine ruée (image 4, très loin de la transition) :
   *   prouve que la ruée continue de tuer ce qu'elle traverse.
   */
  it('la ruée ne tue plus son propre porteur sur son image de transition', () => {
    const w = setup()
    // Facing par défaut du joueur : -π/2 (vers le haut). On le remet à 0
    // (vers +x) pour raisonner sur une trajectoire simple et vérifiable.
    Facing.angle[w.playerEid] = 0

    const enemyA = spawnEnemy(w, { type: 'point', x: 460, y: 300, materializeMs: 0 })

    activatePowerUp(w, 'dash', createRunStats(), 400, 300)
    expect(hasComponent(w, Dashing, w.playerEid)).toBe(true)

    let framesWithDash = 0
    let sawTerminalTransition = false
    let speedOnTerminalFrame = 0
    for (let i = 0; i < 18; i++) {
      const wasDashing = hasComponent(w, Dashing, w.playerEid)
      const remainingBefore = wasDashing ? Dashing.remaining[w.playerEid]! : 0

      playerMovementSystem(w)
      integrationSystem(w)
      dashKillSystem(w)
      collisionSystem(w)
      deathSystem(w)

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
    // C'est l'invariant que le bug violait : sur l'image de transition, la
    // vitesse de charge (720 px/s) ne doit plus jamais fuiter telle quelle,
    // elle doit déjà être passée par le plafond normal du joueur.
    expect(
      speedOnTerminalFrame,
      "la vitesse sur l'image de transition dépasse encore la vitesse de charge plafonnée",
    ).toBeLessThanOrEqual(PLAYER_SPEED + 0.5)
  })
})
