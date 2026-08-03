import { describe, expect, it } from 'vitest'

import { POWERUP_KINDS } from '../data/powerups'
import { UPGRADES } from '../data/upgrades'
import { createRng } from '../rng'
import { type DrawState, drawUpgrades } from './draw'

const baseState = (over: Partial<DrawState> = {}): DrawState => ({
  wave: 1,
  ownedIds: [],
  mythicTaken: false,
  seenPowerups: new Set(POWERUP_KINDS),
  ...over,
})

describe('drawUpgrades', () => {
  it('renvoie exactement 3 cartes', () => {
    expect(drawUpgrades(createRng(1), baseState())).toHaveLength(3)
  })

  it('ne propose jamais deux fois la même carte', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ids = drawUpgrades(createRng(seed), baseState()).map((u) => u.id)
      expect(new Set(ids).size).toBe(3)
    }
  })

  it('est déterministe pour une graine donnée', () => {
    const a = drawUpgrades(createRng(7), baseState()).map((u) => u.id)
    const b = drawUpgrades(createRng(7), baseState()).map((u) => u.id)
    expect(a).toEqual(b)
  })

  it('ne propose aucune mythique si une a déjà été prise', () => {
    for (let seed = 0; seed < 60; seed++) {
      const cards = drawUpgrades(createRng(seed), baseState({ mythicTaken: true, wave: 12 }))
      expect(cards.every((c) => c.rarity !== 'mythic')).toBe(true)
    }
  })

  it("garantit une mythique à la vague 10 si aucune n'est encore sortie", () => {
    const cards = drawUpgrades(createRng(3), baseState({ wave: 10, mythicTaken: false }))
    expect(cards.some((c) => c.rarity === 'mythic')).toBe(true)
  })

  it("n'améliore jamais un power-up jamais rencontré", () => {
    const state = baseState({ seenPowerups: new Set(['blast'] as const) })
    for (let seed = 0; seed < 60; seed++) {
      for (const card of drawUpgrades(createRng(seed), state)) {
        if (card.requires) {
          expect(card.requires).toBe('blast')
        }
      }
    }
  })

  it('ne repropose pas une carte non cumulable déjà possédée', () => {
    // N'importe quelle carte non cumulable convient à ce test ; les mythiques
    // en sont temporairement dépourvues (voir le test de pitié ci-dessus).
    const unique = UPGRADES.find((u) => !u.stackable)
    if (!unique) {
      throw new Error('aucune carte non cumulable définie')
    }
    const state = baseState({ ownedIds: [unique.id], wave: 12 })
    for (let seed = 0; seed < 40; seed++) {
      const ids = drawUpgrades(createRng(seed), state).map((u) => u.id)
      expect(ids).not.toContain(unique.id)
    }
  })

  it('pondère vers le build en cours', () => {
    // 40 cartes de gel possédées : le gel doit dominer largement les tirages.
    const owned = Array.from({ length: 40 }, () => 'freeze-radius')
    let freezeCards = 0
    let total = 0
    for (let seed = 0; seed < 100; seed++) {
      for (const card of drawUpgrades(createRng(seed), baseState({ ownedIds: owned }))) {
        total++
        if (card.requires === 'freeze') {
          freezeCards++
        }
      }
    }
    expect(freezeCards / total).toBeGreaterThan(0.3)
  })

  it('reste robuste si peu de cartes sont éligibles', () => {
    const state = baseState({ seenPowerups: new Set() })
    expect(drawUpgrades(createRng(1), state).length).toBeGreaterThan(0)
  })

  /**
   * Constaté en jeu : une vague traversée sans ramasser une seule pastille
   * laisse `seenPowerups` vide, donc 14 des 18 cartes inéligibles. Les quatre
   * survivantes sont `light-step` et les trois mythiques — celles-ci sont sans
   * `requires` exprès, pour que la garantie de pitié ait toujours de quoi
   * donner. Trois places à pourvoir dans ce vivier forçaient arithmétiquement
   * deux mythiques : `RARITY_WEIGHT` décide lesquelles, jamais combien, dès que
   * le vivier est plus petit que l'offre.
   */
  it("n'inonde pas l'offre de mythiques quand aucune pastille n'a été ramassée", () => {
    const state = baseState({ seenPowerups: new Set() })
    const TIRAGES = 300
    let saturees = 0
    for (let seed = 1; seed <= TIRAGES; seed++) {
      const mythiques = drawUpgrades(createRng(seed), state).filter((c) => c.rarity === 'mythic')
      if (mythiques.length >= 2) {
        saturees++
      }
    }
    // Le seuil porte sur un taux et non sur un plafond dur : deux mythiques
    // dans la même offre restent possibles une fois le vivier rendu complet,
    // c'est le hasard normal des pondérations. Ce qui ne doit plus arriver,
    // c'est que ce soit la règle — avant le filet, 100 % des offres.
    expect(saturees / TIRAGES).toBeLessThan(0.05)
  })

  /**
   * La suite du même trou : la mythique prise, `mythicTaken` écarte les deux
   * autres et il ne restait que `light-step`, donc **une seule carte offerte**.
   * Le test « reste robuste » ci-dessus ne l'a pas vu — il n'exigeait qu'une
   * carte, et une carte, il y en avait bien une.
   */
  it("offre trois cartes même quand la condition de power-up n'en laisse qu'une", () => {
    const state = baseState({
      wave: 2,
      seenPowerups: new Set(),
      mythicTaken: true,
      ownedIds: ['tracing-paper'],
    })
    for (let seed = 1; seed <= 200; seed++) {
      expect(drawUpgrades(createRng(seed), state), `graine ${seed}`).toHaveLength(3)
    }
  })

  /**
   * Le prix assumé du filet, énoncé plutôt que déduit de ses conséquences : à
   * vivier affamé, on se voit proposer des cartes de power-ups jamais croisés.
   * La règle de saveur cède, elle ne disparaît pas — le test « n'améliore
   * jamais un power-up jamais rencontré » ci-dessus la garde intacte dès que le
   * vivier permet de la tenir.
   */
  it('propose des cartes de power-ups jamais croisés plutôt qu’une offre dégénérée', () => {
    const state = baseState({ seenPowerups: new Set() })
    const conditionnees = drawUpgrades(createRng(1), state).filter((c) => c.requires)
    expect(conditionnees.length).toBeGreaterThan(0)
  })
})
