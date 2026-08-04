export type PowerUpKind =
  | 'blast'
  | 'freeze'
  | 'bramble'
  | 'blotter'
  | 'dash'
  | 'halo'
  | 'volley'
  | 'splatter'

export const POWERUP_KINDS: readonly PowerUpKind[] = [
  'blast',
  'freeze',
  'bramble',
  'blotter',
  'dash',
  'halo',
  'volley',
  'splatter',
]

/**
 * Poids de tirage d'une pastille. Un tirage uniforme rendrait la fréquence de
 * chaque power-up dépendante du *nombre* de genres : ajouter ou retirer un
 * genre rééquilibrerait le sac tout seul. Des poids explicites coupent ce lien.
 */
export const POWERUP_WEIGHT: Record<PowerUpKind, number> = {
  blast: 4,
  freeze: 4,
  // Le plus rare du jeu, sous le Halo. Conséquence : `draw.ts` conditionne les
  // cartes à `seenPowerups`, donc « Longue ronce » et « Ronce vivace » entrent
  // bien plus tard dans le tirage.
  bramble: 1,
  blotter: 4,
  dash: 4,
  // Celui qui empêche de mourir, donc celui dont une inflation se sentirait le
  // plus.
  halo: 1.5,
  volley: 4,
  // Sous les offensifs à plein poids : elle travaille seule pendant qu'on
  // esquive ailleurs, elle n'a pas à sortir aussi souvent qu'une Bombe.
  splatter: 3,
}

/**
 * Genres retirés du sac sans être supprimés : identifiant, poids et code
 * restent en place, une ligne à retirer les remet en jeu.
 *
 * Un poids à zéro aurait produit le même effet visible, mais `powerups.test.ts`
 * exige un poids strictement positif pour chaque genre — un zéro y serait
 * indistinguable d'un oubli.
 *
 * La carte du genre désactivé n'a rien à faire de son côté : `draw.ts`
 * conditionne toute carte à `seenPowerups`, elle cesse d'être tirable d'elle-même
 * et reviendra pareillement d'elle-même.
 */
export const POWERUP_DISABLED: ReadonlySet<PowerUpKind> = new Set<PowerUpKind>(['blotter'])

/** Les genres réellement tirables. Seul `pickup.ts` doit consulter cette liste. */
export const POWERUP_DRAWABLE: readonly PowerUpKind[] = POWERUP_KINDS.filter(
  (kind) => !POWERUP_DISABLED.has(kind),
)

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
  volley: 9,
  splatter: 10,
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
  'volley',
  'splatter',
]

/**
 * Types de zones mortelles ou d'effet, encodés pour le composant Hazard.
 * Étiquettes opaques comme `POWERUP_ID` : 2 (zone de gel) et 6 (braise de
 * « Rémanence ») sont retirés et ne seront jamais réattribués — un identifiant
 * recyclé rendrait illisible toute trace antérieure.
 */
export const HAZARD_BLAST = 1
export const HAZARD_TRAIL = 3
export const HAZARD_BLOTTER = 5
export const HAZARD_BRAMBLE = 7
/** Plume en vol de la Volée. N'est PAS dans `LETHAL` : c'est son explosion qui tue. */
export const HAZARD_QUILL = 8
/** Goutte de Bavure en vol. Contrairement à la plume, elle EST mortelle : elle rejoint `LETHAL`. */
export const HAZARD_SPLATTER = 9
/**
 * Une tache d'encre posée au sol. **Mortelle**, comme le sillage de la Ruée.
 *
 * Le genre ne nomme personne, volontairement : la trace de la Bavure l'a créé,
 * mais « Le papier boit » y sème les siennes avec d'autres réglages
 * (`RULE_TUNING.thirstyPaper`) et le même dessin. Ce qui varie d'une tache à
 * l'autre tient entièrement dans `Hazard.radius` et `Lifetime`.
 */
export const HAZARD_INK_TRAIL = 10
/**
 * Le calque de « Papier calque » : le fantôme du trajet du joueur, **mortel**.
 * Seule zone du jeu sans `Lifetime` — elle vit autant que la run.
 */
export const HAZARD_TRACING = 11

