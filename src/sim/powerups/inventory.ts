import { Inventory } from '../components'
import { INVENTORY_SIZE, POWERUP_BY_ID, POWERUP_ID, type PowerUpKind } from '../data/powerups'
import type { SimWorld } from '../world'

export function readInventory(world: SimWorld): (PowerUpKind | null)[] {
  const slots = Inventory.slots[world.playerEid]
  if (!slots) {
    return [null, null, null]
  }
  return Array.from(slots, (id) => POWERUP_BY_ID[id] ?? null)
}

export function addPowerUp(world: SimWorld, kind: PowerUpKind): boolean {
  const slots = Inventory.slots[world.playerEid]
  if (!slots) {
    return false
  }

  for (let i = 0; i < INVENTORY_SIZE; i++) {
    if (slots[i] === 0) {
      slots[i] = POWERUP_ID[kind]
      world.events.push({ type: 'powerupPicked', kind: POWERUP_ID[kind], slot: i })
      return true
    }
  }
  return false
}

export function takeSlot(world: SimWorld, index: number): PowerUpKind | null {
  const slots = Inventory.slots[world.playerEid]
  if (!slots || index < 0 || index >= INVENTORY_SIZE) {
    return null
  }
  const id = slots[index]
  if (!id) {
    return null
  }
  slots[index] = 0
  return POWERUP_BY_ID[id] ?? null
}
