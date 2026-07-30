import type { RunStats } from '../upgrades/stats'
import type { PowerUpKind } from './powerups'

export type Rarity = 'common' | 'rare' | 'mythic'

export interface UpgradeDef {
  id: string
  rarity: Rarity
  /** Power-up que cette carte améliore ; la carte n'apparaît que s'il a été rencontré. */
  requires?: PowerUpKind
  /** Cumulable plusieurs fois dans une run. Les rares et mythiques ne le sont pas. */
  stackable: boolean
  apply(stats: RunStats): void
}

/**
 * Les cartes sont des données. En ajouter une ne touche aucun système (spec §3.5).
 * Les clés i18n sont dérivées de l'id : `upgrade.<id>.name` et `upgrade.<id>.desc`.
 */
export const UPGRADES: UpgradeDef[] = [
  // ── Communes : modifient un chiffre ────────────────────────────────────────
  {
    id: 'light-step',
    rarity: 'common',
    stackable: true,
    apply: (s) => {
      s.moveSpeed *= 1.12
    },
  },
  {
    id: 'blast-radius',
    rarity: 'common',
    stackable: true,
    requires: 'blast',
    apply: (s) => {
      s.blastRadius *= 1.2
    },
  },
  {
    id: 'blast-linger',
    rarity: 'common',
    stackable: true,
    requires: 'blast',
    apply: (s) => {
      s.blastLingerMs += 250
    },
  },
  {
    id: 'freeze-radius',
    rarity: 'common',
    stackable: true,
    requires: 'freeze',
    apply: (s) => {
      s.freezeRadius *= 1.2
    },
  },
  {
    id: 'freeze-duration',
    rarity: 'common',
    stackable: true,
    requires: 'freeze',
    apply: (s) => {
      s.freezeDurationMs += 800
    },
  },
  {
    id: 'trail-duration',
    rarity: 'common',
    stackable: true,
    requires: 'trail',
    apply: (s) => {
      s.trailDurationMs += 900
    },
  },
  {
    id: 'strike-width',
    rarity: 'common',
    stackable: true,
    requires: 'strike',
    apply: (s) => {
      s.strikeWidth *= 1.35
    },
  },
  {
    id: 'blotter-radius',
    rarity: 'common',
    stackable: true,
    requires: 'blotter',
    apply: (s) => {
      s.blotterRadius *= 1.25
    },
  },
  {
    id: 'dash-duration',
    rarity: 'common',
    stackable: true,
    requires: 'dash',
    apply: (s) => {
      s.dashDurationMs += 60
    },
  },
  {
    id: 'dryspell-duration',
    rarity: 'common',
    stackable: true,
    requires: 'dryspell',
    apply: (s) => {
      s.dryspellDurationMs += 1200
    },
  },

  // ── Rares : modifient un comportement ──────────────────────────────────────
  {
    id: 'shockwave',
    rarity: 'rare',
    stackable: false,
    requires: 'blast',
    apply: (s) => {
      s.rules.add('shockwave')
    },
  },
  {
    id: 'creeping-frost',
    rarity: 'rare',
    stackable: false,
    requires: 'freeze',
    apply: (s) => {
      s.rules.add('creepingFrost')
    },
  },
  // Pas d'inventaire, donc pas de « charges » à doubler : la carte accélère
  // plutôt l'apparition des power-ups, un effet réel et ressenti (spec §3.5).
  {
    id: 'generous-ink',
    rarity: 'rare',
    stackable: false,
    apply: (s) => {
      s.pickupIntervalMultiplier /= 2
    },
  },
  {
    id: 'wide-strike',
    rarity: 'rare',
    stackable: false,
    requires: 'strike',
    apply: (s) => {
      s.rules.add('wideStrike')
      s.strikeWidth *= 2
    },
  },
  {
    id: 'lasting-trail',
    rarity: 'rare',
    stackable: false,
    requires: 'trail',
    apply: (s) => {
      s.rules.add('lastingTrail')
      s.trailDurationMs *= 2
    },
  },

  // ── Mythiques : changent une règle. Une seule par run. ─────────────────────
  {
    id: 'living-ink',
    rarity: 'mythic',
    stackable: false,
    requires: 'freeze',
    apply: (s) => {
      s.rules.add('livingInk')
    },
  },
  {
    id: 'afterburn',
    rarity: 'mythic',
    stackable: false,
    requires: 'blast',
    apply: (s) => {
      s.rules.add('afterburn')
    },
  },
  {
    id: 'second-ink',
    rarity: 'mythic',
    stackable: false,
    apply: (s) => {
      s.rules.add('secondInk')
    },
  },
]

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 65, rare: 30, mythic: 5 }

/** Vague à laquelle une mythique est garantie si aucune n'est encore apparue. */
export const MYTHIC_PITY_WAVE = 10
