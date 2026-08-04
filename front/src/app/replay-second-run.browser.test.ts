import { createRunWorld } from '@sim/run-world'
import { ARENA } from '@sim/world'
import { addEntity, removeEntity } from 'bitecs'
import { describe, expect, it } from 'vitest'

/**
 * Une partie ne doit pas dependre de celles qui l'ont precedee.
 *
 * bitECS alloue les `eid` depuis un compteur global au PROCESSUS et recycle
 * les identifiants liberes dans l'ordre des deces. L'ordre d'iteration des
 * requetes suit ces `eid`, et assez de systemes en dependent — qui meurt en
 * premier quand deux ennemis se chevauchent, qui ramasse un power-up — pour
 * que la trajectoire entiere change. Cet etat n'est ecrit dans aucun replay.
 *
 * Le rejeu serveur repartait d'un allocateur neuf ; le jeu enchainait les
 * parties sans jamais le remettre a zero. **Seule la premiere partie d'une
 * session etait donc verifiable** : les suivantes revenaient de production
 * avec « 2 choix enregistres, 0 fins de vague rencontrees », un message qui
 * accusait le replay plutot que cette asymetrie.
 *
 * Mesure sur la partie qui a servi au diagnostic (graine 703692027, 8 382
 * pas) : allocateur neuf, la vague 1 finit au pas 2476 et le score atteint
 * 6 404 ; avec 1 500 identifiants consommes puis recycles, la meme
 * trajectoire n'atteint aucune fin de vague et meurt a 4 188.
 *
 * Ce test epingle le MECANISME et non une consequence : trois tentatives de
 * garde par le score ont ete ecrites puis jetees, car elles restaient vertes
 * quand on retirait le correctif — une trajectoire scriptee n'est pas
 * forcement sensible a l'ordre des `eid`, et celle qui l'est n'etait pas
 * reproductible dans ce montage. L'identifiant du joueur, lui, l'est
 * toujours.
 */
describe('createRunWorld', () => {
  it('repart d\u2019un allocateur neuf, quoi qu\u2019il se soit joue avant', () => {
    const first = createRunWorld({ seed: 1, arena: ARENA })
    const fresh = first.playerEid

    // Ce qu'une partie precedente laisse derriere elle : des identifiants
    // consommes, puis liberes dans l'ordre des deces.
    const eids: number[] = []
    for (let i = 0; i < 1500; i++) {
      eids.push(addEntity(first))
    }
    for (let i = eids.length - 1; i >= 0; i -= 2) {
      const eid = eids[i]
      if (eid !== undefined) {
        removeEntity(first, eid)
      }
    }

    const second = createRunWorld({ seed: 1, arena: ARENA })
    expect(second.playerEid).toBe(fresh)
  })
})
