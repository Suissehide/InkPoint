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
 * genre rééquilibrerait le sac tout seul. Des poids explicites coupent ce
 * lien. Quatre offensifs (`blast`, `freeze`, `dash`, `volley`)
 * partagent le poids plein ; les trois autres sont raréfiés en dessous, chacun pour sa
 * propre raison : la Bavure (`splatter`) parce qu'elle est la seule à
 * continuer de travailler pendant que le joueur esquive ailleurs — le Halo
 * parce que c'est lui qui empêche de mourir, donc celui dont une inflation se
 * sentirait le plus — et la Ronce (`bramble`),
 * raréfiée plus encore que le Halo, parce qu'elle sortait trop souvent au
 * goût du joueur. Les proportions exactes se lisent dans le tableau
 * ci-dessous, pas ici : elles bougent à chaque réglage, ce commentaire non.
 */
export const POWERUP_WEIGHT: Record<PowerUpKind, number> = {
  blast: 4,
  freeze: 4,
  // Le power-up le plus rare du jeu, sous le Halo : la Ronce sortait trop
  // souvent au goût du joueur, et son statut passe de courante à
  // exceptionnelle. Conséquence assumée : `draw.ts` conditionne les cartes à
  // `seenPowerups`, donc « Longue ronce » et « Ronce vivace » entrent bien
  // plus tard dans le tirage.
  bramble: 1,
  blotter: 4,
  dash: 4,
  halo: 1.5,
  volley: 4,
  // Sous les offensifs à plein poids, au-dessus du Halo : elle travaille seule
  // pendant qu'on esquive ailleurs, elle n'a pas à sortir aussi souvent qu'une
  // Bombe.
  splatter: 3,
}

