export type PowerUpKind = 'blast' | 'freeze' | 'blotter' | 'dash' | 'halo'

export const POWERUP_KINDS: readonly PowerUpKind[] = ['blast', 'freeze', 'blotter', 'dash', 'halo']

/**
 * Les identifiants ne sont jamais renumérotés quand un power-up disparaît : ce
 * sont des étiquettes opaques, rien ne les parcourt par plage, et les décaler
 * ferait bouger du code qui n'a aucune raison de bouger. `POWERUP_BY_ID` porte
 * donc `null` aux indices libérés (3 : Trait d'encre, 4 : Rature, 8 : Séchage),
 * comme à l'indice 0 qui a toujours signifié « emplacement vide » côté bitECS.
 */
/** 0 est réservé à « emplacement vide » dans le stockage bitECS. */
export const POWERUP_ID: Record<PowerUpKind, number> = {
  blast: 1,
  freeze: 2,
  blotter: 5,
  dash: 6,
  halo: 7,
}

export const POWERUP_BY_ID: readonly (PowerUpKind | null)[] = [
  null,
  'blast',
  'freeze',
  null,
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
 * pas HAZARD_BLAST : sinon sa propre expiration relancerait une braise, à
 * l'infini (spec carte mythique afterburn). */
export const HAZARD_AFTERBURN = 6

/** Valeurs de base, modifiables par les cartes d'amélioration (Task 12). */
export const POWERUP_BASE = {
  blast: { maxRadius: 150, growthRate: 320, lingerMs: 450 },
  freeze: { radius: 130, durationMs: 3500, zoneLifeMs: 5000 },
  blotter: {
    radius: 190,
    strength: 260,
    lifeMs: 2500,
    // Tourbillon (spec gameplay-pass §3) : à `strength` de base, un ennemi
    // capturé au bord (dist = radius = 190) part à ~0.9·190 ≈ 171 px/s vers le
    // centre et ~1.8·190 ≈ 342 px/s en tangentielle. La composante radiale
    // étant proportionnelle à la distance (décroissance exponentielle), un
    // ennemi capturé dès l'ouverture de la zone se retrouve à ~10% de son
    // rayon initial (exp(-0.9 × 2.5) ≈ 0.105) à l'expiration de la zone
    // (lifeMs) : il converge visiblement sans jamais être téléporté au
    // centre. La vitesse angulaire constante (indépendante du rayon) lui
    // fait boucler ~0,7 tour sur la durée de vie de la zone — un tourbillon
    // qui se voit, pas un simple infléchissement de trajectoire.
    vortexInwardRate: 0.9,
    vortexAngularRate: 1.8,
    /**
     * Noyau mortel au centre du tourbillon. Le Buvard était jusqu'ici le seul
     * power-up qui ne tuait rien : il plaçait les ennemis pour qu'on enchaîne
     * avec autre chose. Il finit désormais le travail lui-même.
     *
     * 30 px, et pas davantage : le tourbillon ramène un ennemi capturé au bord
     * à ~10 % de son rayon initial (≈ 19 px) au bout des 2,5 s de la zone — un
     * noyau de 30 px tue donc ce qui a réellement convergé, et rien d'autre. Le
     * Buvard reste un broyeur qui prend son temps plutôt qu'une bombe à
     * retardement. Volontairement indépendant de `radius` : la carte « Papier
     * assoiffé » élargit la prise, pas la létalité.
     */
    coreRadius: 30,
  },
  /**
   * 274 px de course dans un couloir de 80 px ne suffisaient pas à casser un
   * encerclement. À 665 ms et vitesse inchangée (720 px/s), la ruée couvre
   * ≈ 480 px, soit 30 % de la largeur d'arène, dans un couloir de 140 px.
   *
   * La vitesse ne bouge pas volontairement : elle fixe la densité du sillage
   * (un segment tous les 21,6 px à `wakeIntervalMs`), et l'augmenter aurait
   * obligé à resserrer la cadence pour garder un couloir continu.
   */
  dash: { speed: 720, durationMs: 665, radius: 70, wakeIntervalMs: 30, wakeLifeMs: 800 },
  halo: {},
} as const

/**
 * L'intervalle d'apparition d'un power-up au sol n'est plus une constante
 * fixe : c'est une courbe, `pickupInterval` (difficulty.ts), au même titre
 * que le rythme d'apparition des ennemis — voir sa docstring pour le
 * raisonnement.
 */
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
