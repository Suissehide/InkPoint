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
/**
 * Grâce temporaire (début de vague, Halo brisé, Ronce, atterrissage de Ruée) :
 * ignore le contact mortel tant que `remaining > 0`.
 *
 * `total` est la durée de référence de la grâce **en cours**, et n'existe que
 * pour que le rendu puisse en tracer une jauge : `remaining / total` est le
 * seul rapport que la simulation sache offrir. Sans lui, quatre systèmes
 * posent le composant avec quatre durées différentes et l'arc n'aurait aucun
 * plein d'où partir.
 *
 * La règle est sans exception : **toute pose d'une grâce écrit les deux champs
 * à la même valeur**, et c'est `grantInvulnerability` (`sim/invulnerability.ts`)
 * qui la tient — un seul endroit, plutôt que quatre à ne pas oublier. Seule la
 * décroissance de `collisionSystem` touche `remaining` sans `total` : c'est
 * précisément ce qui fait descendre le rapport.
 */
export const Invulnerable = defineComponent({ remaining: Types.f32, total: Types.f32 })
/** Marqué pour suppression : la mort est appliquée en une passe, à la fin du pas. */
export const Doomed = defineComponent()
export const Lifetime = defineComponent({ remaining: Types.f32 })
export const Halo = defineComponent()
/** Ruée de la Plume : trajectoire figée, invulnérable tant que remaining > 0. */
export const Dashing = defineComponent({ remaining: Types.f32, vx: Types.f32, vy: Types.f32 })

/**
 * Sursaut vers le joueur à la dislocation d'une figure traversante : trajectoire
 * figée, comme `Dashing` ou la charge de l'Éclat (`Dasher`, état 2). Retiré
 * (et `Homing` restauré) à l'expiration de `remaining`.
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
 * Zone en orbite autour du joueur (épines de la Ronce d'encre) : `angle` est
 * sa position de base sur le cercle, `rate` son taux angulaire en rad/ms.
 * Composant dédié plutôt qu'un champ détourné de `Hazard` : `growthRate`
 * semble libre sur ces entités, mais `hazardSystem` le lit sur toute entité
 * `Hazard` pour faire grossir le rayon — y ranger un taux angulaire
 * couplerait deux nombres sans rapport.
 */
export const Orbiting = defineComponent({
  angle: Types.f32,
  radius: Types.f32,
  rate: Types.f32,
})
/**
 * Plume de la Volée : elle vire vers `target` à `turnRate` rad/ms et avance à
 * `speed` px/s le long de son `Facing`.
 *
 * `target` est un `i32` et non un `Types.eid` (un ui32) précisément pour
 * pouvoir valoir **-1**, « aucune cible » : l'entité 0 est une entité valide
 * chez bitECS, un défaut à 0 désignerait donc le joueur.
 *
 * `relaunches` porte le budget de « Plumes gigognes » sur l'entité, pas dans
 * les stats : deux volées lancées à la suite ne doivent pas partager le leur.
 */
export const Seeker = defineComponent({
  target: Types.i32,
  speed: Types.f32,
  turnRate: Types.f32,
  relaunches: Types.ui8,
})

/**
 * Goutte de Bavure : elle rebondit sur les murs au lieu d'y être plaquée.
 *
 * Comme la plume, elle ne porte pas de `Collider` — c'est ce qui la tient hors
 * de `integrationSystem`, qui bloque aux murs ce qu'il déplace.
 *
 * `splitsLeft` porte le budget d'« Éclaboussure » sur l'entité et retombe à 0
 * au premier rebond : sans ce plafond, chaque rebond doublerait la population.
 */
export const Ricochet = defineComponent({
  splitsLeft: Types.ui8,
  /**
   * Temps accumulé depuis la dernière trace déposée. Vit sur l'entité et non
   * sur le monde — contrairement à `dashWakeAccMs`, dont la Ruée n'a qu'un
   * exemplaire : deux gouttes issues d'un dédoublement doivent tenir leur
   * cadence chacune de leur côté.
   */
  wakeAccMs: Types.f32,
})

/**
 * Le calque de « Papier calque » : le fantôme qui rejoue le trajet du joueur
 * avec un retard. Marqueur sans champ — le retard et le rayon sont des
 * réglages de la règle (`RULE_TUNING.tracingPaper`), pas un état par entité, et
 * il n'y en a jamais qu'un par monde.
 *
 * Comme la goutte de Bavure, il ne porte **pas** de `Collider` : c'est ce qui
 * le tient hors d'`integrationSystem`, qui bloque aux murs ce qu'il déplace.
 */
export const Tracing = defineComponent()

/**
 * La seconde salve de « Double trait », en attente. Entité à part entière et
 * non un champ posé sur le joueur : deux pastilles ramassées coup sur coup
 * doivent produire deux salves distinctes, chacune avec son propre compte à
 * rebours et son propre genre.
 *
 * `kind` est l'identifiant `POWERUP_ID` du power-up, pas son nom : c'est ce que
 * porte déjà `Pickup.kind`, et un `ui8` est tout ce qu'un tableau SoA sait
 * ranger.
 */
export const DelayedPowerUp = defineComponent({ kind: Types.ui8, remaining: Types.f32 })

/** Ennemi figé par le Gel : immobile, et mortel au contact du joueur seulement. */
export const Frozen = defineComponent({ remaining: Types.f32 })
/**
 * Marqueur de transition : posé le pas où `Frozen` vient d'être appliqué,
 * jamais reposé sur un ennemi déjà gelé. `freezeSystem` le consomme au pas
 * suivant pour propager la contagion une seule fois par ennemi — la propager
 * à chaque image tant qu'il reste gelé la rendrait auto-entretenue.
 */
export const FreshlyFrozen = defineComponent()
/** Force d'aspiration du Buvard vers son centre. */
export const Attractor = defineComponent({ strength: Types.f32 })
/**
 * Ennemi capturé par un Buvard : `Homing` est retiré, la zone gouverne seule
 * sa vélocité. Retiré (et `Homing` restauré) dès que l'ennemi sort du rayon de
 * tout Buvard, quelle que soit la raison (zone expirée ou ennemi repoussé).
 */
export const Vortexed = defineComponent()

/**
 * Membre d'une formation en chorégraphie : le bloc tient sa forme et avance
 * ensemble avant de se disloquer. `offsetX/Y` est le décalage *initial*
 * (figé) par rapport à `originX/Y` ; `formationSystem` recalcule la position
 * cible à chaque pas à partir de ces valeurs plutôt que d'accumuler une
 * position flottante — recalcul déterministe, pas de dérive numérique. Pas de
 * `Homing` pendant la chorégraphie : il reprend (composant retiré) à la
 * dislocation.
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