/**
 * Genres retirés du sac de tirage sans être supprimés : identifiant, poids et
 * code restent en place, une ligne à retirer les remet en jeu.
 *
 * Un poids à zéro aurait produit le même effet visible, mais `powerups.test.ts`
 * exige un poids strictement positif pour chaque genre — un zéro y serait
 * indistinguable d'un oubli, là où un ensemble nommé dit ce qu'il fait.
 *
 * Le Buvard sort ici parce que son tourbillon plaisait moins qu'il ne
 * dérangeait. Sa carte « Papier assoiffé » n'a rien à faire de son côté :
 * `draw.ts` conditionne toute carte à `seenPowerups`, elle cesse d'être
 * tirable d'elle-même et reviendra pareillement d'elle-même.
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
/** Plume en vol de la Volée. N'est PAS dans `LETHAL` : c'est son explosion qui tue. */
export const HAZARD_QUILL = 8
/** Goutte de Bavure en vol. Contrairement à la plume, elle EST mortelle : elle rejoint `LETHAL`. */
export const HAZARD_SPLATTER = 9

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
     * barrent `2 · (thornRadius + r)` à un ennemi de rayon `r`. À 9 épines de
     * 8 px sur une orbite de 30, l'écart (20,5 px) reste sous les 28 px
     * barrés au plus petit ennemi (Éclat, r 6) : **plus rien ne se faufile.**
     *
     * C'est un renversement du réglage précédent (7 épines sur une orbite de
     * 40, écart 34,7 px), qui laissait passer Point et Éclat de propos
     * délibéré. Le playtest a tranché contre : une couronne qu'on croit
     * protectrice et qui laisse tuer se lit comme une mort volée. La Ronce
     * assume donc d'être un bouclier le temps de sa durée — c'est le power-up
     * le plus rare du jeu (POWERUP_WEIGHT). `powerups.test.ts` garde
     * l'étanchéité, calculée depuis ces constantes et jamais recopiée.
     *
     * L'anneau ne peut d'ailleurs pas être resserré *sans* refermer la
     * couronne : à 7 épines déjà, une orbite de 30 donne 26 px, sous le même
     * seuil de 28. Réduire la portée et garder les trous s'excluent.
     */
    count: 9,
    orbitRadius: 30,
    thornRadius: 8,
    /**
     * Choisi pour garder la vitesse de balayage d'avant malgré l'orbite plus
     * courte : 0,0021 rad/ms × 30 px ≈ 63 px/s en bout d'épine, contre 64
     * px/s à l'ancien couple (0,0016 × 40). La rotation n'a plus à rattraper
     * les resquilleurs — il n'y en a plus — elle ne porte que la lecture :
     * une couronne qui tourne se lit comme vivante, un anneau figé comme un
     * décor.
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
  /**
   * Volée de plumes. Les plumes ne tuent pas au passage : à l'impact elles
   * posent une explosion réduite et disparaissent, pour que ce que le joueur
   * voit reste exactement ce qui tue (spec §3.1).
   *
   * `turnRate` est en rad/ms comme `bramble.angularRate` : à 0,006 la plume
   * met ~520 ms à faire demi-tour, assez pour manquer une cible qui coupe sa
   * trajectoire — un téléguidage parfait n'aurait aucune lecture.
   */
  volley: {
    count: 3,
    speed: 340,
    turnRate: 0.006,
    lifeMs: 2600,
    quillRadius: 5,
    /**
     * Explosion d'impact. La Bombe fait 150 : celle-ci reste une petite sœur,
     * mais elle doit **emporter le voisinage de sa cible**, pas seulement elle.
     *
     * À 90, elle atteint 97 px sur un Point (rayon 7) : tout ce qui se tient à
     * moins de ~194 px de large autour de l'impact tombe avec. À 60, la portée
     * n'était que de 67 px et la volée se réduisait à trois exécutions
     * individuelles — ce n'était pas assez au goût du joueur.
     *
     * Le compte total reste honnête vis-à-vis de la Bombe : trois disques de 90
     * couvrent 76 000 px², contre 71 000 pour l'unique disque de 150. La Volée
     * ne gagne donc presque rien en surface — elle gagne le **placement**, ses
     * trois disques tombant là où sont les ennemis et non là où était la
     * pastille. C'est ce qui doit continuer à la distinguer de la Bombe, et la
     * raison de ne pas monter plus haut sans y regarder à deux fois.
     */
    blastRadius: 90,
    /** Même croissance que la Bombe : une explosion doit se lire pareil, quelle que soit sa taille. */
    blastGrowth: 320,
    /**
     * 120 ms ne laissaient presque rien après la croissance : la zone
     * atteignait sa taille et s'éteignait dans la foulée, sans jamais cueillir
     * un ennemi qui entrait dedans. À 300 (la Bombe tient 450), elle existe
     * assez longtemps pour que le groupe qui converge vers le joueur la
     * traverse.
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
     * 11 px se lisaient comme une bille perdue dans l'arène : une goutte qui
     * voyage seule pendant plusieurs secondes doit se voir, et surtout
     * accrocher ce qu'elle frôle. À 26, elle barre 33 px sur un Point (rayon 7)
     * contre 18 à l'origine, et elle rebondit plus tôt sur les murs — sa marge
     * de rebond est son propre rayon, ce qui la garde entièrement dans l'arène.
     */
    radius: 26,
    /**
     * 6,5 s à 300 px/s : la goutte parcourt ~1950 px, soit une fois et demie la
     * largeur de l'arène, et rebondit une poignée de fois. C'est ce qui fait
     * tenir la promesse du power-up — être le seul qui continue à travailler
     * pendant que le joueur esquive ailleurs. À 4,2 s elle s'éteignait à peine
     * le danger recommencé.
     */
    lifeMs: 6500,
    /** Écart de cap TOTAL entre les deux gouttes d'« Éclaboussure », en rad (~29°) : chacune dévie de la moitié. */
    splitAngle: 0.5,
  },
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
  /** Givre rampant / Encre vive : rayon de contamination d'un ennemi gelé. */
  freezeSpreadRadius: 70,
  /** Fraction du temps restant emportée par saut (décroissance géométrique) ; sous `freezeSpreadFloorMs`, un ennemi ne propage plus, sinon la chaîne s'auto-entretiendrait. */
  freezeSpreadFactor: 0.6,
  freezeSpreadFloorMs: 300,
  /** Rémanence : braise laissée par toute zone HAZARD_BLAST qui expire (Bombe ou impact de plume). */
  afterburn: { radiusRatio: 0.45, lifeMs: 1600 },
} as const
