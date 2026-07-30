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
    // 110 → 550 px/s² (playtest réel, « gravité étrange ») : à 110, un
    // demi-tour complet prenait 2·195/110 ≈ 3,55 s alors que le joueur inverse
    // en ~0,2 s — l'ennemi n'accélère plus vers sa cible, il orbite autour
    // d'elle. À 550, le même calcul donne 2·195/550 ≈ 0,71 s : une inertie
    // qui reste sensible (le joueur garde une fenêtre d'esquive) sans jamais
    // ressembler à une chute libre.
    accel: 550,
    // 250 → 130 → 90 ms (playtest réel) : au-delà, la poursuite visait un
    // point où le joueur n'était déjà plus, ce qui se lisait comme de la
    // bêtise plutôt que comme une esquive juste. 90 ms garde l'esquive
    // lisible tout en donnant l'impression que l'ennemi suit vraiment le
    // joueur — resserré une seconde fois maintenant que le virage lui-même
    // (accel ci-dessus) ne masque plus ce délai.
    homingDelayMs: 90,
    unlockWave: 1,
    weight: 10,
  },
  shard: {
    type: 'shard',
    radius: 6,
    speedFactor: 1,
    // Le plus nimble : demi-tour le plus court des trois (2·195/650 = 0,60 s),
    // cohérent avec son caractère de piqué véloce (voir shardSystem).
    accel: 650,
    // Même retard qu'un Point en approche (voir ci-dessus) : seule sa phase de
    // charge (shardSystem) a un comportement distinct, pas son homing.
    homingDelayMs: 90,
    unlockWave: 3,
    weight: 5,
  },
  blot: {
    type: 'blot',
    radius: 14,
    speedFactor: 0.55,
    // Le plus lourd : demi-tour le plus long des trois mais toujours sous la
    // seconde (2·(195·0,55)/270 ≈ 0,79 s) — plus mou que l'Éclat et le Point,
    // jamais orbital.
    accel: 270,
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
