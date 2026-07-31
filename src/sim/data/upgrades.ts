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
    id: 'bramble-duration',
    rarity: 'common',
    stackable: true,
    requires: 'bramble',
    apply: (s) => {
      s.brambleDurationMs += 900
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
    id: 'dash-radius',
    rarity: 'common',
    stackable: true,
    requires: 'dash',
    apply: (s) => {
      // +15 % et non +30 % : la carte est cumulable, et sur la nouvelle base de
      // 70 deux exemplaires donnaient un rayon de 118, soit un couloir de
      // 236 px — un sixième de l'arène balayé d'un coup. À 15 %, deux cartes
      // donnent 92 (184 px). Ce qui est conservé, c'est l'élargissement
      // *absolu* ressenti, pas la progression relative : la première carte
      // ajoutait ~24 px de couloir sur l'ancienne base de 40 (40 → 52), elle
      // en ajoute ~21 sur la nouvelle (70 → 80,5). En relatif, deux cartes
      // valaient +69 % et ne valent plus que +32 % — c'est le prix à payer
      // pour que la carte reste un bonus et non un doublement du couloir.
      s.dashRadius *= 1.15
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
    id: 'lasting-bramble',
    rarity: 'rare',
    stackable: false,
    requires: 'bramble',
    // Pas de `rules.add` ici : tout l'effet de la carte est le doublement
    // ci-dessous. Un marqueur `lastingBramble` a traîné, écrit et jamais lu —
    // trompeur, puisque chaque autre `rules.add` de ce fichier commande bien
    // une branche de système, donc un lecteur part la chercher.
    apply: (s) => {
      s.brambleDurationMs *= 2
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
