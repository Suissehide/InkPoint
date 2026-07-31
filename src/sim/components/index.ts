import { defineComponent, Types } from 'bitecs'

export const Position = defineComponent({ x: Types.f32, y: Types.f32 })
/** Position au pas précédent — sert à l'interpolation du rendu. */
export const PrevPosition = defineComponent({ x: Types.f32, y: Types.f32 })
export const Velocity = defineComponent({ x: Types.f32, y: Types.f32 })
export const Movement = defineComponent({
  maxSpeed: Types.f32,
  accel: Types.f32,
  friction: Types.f32,
})
export const Collider = defineComponent({ radius: Types.f32 })
export const Facing = defineComponent({ angle: Types.f32 })
export const Player = defineComponent()
export const Enemy = defineComponent({ type: Types.ui8 })
export const Materializing = defineComponent({ remaining: Types.f32, total: Types.f32 })
export const Homing = defineComponent({ delayMs: Types.f32 })
/** 0 = approche, 1 = télégraphe (immobile), 2 = charge (trajectoire figée) */
export const Dasher = defineComponent({ state: Types.ui8, timer: Types.f32 })
/** Grâce temporaire (début de vague, Halo…) : ignore le contact mortel tant que remaining > 0. */
export const Invulnerable = defineComponent({ remaining: Types.f32 })
/** Marqué pour suppression : la mort est appliquée en une passe, à la fin du pas. */
export const Doomed = defineComponent()
export const Lifetime = defineComponent({ remaining: Types.f32 })
export const Halo = defineComponent()
/** Posé sur le joueur quand la règle « Seconde encre » a déjà rendu son Halo :
 *  empêche d'en accorder un second dans la même run (spec carte mythique). */
export const SecondInkSpent = defineComponent()
/** Ruée de la Plume : trajectoire figée, invulnérable tant que remaining > 0. */
export const Dashing = defineComponent({ remaining: Types.f32, vx: Types.f32, vy: Types.f32 })

/**
 * Sursaut vers le joueur à la dislocation d'une figure traversante (Ligne, V,
 * Spirale) : trajectoire figée quelques centaines de ms, comme `Dashing` ou la
 * charge de l'Éclat (`Dasher`, état 2) — même patron, un mobile dont la
 * vélocité est temporairement gouvernée par un minuteur dédié plutôt que par
 * `Homing`. Retiré (et `Homing` restauré) à l'expiration de `remaining`.
 */
export const Bursting = defineComponent({ remaining: Types.f32, vx: Types.f32, vy: Types.f32 })

/** Power-up posé au sol, en attente de ramassage. */
export const Pickup = defineComponent({ kind: Types.ui8 })
/** Zone active au sol (explosion, gel, traînée, foudre, buvard). */
export const Hazard = defineComponent({
  kind: Types.ui8,
  radius: Types.f32,
  maxRadius: Types.f32,
  growthRate: Types.f32,
})
/**
 * Zone en orbite autour du joueur (épines de la Ronce d'encre) : `angle` est sa
 * position de base sur le cercle, `rate` son taux angulaire en rad/ms, la
 * rotation venant du temps de simulation. Un composant dédié plutôt qu'un
 * champ détourné de `Hazard` — `growthRate` a l'air libre sur ces entités,
 * mais `hazardSystem` le lit sur toute entité `Hazard` pour faire grossir le
 * rayon : y ranger un taux angulaire couplait la vitesse de rotation à une
 * croissance de zone, deux nombres sans le moindre rapport.
 */
export const Orbiting = defineComponent({
  angle: Types.f32,
  radius: Types.f32,
  rate: Types.f32,
})
/** Ennemi figé par le Gel : immobile, et mortel au contact du joueur seulement. */
export const Frozen = defineComponent({ remaining: Types.f32 })
/**
 * Marqueur de transition : posé le pas où `Frozen` vient d'être appliqué
 * (zone de Gel, Givre rampant, Encre vive), jamais reposé sur un ennemi déjà
 * gelé. `freezeSystem` le consomme au pas suivant pour propager la contagion
 * une seule fois par ennemi — pas à chaque image tant qu'il reste gelé, ce
 * qui est ce qui rendait la contagion auto-entretenue (voir rapport de tâche).
 */
export const FreshlyFrozen = defineComponent()
/** Force d'aspiration du Buvard vers son centre. */
export const Attractor = defineComponent({ strength: Types.f32 })
/**
 * Ennemi capturé par un Buvard : la poursuite (Homing) est retirée et la zone
 * gouverne seule sa vélocité — tourbillon plutôt que léger infléchissement de
 * trajectoire (spec gameplay-pass §3). Retiré (et Homing restauré) dès que
 * l'ennemi n'est plus dans le rayon d'aucun Buvard, quelle que soit la raison
 * (zone expirée, ennemi repoussé hors du rayon par un autre effet).
 */
export const Vortexed = defineComponent()

/**
 * Membre d'une formation en chorégraphie (spec gameplay-pass §4) : le bloc
 * tient sa forme et avance ensemble avant de se disloquer. `offsetX/Y` est le
 * décalage *initial* (non retravaillé) par rapport à `originX/Y`, le point de
 * référence au départ ; `formationSystem` recalcule à chaque pas la position
 * cible à partir de ces valeurs figées (rotation de marche + rotation
 * additionnelle + resserrement + avance), plutôt que d'accumuler une position
 * flottante pas après pas — recalcul déterministe, pas de dérive numérique.
 * Absence de Homing pendant toute la chorégraphie : la poursuite reprend (et
 * le composant est retiré) à la dislocation, avec le délai propre au type.
 */
export const Formation = defineComponent({
  /** Index dans FORMATION_KINDS (data/formations.ts). */
  kind: Types.ui8,
  offsetX: Types.f32,
  offsetY: Types.f32,
  originX: Types.f32,
  originY: Types.f32,
  /** Direction de marche unitaire ; (0,0) pour une formation immobile. */
  dirX: Types.f32,
  dirY: Types.f32,
  /** px/s ; 0 pour une formation qui ne se déplace pas comme un bloc. */
  travelSpeed: Types.f32,
  /** rad — orientation de marche figée au spawn (+ rotation additionnelle dans formationSystem). */
  rotationOffset: Types.f32,
  /** ms — durée totale de la chorégraphie avant dislocation. */
  durationMs: Types.f32,
  /** ms — écoulé depuis le début de la chorégraphie (ne progresse pas pendant la matérialisation). */
  elapsed: Types.f32,
})
