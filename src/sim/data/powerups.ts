export type PowerUpKind = 'blast' | 'freeze' | 'bramble' | 'blotter' | 'dash' | 'halo'

export const POWERUP_KINDS: readonly PowerUpKind[] = [
  'blast',
  'freeze',
  'bramble',
  'blotter',
  'dash',
  'halo',
]

/**
 * Poids de tirage d'une pastille. Un tirage uniforme rendrait la fréquence de
 * chaque power-up dépendante du *nombre* de genres : ajouter ou retirer un
 * genre rééquilibrerait le sac tout seul. Des poids explicites coupent ce
 * lien. Le Halo est seul raréfié (~7 % contre ~18,6 % chacun pour les cinq
 * autres) : c'est lui qui empêche de mourir, donc celui dont une inflation se
 * sentirait le plus.
 */
export const POWERUP_WEIGHT: Record<PowerUpKind, number> = {
  blast: 4,
  freeze: 4,
  // Moitié moins fréquente que les quatre offensifs, sans descendre au niveau
  // du Halo qui reste le power-up rare.
  bramble: 2,
  blotter: 4,
  dash: 4,
  halo: 1.5,
}

/**
 * Identifiants jamais renumérotés : ce sont des étiquettes opaques. Les
 * indices libérés (4, 8) portent `null` dans `POWERUP_BY_ID`, comme l'indice 0
 * qui signifie « emplacement vide » côté bitECS.
 */
export const POWERUP_ID: Record<PowerUpKind, number> = {
  blast: 1,
  freeze: 2,
  bramble: 3,
  blotter: 5,
  dash: 6,
  halo: 7,
}

export const POWERUP_BY_ID: readonly (PowerUpKind | null)[] = [
  null,
  'blast',
  'freeze',
  'bramble',
  null,
  'blotter',
  'dash',
  'halo',
  null,
]

/** Types de zones mortelles ou d'effet, encodés pour le composant Hazard. */
export const HAZARD_BLAST = 1
export const HAZARD_FREEZE = 2
export const HAZARD_TRAIL = 3
export const HAZARD_BLOTTER = 5
/** Braise laissée par « Rémanence » à l'expiration d'une Bombe. Un kind à part,
 * pas HAZARD_BLAST : sinon sa propre expiration relancerait une braise, à l'infini. */
export const HAZARD_AFTERBURN = 6
/** Épine de la couronne de la Ronce d'encre. Identifiants jamais réutilisés (voir POWERUP_ID). */
export const HAZARD_BRAMBLE = 7

/** Valeurs de base, modifiables par les cartes d'amélioration. */
export const POWERUP_BASE = {
  blast: { maxRadius: 150, growthRate: 320, lingerMs: 450 },
  freeze: { radius: 130, durationMs: 3500, zoneLifeMs: 5000 },
  /**
   * Couronne d'épines en orbite autour du joueur (portée = `orbitRadius` +
   * `thornRadius`, voir plus bas). `angularRate` est en rad/ms (le temps de
   * simulation est en ms partout ailleurs) : converti ici pour éviter une
   * erreur d'unité au point d'appel.
   */
  bramble: {
    durationMs: 5000,
    /**
     * `count` décide si la couronne a des trous : deux épines voisines ont
     * leurs centres distants de `2 · orbitRadius · sin(π / count)`, et elles
     * barrent `2 · (thornRadius + r)` à un ennemi de rayon `r`. À 7 épines de
     * 8 px sur une orbite de 40, l'écart (34,7 px) laisse passer un Point
     * (30) ou un Éclat (28) mais pas un Bloc (44) — la rotation rattrape ceux
     * qui se faufilent. Resserrer davantage referme la couronne : à 9 épines
     * sur une orbite de 34, l'écart tombe à 23 px et plus rien ne passe, ce
     * qui ferait de la Ronce un bouclier absolu. `powerups.test.ts` garde cet
     * invariant.
     */
    count: 7,
    orbitRadius: 40,
    thornRadius: 8,
    angularRate: 0.0016,
    /** Fenêtre d'avertissement avant expiration, lue par le rendu (spec §3.3). */
    warnMs: 900,
  },
  blotter: {
    radius: 190,
    strength: 260,
    lifeMs: 2500,
    // Composante radiale proportionnelle à la distance (décroissance
    // exponentielle) : un ennemi capturé au bord (dist = radius) converge à
    // ~10 % de son rayon initial à l'expiration de la zone (lifeMs), jamais
    // téléporté au centre.
    vortexInwardRate: 0.9,
    vortexAngularRate: 1.8,
    /**
     * Noyau mortel au centre du tourbillon : 30 px tue ce qui a réellement
     * convergé (~19 px de rayon à l'expiration de la zone), pas plus.
     * Volontairement indépendant de `radius` : la carte « Papier assoiffé »
     * élargit la prise, pas la létalité.
     */
    coreRadius: 30,
  },
  /**
   * À 720 px/s et 665 ms, la ruée couvre ≈ 480 px (30 % de la largeur
   * d'arène) dans un couloir de 140 px. La vitesse ne doit pas bouger : elle
   * fixe la densité du sillage (un segment tous les 21,6 px à
   * `wakeIntervalMs`), l'augmenter obligerait à resserrer la cadence.
   */
  dash: { speed: 720, durationMs: 665, radius: 70, wakeIntervalMs: 30, wakeLifeMs: 800 },
  halo: {},
} as const

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
  /** Fraction du temps restant emportée par saut (décroissance géométrique) ; sous `freezeSpreadFloorMs`, un ennemi ne propage plus, sinon la chaîne s'auto-entretiendrait. */
  freezeSpreadFactor: 0.6,
  freezeSpreadFloorMs: 300,
  /** Rémanence : braise laissée par une Bombe qui expire. */
  afterburn: { radiusRatio: 0.45, lifeMs: 1600 },
} as const
