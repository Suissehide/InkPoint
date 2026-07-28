import type { PowerUpKind } from '../data/powerups'
import {
  MYTHIC_PITY_WAVE,
  RARITY_WEIGHT,
  type Rarity,
  UPGRADES,
  type UpgradeDef,
} from '../data/upgrades'
import type { Rng } from '../rng'

export interface DrawState {
  wave: number
  /** Ids des cartes déjà prises, doublons compris — sert à la pondération. */
  ownedIds: string[]
  mythicTaken: boolean
  seenPowerups: Set<PowerUpKind>
}

const CHOICES = 3

/** Plafond du bonus de pondération : la pondération oriente, elle ne verrouille pas. */
const AFFINITY_CAP = 3
/** Poids gagné par carte déjà possédée sur le power-up correspondant. */
const AFFINITY_PER_CARD = 0.5

function isEligible(card: UpgradeDef, state: DrawState, taken: Set<string>): boolean {
  if (taken.has(card.id)) {
    return false
  }
  if (!card.stackable && state.ownedIds.includes(card.id)) {
    return false
  }
  if (card.rarity === 'mythic' && state.mythicTaken) {
    return false
  }
  if (card.requires && !state.seenPowerups.has(card.requires)) {
    return false
  }
  return true
}

/**
 * Pondération vers le build en cours : chaque carte déjà prise sur un power-up
 * augmente le poids des autres cartes de ce power-up. Sans ça, les builds se
 * dispersent et aucun n'atteint le seuil où il devient satisfaisant (spec §3.5).
 */
function buildAffinity(state: DrawState): Map<PowerUpKind, number> {
  const affinity = new Map<PowerUpKind, number>()
  for (const id of state.ownedIds) {
    const card = UPGRADES.find((u) => u.id === id)
    if (!card?.requires) {
      continue
    }
    affinity.set(card.requires, (affinity.get(card.requires) ?? 0) + 1)
  }
  return affinity
}

function weightOf(card: UpgradeDef, affinity: Map<PowerUpKind, number>): number {
  const base = RARITY_WEIGHT[card.rarity]
  if (!card.requires) {
    return base
  }
  const bonus = Math.min(AFFINITY_CAP, (affinity.get(card.requires) ?? 0) * AFFINITY_PER_CARD)
  return base * (1 + bonus)
}

function pickWeighted(
  rng: Rng,
  pool: UpgradeDef[],
  affinity: Map<PowerUpKind, number>,
): UpgradeDef | null {
  if (pool.length === 0) {
    return null
  }
  const total = pool.reduce((sum, c) => sum + weightOf(c, affinity), 0)
  let roll = rng.next() * total
  for (const card of pool) {
    roll -= weightOf(card, affinity)
    if (roll <= 0) {
      return card
    }
  }
  return pool[pool.length - 1] ?? null
}

export function drawUpgrades(rng: Rng, state: DrawState): UpgradeDef[] {
  const affinity = buildAffinity(state)
  const taken = new Set<string>()
  const result: UpgradeDef[] = []

  const pool = (rarity?: Rarity): UpgradeDef[] =>
    UPGRADES.filter((c) => isEligible(c, state, taken) && (!rarity || c.rarity === rarity))

  // Garantie de pitié : une mythique au plus tard à la vague 10 (spec §3.5).
  if (!state.mythicTaken && state.wave >= MYTHIC_PITY_WAVE) {
    const mythic = pickWeighted(rng, pool('mythic'), affinity)
    if (mythic) {
      taken.add(mythic.id)
      result.push(mythic)
    }
  }

  while (result.length < CHOICES) {
    const card = pickWeighted(rng, pool(), affinity)
    if (!card) {
      break
    }
    taken.add(card.id)
    result.push(card)
  }

  return result
}
