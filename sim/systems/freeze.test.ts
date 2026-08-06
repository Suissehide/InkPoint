import { addComponent, defineQuery, entityExists } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Enemy, Frozen, Position } from '../components'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { stepWorld } from '../step'
import { createRunStats } from '../upgrades/stats'
import { createWorld } from '../world'

const enemies = defineQuery([Enemy])

/**
 * Traverser un ennemi gelé le tue : le gel fait du joueur lui-même une arme
 * (spec §3.4). Encore faut-il qu'il y survive.
 *
 * La Tache se scindait alors en 3 Points, nés à 18 px du cadavre et déjà
 * solides. Le joueur qui venait de la tuer au contact se tenait forcément à
 * moins de 23 px de ce cadavre (9 + 14), et son rayon de contact avec un Point
 * est de 16 (9 + 7) : selon l'angle d'approche, un enfant naissait donc DANS le
 * joueur, qui mourait au pas suivant. D'où le « parfois » du signalement — les
 * trois enfants naissaient à des angles fixes (0°, 120°, 240°), et une approche
 * pile au centre les mettait tous les trois à 18 px, hors de portée.
 *
 * La Ruée, l'autre façon de tuer au contact, n'a jamais eu le problème : elle
 * court-circuite les collisions tant qu'elle dure, puis accorde 200 ms de grâce
 * d'atterrissage. La traversée d'un gelé n'accordait rien.
 *
 * Le test balaie les angles d'approche plutôt que d'en fixer un : c'était
 * précisément la variable dont dépendait la mort.
 */
describe('traverser un ennemi gelé', () => {
  const APPROCHES = 12

  for (const type of ['point', 'shard', 'blot'] as const) {
    it(`tue une ${type} sans rien faire naître, sous tous les angles`, () => {
      for (let i = 0; i < APPROCHES; i++) {
        const angle = (i / APPROCHES) * Math.PI * 2
        const w = createWorld({ seed: 1, width: 800, height: 600 })
        spawnPlayer(w)
        const stats = createRunStats()

        // 10 px du centre : assez pour déclencher la mise à mort au contact
        // avec les trois gabarits, assez décalé pour ne pas retomber sur le
        // cas particulier du centre exact.
        Position.x[w.playerEid] = 400 + Math.cos(angle) * 10
        Position.y[w.playerEid] = 300 + Math.sin(angle) * 10

        const gele = spawnEnemy(w, { type, x: 400, y: 300, materializeMs: 0 })
        addComponent(w, Frozen, gele)
        Frozen.remaining[gele] = 3000

        stepWorld(w, stats)
        expect(entityExists(w, gele)).toBe(false)
        // L'invariant qui compte : la mort d'un ennemi ne fait naître aucun
        // ennemi. Vérifié ici plutôt que sur la seule survie du joueur, car il
        // ne dépend d'aucun réglage de vague ni d'aucune vitesse.
        expect(enemies(w).length).toBe(0)

        // Et le joueur, immobile, reste en vie bien après.
        for (let pas = 0; pas < 30; pas++) {
          stepWorld(w, stats)
        }
        expect(w.alive).toBe(true)
      }
    })
  }
})
