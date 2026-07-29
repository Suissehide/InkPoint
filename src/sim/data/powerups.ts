export type PowerUpKind =
  | 'blast'
  | 'freeze'
  | 'trail'
  | 'strike'
  | 'blotter'
  | 'dash'
  | 'halo'
  | 'dryspell'

export const POWERUP_KINDS: readonly PowerUpKind[] = [
  'blast',
  'freeze',
  'trail',
  'strike',
  'blotter',
  'dash',
  'halo',
  'dryspell',
]

/** 0 est réservé à « emplacement vide » dans le stockage bitECS. */
export const POWERUP_ID: Record<PowerUpKind, number> = {
  blast: 1,
  freeze: 2,
  trail: 3,
  strike: 4,
  blotter: 5,
  dash: 6,
  halo: 7,
  dryspell: 8,
}

export const POWERUP_BY_ID: readonly (PowerUpKind | null)[] = [
  null,
  'blast',
  'freeze',
  'trail',
  'strike',
  'blotter',
  'dash',
  'halo',
  'dryspell',
]

/** Types de zones mortelles ou d'effet, encodés pour le composant Hazard. */
export const HAZARD_BLAST = 1
export const HAZARD_FREEZE = 2
export const HAZARD_TRAIL = 3
export const HAZARD_STRIKE = 4
export const HAZARD_BLOTTER = 5
/** Braise laissée par « Rémanence » à l'expiration d'une Bombe. Un kind à part,
 * pas HAZARD_BLAST : sinon sa propre expiration relancerait une braise, à
 * l'infini (spec carte mythique afterburn). */
export const HAZARD_AFTERBURN = 6

/** Valeurs de base, modifiables par les cartes d'amélioration (Task 12). */
export const POWERUP_BASE = {
  blast: { maxRadius: 150, growthRate: 320, lingerMs: 450 },
  freeze: { radius: 130, durationMs: 3500, zoneLifeMs: 5000 },
  trail: { durationMs: 3000, radius: 12 },
  strike: { width: 26, lingerMs: 260 },
  blotter: { radius: 190, strength: 260, lifeMs: 2500 },
  dash: { speed: 720, durationMs: 220 },
  halo: {},
  dryspell: { durationMs: 4000, slowFactor: 0.35 },
} as const

/** Intervalle d'apparition d'un power-up au sol, en ms. */
export const PICKUP_SPAWN_INTERVAL_MS = 7000
export const PICKUP_RADIUS = 14
export const PICKUP_LIFE_MS = 14_000

/**
 * Réglages des règles rares/mythiques (`RunStats.rules`). Ce ne sont pas des
 * valeurs de power-up de base : aucune carte commune ne les fait varier,
 * seule la présence de la règle dans `rules` les active.
 */
export const RULE_TUNING = {
  /** Onde de choc : anneau juste au-delà du rayon mortel, et vitesse de recul. */
  shockwave: { ringMultiplier: 1.6, impulseSpeed: 600 },
  /** Givre rampant / Encre vive : rayon de contamination d'un ennemi gelé. */
  freezeSpreadRadius: 70,
  /**
   * Chaque saut de contagion n'emporte qu'une fraction du temps restant de sa
   * source (pas la durée pleine) : la chaîne s'éteint géométriquement au lieu
   * de s'auto-entretenir. En dessous de `freezeSpreadFloorMs`, un ennemi ne
   * propage plus du tout — sans ce plancher un saut à durée quasi nulle
   * repropagerait quand même indéfiniment.
   */
  freezeSpreadFactor: 0.6,
  freezeSpreadFloorMs: 300,
  /** Rémanence : braise laissée par une Bombe qui expire. */
  afterburn: { radiusRatio: 0.45, lifeMs: 1600 },
} as const
