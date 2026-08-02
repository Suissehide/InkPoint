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

  it("garantit une mythique à la vague 10 si aucune n'est encore sortie et qu'il en existe une tirable", () => {
    // Le pool mythique est temporairement vide (retrait des trois mythiques,
    // remplaçantes dans un lot suivant) : la garantie ne doit alors rien
    // produire, sans planter pour autant — pas de faux positif une fois le
    // pool regarni.
    const hasMythic = UPGRADES.some((u) => u.rarity === 'mythic')
    const cards = drawUpgrades(createRng(3), baseState({ wave: 10, mythicTaken: false }))
    expect(cards.some((c) => c.rarity === 'mythic')).toBe(hasMythic)
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
})
