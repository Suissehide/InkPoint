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
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  point: {
    type: 'point',
    radius: 7,
    speedFactor: 1,
    // Accélération élevée : trop faible, l'ennemi n'accélère plus vers sa
    // cible mais orbite autour d'elle (le joueur inverse en ~0,2 s).
    accel: 550,
    // Trop haut, la poursuite viserait un point où le joueur n'est déjà plus.
    homingDelayMs: 90,
    unlockWave: 1,
    weight: 10,
  },
  shard: {
    type: 'shard',
    radius: 6,
    speedFactor: 1,
    // Le plus nimble : demi-tour le plus court des trois, cohérent avec son
    // caractère de piqué véloce (voir shardSystem).
    accel: 650,
    // Même retard qu'un Point : seule sa phase de charge (shardSystem) diffère, pas son homing.
    homingDelayMs: 90,
    unlockWave: 3,
    weight: 5,
  },
  // La Tache ne se scinde plus à sa mort. Ses trois Points naissaient à 18 px
  // du cadavre, déjà solides : tuer une Tache gelée en la traversant les fit
  // naître SUR le joueur (9 + 7 = 16 px de contact), qui mourait au pas
  // suivant. La Ruée y échappait par sa grâce d'atterrissage, la traversée
  // d'un gelé n'avait rien. Plutôt que d'ajouter une cinquième grâce pour
  // rendre survivable un éclatement dont on ne voulait plus, la scission est
  // retirée : la Tache est désormais un gros ennemi lent, et rien d'autre.
  blot: {
    type: 'blot',
    radius: 14,
    speedFactor: 0.55,
    // Le plus lourd : demi-tour le plus long des trois — plus mou que l'Éclat et le Point, jamais orbital.
    accel: 270,
    homingDelayMs: 400,
    unlockWave: 5,
    weight: 3,
  },
}

export const ENEMY_TYPES: readonly EnemyType[] = ['point', 'shard', 'blot']

/**
 * Rayon du plus gros ennemi, **dérivé des définitions** et non écrit en dur :
 * sert de marge de recherche aux requêtes de collision/zone dans la grille
 * spatiale. Une constante figée deviendrait silencieusement fausse (collisions
 * ratées sans symptôme) le jour où un ennemi plus large est ajouté.
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
/**
 * 1,58 fois les 240 px/s du joueur (`spawn.ts`). Le plancher n'est pas 240 mais
 * nettement au-dessus : en descendant vers la vitesse du joueur, l'Éclat
 * cesserait d'être le seul ennemi qu'on ne peut pas distancer, et c'est là son
 * identité. Reste très loin des 150 px/s que la courbe de difficulté accorde au
 * mieux aux poursuivants.
 */
export const SHARD_DASH_SPEED = 380
export const SHARD_DASH_TRIGGER_DISTANCE = 260
export const SHARD_DASH_DURATION_MS = 900
