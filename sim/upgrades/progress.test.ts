import { describe, expect, it } from 'vitest'

import { UPGRADES } from '../data/upgrades'
import { ARENA, createWorld, type SimWorld } from '../world'
import { absorbEvents, createRunProgress, takeUpgrade } from './progress'
import { createRunStats } from './stats'

function newWorld(): SimWorld {
  return createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
}

describe('RunProgress', () => {
  it('démarre vide', () => {
    const progress = createRunProgress()
    expect(progress.ownedIds).toEqual([])
    expect(progress.mythicTaken).toBe(false)
    expect(progress.seenPowerups.size).toBe(0)
  })

  it('retient les power-ups ramassés depuis les événements du pas', () => {
    const world = newWorld()
    const progress = createRunProgress()
    world.events.push({ type: 'powerupPicked', kind: 1 })
    absorbEvents(progress, world)
    expect(progress.seenPowerups.size).toBe(1)
  })

  it('ignore un genre inconnu plutôt que d’enregistrer `undefined`', () => {
    const world = newWorld()
    const progress = createRunProgress()
    // `POWERUP_BY_ID` est un tableau creux : un identifiant hors plage rend
    // `undefined`, et l'insérer empoisonnerait le tirage des cartes.
    world.events.push({ type: 'powerupPicked', kind: 250 })
    absorbEvents(progress, world)
    expect(progress.seenPowerups.size).toBe(0)
  })

  it('n’enregistre pas deux fois le même genre', () => {
    const world = newWorld()
    const progress = createRunProgress()
    world.events.push({ type: 'powerupPicked', kind: 1 })
    world.events.push({ type: 'powerupPicked', kind: 1 })
    absorbEvents(progress, world)
    expect(progress.seenPowerups.size).toBe(1)
  })

  it('applique une carte : effets dans stats, historique dans progress', () => {
    const stats = createRunStats()
    const progress = createRunProgress()
    const card = UPGRADES.find((c) => c.rarity !== 'mythic')
    if (card === undefined) {
      throw new Error('aucune carte non mythique')
    }
    const before = stats.moveSpeed

    takeUpgrade(card, stats, progress)

    expect(progress.ownedIds).toEqual([card.id])
    expect(progress.mythicTaken).toBe(false)
    // `apply` a bien tourné : au moins une valeur de `stats` a bougé, ou une
    // règle est apparue. On ne teste pas *quelle* carte fait quoi — c'est le
    // travail de `draw.test.ts` et des tests de power-ups.
    expect(stats.moveSpeed !== before || stats.rules.size > 0).toBe(true)
  })

  it('lève `mythicTaken` sur une carte mythique, et retient les doublons', () => {
    const stats = createRunStats()
    const progress = createRunProgress()
    const mythic = UPGRADES.find((c) => c.rarity === 'mythic')
    const common = UPGRADES.find((c) => c.rarity !== 'mythic')
    if (mythic === undefined || common === undefined) {
      throw new Error('catalogue incomplet')
    }

    takeUpgrade(common, stats, progress)
    takeUpgrade(common, stats, progress)
    takeUpgrade(mythic, stats, progress)

    expect(progress.ownedIds).toEqual([common.id, common.id, mythic.id])
    expect(progress.mythicTaken).toBe(true)
  })
})
