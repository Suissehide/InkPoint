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
      // +15 % et non +30 % : la carte est cumulable, et à +30 % deux
      // exemplaires donneraient un rayon de 118 (couloir de 236 px, un
      // sixième de l'arène). À 15 %, deux cartes donnent 92 (184 px).
      s.dashRadius *= 1.15
    },
  },
  {
    id: 'volley-count',
    rarity: 'common',
    stackable: true,
    requires: 'volley',
    apply: (s) => {
      s.volleyCount += 1
    },
  },
  {
    id: 'splatter-life',
    rarity: 'common',
    stackable: true,
    requires: 'splatter',
    apply: (s) => {
      s.splatterLifeMs += 1500
    },
  },
  // ── Rares : modifient un comportement ──────────────────────────────────────
  {
    id: 'creeping-frost',
    rarity: 'rare',
    stackable: false,
    requires: 'freeze',
    apply: (s) => {
      s.rules.add('creepingFrost')
    },
  },
  {
    id: 'lasting-bramble',
    rarity: 'rare',
    stackable: false,
    requires: 'bramble',
    // Pas de `rules.add` ici, contrairement aux autres cartes rares/mythiques :
    // tout l'effet de la carte tient dans le doublement ci-dessous.
    apply: (s) => {
      s.brambleDurationMs *= 2
    },
  },
  {
    id: 'nested-quills',
    rarity: 'rare',
    stackable: false,
    requires: 'volley',
    apply: (s) => {
      s.rules.add('nestedQuills')
    },
  },
  {
    id: 'splatter-split',
    rarity: 'rare',
    stackable: false,
    requires: 'splatter',
    apply: (s) => {
      s.rules.add('splitSplatter')
    },
  },
  // ── Mythiques : changent la façon de jouer ─────────────────────────────────
  {
    id: 'tracing-paper',
    rarity: 'mythic',
    stackable: false,
    // Sans `requires`, comme toute mythique : la garantie de pitié en impose
    // une à la vague 10, et une carte conditionnée à un power-up jamais
    // rencontré laisserait des runs sans aucune mythique (spec §2).
    apply: (s) => {
      s.rules.add('tracingPaper')
    },
  },
  {
    id: 'double-stroke',
    rarity: 'mythic',
    stackable: false,
    // Sans `requires`, comme toute mythique (spec §2). Ici c'est plus qu'une
    // règle de tirage : la carte améliore TOUT le sac, y compris les power-ups
    // rencontrés après elle. La conditionner à l'un d'eux n'aurait aucun sens.
    apply: (s) => {
      s.rules.add('doubleStroke')
    },
  },
  {
    id: 'thirsty-paper',
    rarity: 'mythic',
    stackable: false,
    // Sans `requires` (spec §2), et pour la même raison que « Double trait » :
    // elle ne s'accroche à aucun power-up, elle change ce que vaut une mort.
    apply: (s) => {
      s.rules.add('thirstyPaper')
    },
  },
]

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 65, rare: 30, mythic: 5 }

/** Vague à laquelle une mythique est garantie si aucune n'est encore apparue. */
export const MYTHIC_PITY_WAVE = 10
