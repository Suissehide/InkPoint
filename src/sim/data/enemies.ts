export type EnemyType = 'point' | 'shard' | 'blot'

export interface EnemyDef {
  type: EnemyType
  radius: number
  /** Multiplicateur appliqué à la vitesse max globale de la courbe de difficulté. */
  speedFactor: number
  /** px/s² */
  accel: number
  /** Retard de visée, en ms. */
  homingDelayMs: number
  /** Première vague où ce type peut apparaître. */
  unlockWave: number
  /** Poids de tirage relatif entre types débloqués. */
  weight: number
  splitsInto?: { type: EnemyType; count: number }
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  point: {
    type: 'point',
    radius: 7,
    speedFactor: 1,
    accel: 110,
    homingDelayMs: 250,
    unlockWave: 1,
    weight: 10,
  },
  shard: {
    type: 'shard',
    radius: 6,
    speedFactor: 1,
    accel: 140,
    homingDelayMs: 250,
    unlockWave: 3,
    weight: 5,
  },
  blot: {
    type: 'blot',
    radius: 14,
    speedFactor: 0.55,
    accel: 70,
    homingDelayMs: 400,
    unlockWave: 5,
    weight: 3,
    splitsInto: { type: 'point', count: 3 },
  },
}

export const ENEMY_TYPES: readonly EnemyType[] = ['point', 'shard', 'blot']

/**
 * Rayon du plus gros ennemi, **dérivé des définitions** et non écrit en dur.
 * Les requêtes de collision et de zone s'en servent comme marge de recherche
 * dans la grille spatiale. Une constante figée serait juste aujourd'hui et
 * silencieusement fausse le jour où l'on ajoute un ennemi plus large : les
 * collisions le concernant seraient simplement ratées, sans erreur ni symptôme
 * évident. Or ajouter un ennemi en écrivant une entrée est précisément la
 * promesse du contenu piloté par les données.
 */
export const MAX_ENEMY_RADIUS = Math.max(...Object.values(ENEMIES).map((def) => def.radius))

/** Encodage numérique pour le stockage bitECS (SoA n'accepte que des nombres). */
export const ENEMY_TYPE_ID: Record<EnemyType, number> = { point: 0, shard: 1, blot: 2 }
export const ENEMY_TYPE_BY_ID: readonly EnemyType[] = ['point', 'shard', 'blot']

/** Durées d'apparition totales, dont les 400 dernières ms de solidification (spec §3.3). */
export const MATERIALIZE_EDGE_MS = 1000
export const MATERIALIZE_AMBUSH_MS = 1600
export const SOLIDIFY_MS = 400
/** Distance minimale d'une embuscade au joueur. */
export const AMBUSH_MIN_DISTANCE = 180

/** Comportement de l'Éclat : le seul ennemi plus rapide que le joueur (spec §3.6). */
export const SHARD_TELEGRAPH_MS = 500
export const SHARD_DASH_SPEED = 420
export const SHARD_DASH_TRIGGER_DISTANCE = 260
export const SHARD_DASH_DURATION_MS = 900