/** Valeurs de base, modifiables par les cartes d'amélioration. */
export const POWERUP_BASE = {
  blast: { maxRadius: 150, growthRate: 320, lingerMs: 450 },
  /**
   * 220 : la plus large zone instantanée du jeu, très au-dessus de la Bombe
   * (150). Assumé — la Bombe **tue** dans son rayon, le Gel n'y ouvre qu'une
   * fenêtre.
   *
   * C'est la hauteur de l'arène qui borne ce chiffre, pas sa largeur : 440 px
   * de diamètre pour 720 de haut, soit **61 % de la hauteur** (contre 34 % de
   * la largeur). Au-delà, une prise au centre couvrirait bord à bord et le
   * placement cesserait d'exister. `freeze-radius` (×1,2, empilable) part donc
   * de très haut : deux exemplaires portent à 317 px, 88 % de la hauteur.
   */
  freeze: { radius: 220, durationMs: 4000 },
  /**
   * Couronne d'épines en orbite autour du joueur (portée = `orbitRadius` +
   * `thornRadius`). `angularRate` est en rad/ms (le temps de simulation est en
   * ms partout ailleurs) : converti ici pour éviter une erreur d'unité au point
   * d'appel.
   */
  bramble: {
    durationMs: 5000,
    /**
     * `count` décide si la couronne a des trous : deux épines voisines ont
     * leurs centres distants de `2 · orbitRadius · sin(π / count)`, et elles
     * barrent `2 · (thornRadius + r)` à un ennemi de rayon `r`. À 9 épines de
     * 8 px sur une orbite de 30, l'écart (20,5 px) reste sous les 28 px barrés
     * au plus petit ennemi (Éclat, r 6) : **plus rien ne se faufile.**
     * `powerups.test.ts` garde l'étanchéité, calculée depuis ces constantes.
     *
     * L'anneau ne peut pas être resserré *sans* refermer la couronne : à 7
     * épines déjà, une orbite de 30 donne 26 px, sous le même seuil de 28.
     * Réduire la portée et garder les trous s'excluent.
     */
    count: 9,
    orbitRadius: 30,
    thornRadius: 8,
    /**
     * ≈ 63 px/s en bout d'épine (0,0021 rad/ms × 30 px). La rotation ne rattrape
     * personne — plus rien ne passe — elle ne porte que la lecture : une
     * couronne qui tourne se lit comme vivante, un anneau figé comme un décor.
     */
    angularRate: 0.0021,
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
     * convergé (~19 px de rayon à l'expiration), pas plus. Volontairement
     * indépendant de `radius` : « Papier assoiffé » élargit la prise, pas la
     * létalité.
     */
    coreRadius: 30,
  },
  /**
   * À 720 px/s et 665 ms, la ruée couvre ≈ 480 px (30 % de la largeur d'arène)
   * dans un couloir de 140 px. La vitesse ne doit pas bouger : elle fixe la
   * densité du sillage (un segment tous les 21,6 px à `wakeIntervalMs`),
   * l'augmenter obligerait à resserrer la cadence.
   */
  dash: { speed: 720, durationMs: 665, radius: 70, wakeIntervalMs: 30, wakeLifeMs: 800 },
  /**
   * Volée de plumes. Les plumes ne tuent pas au passage : à l'impact elles
   * posent une explosion réduite et disparaissent, pour que ce que le joueur
   * voit reste exactement ce qui tue (spec §3.1).
   *
   * `turnRate` est en rad/ms comme `bramble.angularRate` : à 0,006 la plume met
   * ~520 ms à faire demi-tour, assez pour manquer une cible qui coupe sa
   * trajectoire — un téléguidage parfait n'aurait aucune lecture.
   */
  volley: {
    count: 3,
    speed: 340,
    turnRate: 0.006,
    lifeMs: 2600,
    quillRadius: 5,
    /**
     * Explosion d'impact : 90 atteint 97 px sur un Point (rayon 7), donc elle
     * emporte le voisinage de sa cible et pas seulement elle.
     *
     * Le compte reste honnête vis-à-vis de la Bombe : trois disques de 90
     * couvrent 76 000 px², contre 71 000 pour l'unique disque de 150. La Volée
     * ne gagne presque rien en surface — elle gagne le **placement**, ses trois
     * disques tombant là où sont les ennemis et non là où était la pastille.
     * C'est ce qui la distingue de la Bombe, et la raison de ne pas monter plus
     * haut sans y regarder à deux fois.
     */
    blastRadius: 90,
    /** Même croissance que la Bombe : une explosion doit se lire pareil, quelle que soit sa taille. */
    blastGrowth: 320,
    /**
     * 300 ms (la Bombe tient 450) : assez pour que le groupe qui converge vers
     * le joueur traverse la zone après sa croissance, au lieu de la voir
     * s'éteindre dans la foulée.
     */
    blastLingerMs: 300,
  },
  /**
   * Bavure : une goutte lancée dans la direction du regard, qui rebondit sur
   * les murs et tue au contact. Le seul power-up qui continue à travailler
   * pendant que le joueur esquive ailleurs.
   */
  splatter: {
    speed: 300,
    /**
     * 26 barre 33 px sur un Point (rayon 7), et la goutte rebondit sur sa marge
     * d'un rayon, ce qui la garde entièrement dans l'arène. Une goutte qui
     * voyage seule pendant plusieurs secondes doit se voir et accrocher ce
     * qu'elle frôle.
     */
    radius: 26,
    /**
     * 6,5 s à 300 px/s : ~1950 px, une fois et demie la largeur de l'arène, et
     * une poignée de rebonds. C'est ce qui fait tenir la promesse du power-up.
     */
    lifeMs: 6500,
    /** Écart de cap TOTAL entre les deux gouttes d'« Éclaboussure », en rad (~29°) : chacune dévie de la moitié. */
    splitAngle: 0.5,
    /**
     * La trace d'encre peinte derrière la goutte, mortelle comme le sillage de
     * la Ruée. Ces trois chiffres se lisent ensemble, et c'est leur produit qui
     * fait la puissance du power-up :
     *
     * à 300 px/s, une trace tous les 45 ms tombe tous les 13,5 px, donc des
     * disques de 20 se recouvrent très largement et le ruban est continu. Avec
     * 1100 ms de tenue, ~24 traces coexistent, soit un ruban d'environ 330 px de
     * long sur 40 de large — 26 % de la largeur d'arène.
     *
     * 1100 est près d'un mur : `hazard.test.ts` exige `trailLifeMs < DRY_MS *
     * 1.5`, soit 1200 ms. Au-delà, la trace entrerait dans la fenêtre
     * d'assèchement de la goutte et naîtrait déjà sèche — elle a son propre
     * séchage (`inkTrailWetness`) précisément pour ça. Allonger davantage
     * demande de traiter ce séchage, pas de pousser ce chiffre.
     *
     * `trailRadius` reste plus petit que la goutte (26), et c'est ce qui tient
     * la lecture : le ruban est une peinture qui sèche, la tête reste le danger
     * vif. Un ruban aussi large que la goutte transformerait l'arène en
     * labyrinthe.
     */
    trailIntervalMs: 45,
    trailLifeMs: 1100,
    trailRadius: 20,
    /**
     * L'irrégularité d'une tache : son rayon est tiré dans
     * ±`trailRadiusJitter`, et son centre décalé jusqu'à `trailOffsetPx`
     * **perpendiculairement** au cap de la goutte.
     *
     * Perpendiculaire et non libre, et ce n'est pas une question de goût : c'est
     * ce qui garde le ruban étanche. Deux taches voisines sont espacées d'au
     * plus 15 px le long du cap (l'accumulateur ne peut se vider qu'à un pas de
     * simulation, donc trois pas de 16,67 ms à 300 px/s) ; un décalage libre
     * s'ajouterait à cet espacement, un décalage perpendiculaire n'ouvre qu'un
     * triangle rectangle — √(15² + 12²) = 19,2 px, toujours sous les 28,8 px que
     * couvrent deux taches tirées toutes deux au plus petit. Aucun trou, quel
     * que soit le tirage, et `ricochet.test.ts` refait ce calcul à partir de ces
     * trois constantes.
     */
    trailRadiusJitter: 0.28,
    trailOffsetPx: 6,
  },
  halo: {},
} as const

export const PICKUP_RADIUS = 14
export const PICKUP_LIFE_MS = 14_000

/**
 * Réglages des règles rares (`RunStats.rules`). Ce ne sont pas des valeurs de
 * power-up de base : aucune carte commune ne les fait varier, seule la
 * présence de la règle dans `rules` les active.
 */
export const RULE_TUNING = {
  /** Givre rampant : rayon de contamination d'un ennemi gelé. */
  freezeSpreadRadius: 70,
  /** Fraction du temps restant emportée par saut (décroissance géométrique) ; sous `freezeSpreadFloorMs`, un ennemi ne propage plus, sinon la chaîne s'auto-entretiendrait. */
  freezeSpreadFactor: 0.6,
  freezeSpreadFloorMs: 300,
  /**
   * Papier calque : le fantôme rejoue la position du joueur d'il y a `delayMs`,
   * dans un disque de `radius`.
   *
   * 2500 ms rend le calque jouable plutôt que collant : à un délai court il
   * suit le joueur partout, à un délai long le joueur a oublié son propre
   * trajet. 14 px contre 9 au joueur : le calque doit se lire comme une tache,
   * pas comme un double exact.
   */
  tracingPaper: { delayMs: 2500, radius: 14 },
  /**
   * Double trait : chaque power-up ramassé se rejoue une fois, `delayMs` plus
   * tard, à la position du joueur **à cet instant**.
   *
   * À 400 ms le joueur a le temps de se déplacer d'un peu moins d'une longueur
   * de Bombe (240 px à 600 px/s) : les deux zones se recouvrent à moitié, ce qui
   * se lit comme un coup double et non comme deux coups. Plus court, la carte
   * n'est qu'un « ×2 » ; plus long, on ne relie plus la seconde au ramassage.
   */
  doubleStroke: { delayMs: 400 },
  /**
   * Le papier boit : chaque ennemi tué laisse une tache d'encre mortelle
   * (`HAZARD_INK_TRAIL`).
   *
   * 22 px contre 26 à la goutte de Bavure, et **c'est cet écart qui tient la
   * cascade en laisse** : une tache tue un voisin, qui laisse la sienne. La
   * réaction en chaîne est voulue — bornée par le nombre d'ennemis vivants,
   * jamais infinie — mais son rayon décide de la taille des grappes qu'elle
   * traverse d'un bout à l'autre.
   *
   * 1200 ms est court exprès : la tache cueille ce qui converge déjà vers le
   * cadavre, elle ne transforme pas l'arène en champ de mines.
   */
  thirstyPaper: { radius: 22, lifeMs: 1200 },
  /**
   * Onde de rupture : le Halo brisé pose une explosion au point de contact. Il
   * ne tue plus seulement l'ennemi fautif — celui-là meurt déjà — il emporte la
   * grappe qui l'accompagnait.
   *
   * 140 se lit entre les deux explosions du jeu : sous la Bombe (150),
   * franchement au-dessus de celle de la plume (90). Le repère est « dégager la
   * grappe qui vous a touché », pas l'arène. Plus large que la Bombe ferait du
   * Halo le meilleur outil offensif du jeu par accident, alors qu'il est le
   * power-up défensif — et il est déjà l'un des plus rares (`POWERUP_WEIGHT`).
   *
   * `growthRate` est celui de toutes les explosions, Bombe et plume comprises :
   * une explosion doit se lire pareil quelle que soit sa taille. `lingerMs` est
   * celui de la plume (300) et non celui de la Bombe (450) — la rupture est un
   * événement, pas un piège qu'on laisse derrière soi.
   *
   * **Seule zone de `RULE_TUNING` mise à l'échelle par `rangeScale`**, et c'est
   * un choix, pas un écart : elle suit la famille des explosions (toutes mises
   * à l'échelle, `stats.blastRadius` comme `POWERUP_BASE.volley.blastRadius`)
   * plutôt que celle de ses voisines ici (`thirstyPaper` 22 px, `tracingPaper`
   * 14 px, qui posent leur rayon brut). À 140 px l'écart n'est pas théorique :
   * sans mise à l'échelle, une arène mobile la verrait couvrir
   * proportionnellement bien plus qu'une arène de bureau. Savoir si l'absence
   * de mise à l'échelle des deux autres est un choix ou un oubli reste une
   * question ouverte, hors périmètre.
   */
  haloBurst: { radius: 140, growthRate: 320, lingerMs: 300 },
} as const
