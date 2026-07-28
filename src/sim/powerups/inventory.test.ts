import { describe, expect, it } from 'vitest'

import { spawnPlayer } from '../spawn'
import { createWorld } from '../world'
import { addPowerUp, readInventory, takeSlot } from './inventory'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

describe('inventaire', () => {
  it('démarre vide', () => {
    const w = setup()
    expect(readInventory(w)).toEqual([null, null, null])
  })

  it('remplit le premier emplacement libre', () => {
    const w = setup()
    expect(addPowerUp(w, 'blast')).toBe(true)
    expect(readInventory(w)).toEqual(['blast', null, null])
  })

  it('refuse quand les 3 emplacements sont pleins', () => {
    const w = setup()
    addPowerUp(w, 'blast')
    addPowerUp(w, 'freeze')
    addPowerUp(w, 'trail')
    expect(addPowerUp(w, 'dash')).toBe(false)
  })

  it("takeSlot vide l'emplacement et retourne le type", () => {
    const w = setup()
    addPowerUp(w, 'freeze')
    expect(takeSlot(w, 0)).toBe('freeze')
    expect(readInventory(w)).toEqual([null, null, null])
  })

  it('takeSlot sur un emplacement vide retourne null', () => {
    const w = setup()
    expect(takeSlot(w, 2)).toBe(null)
  })

  it('takeSlot hors bornes retourne null sans planter', () => {
    const w = setup()
    expect(takeSlot(w, 9)).toBe(null)
  })
})
