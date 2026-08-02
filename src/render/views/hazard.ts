import { Container, Graphics } from 'pixi.js'

import {
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_BRAMBLE,
  HAZARD_INK_TRAIL,
  HAZARD_QUILL,
  HAZARD_SPLATTER,
  HAZARD_TRACING,
  HAZARD_TRAIL,
  POWERUP_BASE,
} from '@/sim/data/powerups'
import { INK, mixColor } from '../ink'

export interface HazardView {
  container: Container
  update(opts: {
    x: number
    y: number
    radius: number
    kind: number
    lifeRatio: number
    /** Temps de simulation, en ms — anime la rotation du tourbillon. */
    time: number
    /** Temps de vie restant en ms, brut — pilote l'avertissement de fin des épines. */
    remainingMs: number
    /**
     * `null` pour les zones sans direction propre (Bombe, Buvard) — jamais
     * 0 : un défaut à 0 ferait pointer un chevron vers +x avec
     * l'aplomb d'une information vraie.
     */
    angle: number | null
  }): void
}

const COLORS: Record<number, number> = {
  [HAZARD_BLAST]: INK.blast,
  [HAZARD_TRAIL]: INK.paper,
  [HAZARD_BLOTTER]: INK.paper,
  [HAZARD_BRAMBLE]: INK.paper,
  [HAZARD_QUILL]: INK.paper,
  [HAZARD_SPLATTER]: INK.paper,
  [HAZARD_INK_TRAIL]: INK.paper,
  [HAZARD_TRACING]: INK.paper,
}

/**
 * Trois bras en spirale logarithmique, tournant avec le temps de simulation
 * (pas une horloge murale, pour rester figé pendant un hitstop) — le Buvard
 * doit se lire comme un trou noir qui tourbillonne, pas un disque plat.
 */
function drawVortex(
  gfx: Graphics,
  radius: number,
  color: number,
  lifeRatio: number,
  time: number,
): void {
  gfx.circle(0, 0, radius).fill({ color, alpha: 0.05 * lifeRatio })

  const arms = 3
  const turns = 1.15
  const steps = 20
  const rotation = time * 0.0016 // ~1,6 rad/s : sens purement visuel, indépendant du taux de rotation réel du tourbillon (hazards.ts)

  for (let arm = 0; arm < arms; arm++) {
    const armOffset = (arm / arms) * Math.PI * 2
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // Le rayon ne descend jamais à zéro : un bras qui converge en un point
      // exact serait un artefact visuel, pas un tourbillon.
      const r = radius * (0.18 + (1 - t) * 0.82)
      const a = armOffset + rotation + t * turns * Math.PI * 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) {
        gfx.moveTo(x, y)
      } else {
        gfx.lineTo(x, y)
      }
    }
  }
  gfx.stroke({ color, width: 1.6, alpha: 0.65 * lifeRatio })
}

// En fraction de `radius` (le disque mortel réel) pour que l'épine reste par construction inscrite dedans.
const BRAMBLE_TIP_RATIO = 1 // pointe : touche le bord du disque, jamais au-delà
const BRAMBLE_HALF_WIDTH_RATIO = 0.8 // demi-largeur de la base, perpendiculaire à l'axe
const BRAMBLE_BACK_RATIO = 0.55 // base, en retrait du centre
// Plage du rétrécissement de fin de vie : 70 % à 100 % de la taille normale,
// interpolée linéairement sur la fenêtre `warnMs`.
const BRAMBLE_SHRINK_MIN = 0.7
const BRAMBLE_SHRINK_RANGE = 0.3

/**
 * Seule zone du jeu dont le dessin est **plus petit** que la collision, et le
 * seul endroit où ce sens-là est le bon. Ailleurs le disque de vérité est
 * tracé en propre parce que la zone tue *à la place du joueur* : y dessiner
 * moins que ce qui tue tromperait sa lecture du danger. La couronne, elle, ne
 * touche jamais le joueur (`hazardSystem` ne cible que `Enemy`) et elle est
 * étanche depuis `powerups.ts` : le seul écart possible est qu'un ennemi
 * meure un poil avant d'avoir touché la pointe visible. Cette erreur-là ne
 * peut jamais coûter une vie — celle du disque dessiné, si : une bulle qui
 * paraît barrer plus large que l'épine réelle, oui.
 *
 * D'où l'épine seule, sans le disque autour : un triangle inscrit dans le
 * cercle de collision (coins de base à
 * `√(0,55² + 0,8²) ≈ 0,97 · radius` du centre, donc jamais débordants). Sur
 * les dernières `warnMs`, elle pulse et se rétracte pour avertir ; la zone
 * mortelle, elle, reste à `radius` constant.
 */
function drawBramble(
  gfx: Graphics,
  radius: number,
  color: number,
  angle: number,
  remainingMs: number,
  time: number,
): void {
  const warn = POWERUP_BASE.bramble.warnMs
  const ending = remainingMs < warn
  const wave = Math.sin((time / 1000) * Math.PI * 2 * 5)
  // Bornée loin de zéro : l'épine ne fait que 16 px de long pour 20 px entre
  // deux lignes de réglure (render/page.ts), tracées dans la même encre — au
  // creux d'un battement elle se composite par-dessus des traits de sa propre
  // couleur. Une épine optiquement absente pendant qu'elle tue encore serait
  // le seul vrai piège de ce dessin.
  const pulse = ending ? 0.7 + 0.3 * wave : 1
  const shrink = ending ? BRAMBLE_SHRINK_MIN + BRAMBLE_SHRINK_RANGE * (remainingMs / warn) : 1

  const len = radius * BRAMBLE_TIP_RATIO * shrink
  const half = radius * BRAMBLE_HALF_WIDTH_RATIO * shrink
  const back = radius * BRAMBLE_BACK_RATIO * shrink
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Coordonnées nommées plutôt que tuples indexés : `src/render/` n'a pas
  // droit à `!`, qu'indexer un tableau littéral exigerait sous `noUncheckedIndexedAccess`.
  const tipX = cos * len
  const tipY = sin * len
  const backX = -cos * back
  const backY = -sin * back
  const sideX = -sin * half
  const sideY = cos * half

  // Triangle à trois sommets : la pointe, et deux coins de base alignés sur
  // l'arrière. Le losange d'avant plaçait ses flancs au milieu de l'axe, d'où
  // une silhouette de bulle plutôt que d'épine.
  gfx
    .moveTo(tipX, tipY)
    .lineTo(backX + sideX, backY + sideY)
    .lineTo(backX - sideX, backY - sideY)
    .closePath()
    .fill({ color, alpha: 0.9 * pulse })
}

/**
 * La plume en vol : un fer de lance orienté par son `Facing`, avec une barbe
 * traînante. Volontairement plus étroite que son rayon de contact — c'est la
 * seule zone du jeu qui ne tue pas par elle-même (son explosion s'en charge),
 * donc la règle « le dessin contient ce qui tue » ne s'y applique pas.
 */
function drawQuill(gfx: Graphics, radius: number, color: number, angle: number): void {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const tip = radius * 2.2
  const back = radius * 1.4
  const half = radius * 0.7

  gfx
    .moveTo(cos * tip, sin * tip)
    .lineTo(-sin * half - cos * back, cos * half - sin * back)
    .lineTo(sin * half - cos * back, -cos * half - sin * back)
    .fill({ color })

  // Barbe traînante : sans elle, la plume se lit comme un simple triangle et
  // son sens de vol devient ambigu à petite taille.
  gfx
    .moveTo(-cos * back, -sin * back)
    .lineTo(-cos * back * 2.4, -sin * back * 2.4)
    .stroke({ color, width: 1, alpha: 0.4 })
}

/**
 * La déformation d'une tache d'encre : de combien son rayon gonfle, et où.
 *
 * Décrite comme une donnée plutôt que câblée dans le tracé, parce que c'est
 * exactement ce qui doit varier d'une tache à l'autre. L'ancien dessin ne
 * faisait tourner qu'une `phase` en gardant partout les mêmes amplitudes et
 * les mêmes fréquences (3 et 5) : toutes les taches étaient donc la même
 * silhouette pivotée, et le ruban se lisait comme un motif répété.
 */
export interface InkBlob {
  rotation: number
  ampA: number
  ampB: number
  freqA: number
  freqB: number
}

/**
 * Un tirage dans [0, 1[ déterminé par la position et un grain. Le classique
 * `sin` haché : pas une bonne source d'aléa, mais la bonne ici — il ne demande
 * aucun état, et surtout il est **reproductible**. Une tache doit garder sa
 * forme d'une image à l'autre ; tirée au `Math.random` elle scintillerait.
 */
function hash01(x: number, y: number, grain: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + grain * 37.719) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Deux fréquences **premières entre elles**, choisies par paires explicites.
 * Leur battement ne se répète pas sur un tour : la tache n'a donc pas d'axe de
 * symétrie visible et cesse de se lire comme une figure géométrique. Un couple
 * partageant un facteur (4 et 8) rendrait au contraire une forme visiblement
 * régulière — d'où la liste, plutôt qu'un tirage libre.
 *
 * Plafonnées à 7 : `INK_TRAIL_STEPS` échantillonne le contour, et une
 * harmonique plus rapide que ~3 points par période s'y replierait en bruit.
 */
function blobFreqs(h: number): { a: number; b: number } {
  if (h < 0.25) {
    return { a: 3, b: 5 }
  }
  if (h < 0.5) {
    return { a: 3, b: 7 }
  }
  if (h < 0.75) {
    return { a: 4, b: 7 }
  }
  return { a: 5, b: 7 }
}

/**
 * La forme d'une tache posée en (x, y) — figée, puisque tirée de sa seule
 * position. Chaque tache reçoit sa rotation, ses deux amplitudes et son couple
 * de fréquences : certaines sortent presque rondes, d'autres franchement
 * bosselées à trois lobes, d'autres ridées à sept.
 */
export function blobAt(x: number, y: number): InkBlob {
  const freqs = blobFreqs(hash01(x, y, 3))
  return {
    rotation: hash01(x, y, 0) * Math.PI * 2,
    // Amplitudes larges, et c'est délibéré : à 13,5 px d'écart pour 15 px de
    // rayon, les taches se recouvrent aux deux tiers. Seule celle qui déborde
    // le plus décide du bord du ruban à un endroit donné — des déformations
    // sages disparaîtraient donc entièrement dans l'union, et le ruban
    // redeviendrait le tube lisse qu'on essaie de quitter.
    ampA: 0.05 + hash01(x, y, 1) * 0.3,
    ampB: 0.03 + hash01(x, y, 2) * 0.17,
    freqA: freqs.a,
    freqB: freqs.b,
  }
}

/**
 * Contour d'une tache d'encre : un cercle dont le rayon ne fait que **gonfler**
 * par endroits, jamais rentrer.
 *
 * C'est la contrainte qui gouverne tout le dessin. `radius` est le rayon
 * mortel ; un lobe qui mordrait vers l'intérieur laisserait une bande
 * meurtrière hors du dessin, et le jeu ne promet rien d'autre que « ce que tu
 * vois est ce qui tue ». Les deux harmoniques sont donc remises dans [0, 1]
 * avant d'être ajoutées — leur somme est positive ou nulle, jamais négative,
 * quelles que soient les amplitudes tirées.
 */
export function inkBlobRadius(blob: InkBlob, radius: number, t: number): number {
  const { rotation, ampA, ampB, freqA, freqB } = blob
  const lobe =
    ampA * (1 + Math.sin(t * freqA + rotation)) * 0.5 +
    ampB * (1 + Math.sin(t * freqB - rotation * 1.7)) * 0.5
  return radius * (1 + lobe)
}

function inkBlobPath(gfx: Graphics, radius: number, blob: InkBlob, steps: number): void {
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const r = inkBlobRadius(blob, radius, t)
    const px = Math.cos(t) * r
    const py = Math.sin(t) * r
    if (i === 0) {
      gfx.moveTo(px, py)
    } else {
      gfx.lineTo(px, py)
    }
  }
  gfx.closePath()
}

/**
 * Fenêtre d'assèchement : les dernières millisecondes pendant lesquelles une
 * zone qui dure annonce sa fin.
 *
 * Vit ici et non dans les réglages de simulation, comme `INK_TRAIL_DRY_MS` et
 * pour la même raison : c'est une convention de lecture, pas une propriété
 * d'un power-up. Toute zone assez longue finit au même rythme, quelle que soit
 * sa durée totale.
 */
export const DRY_MS = 800

/**
 * Opacité plancher du remplissage d'une zone sèche, en fraction de son opacité
 * humide. **Pas zéro, jamais** : la zone tue jusqu'à sa dernière image, et la
 * faire disparaître avant sa mort en ferait une zone mortelle invisible —
 * exactement ce que le reste de ce fichier refuse.
 */
export const DRY_FILL_FLOOR = 0.45

/**
 * Part d'humidité d'une zone à `remainingMs` de sa mort : 1 (humide) tant que
 * la fin est loin, 0 (sec) à l'instant où elle meurt.
 *
 * Bornée aux deux bouts, et c'est le seul point délicat : `stage.ts` passe
 * `Number.POSITIVE_INFINITY` pour une zone sans `Lifetime` (le calque), et un
 * quotient non borné rendrait alors `Infinity` — une opacité `Infinity` se
 * lirait comme un dessin qui n'a jamais existé. Un temps restant négatif, lui,
 * ne devrait pas arriver, mais rendrait une opacité négative sur la seule
 * image où la simulation aurait un pas d'avance sur le rendu.
 */
export function dryness(remainingMs: number): number {
  if (!Number.isFinite(remainingMs)) {
    // `+Infinity` : une zone qui ne finit jamais n'a rien à annoncer, elle
    // reste humide pour toujours. `-Infinity` et `NaN` retombent sur « sèche »,
    // et c'est le repli sûr : sec ne veut pas dire invisible (le remplissage
    // s'arrête à `DRY_FILL_FLOOR`), là où un `NaN` laissé filer effacerait le
    // tracé entier de Pixi.
    return remainingMs > 0 ? 1 : 0
  }
  return Math.min(1, Math.max(0, remainingMs / DRY_MS))
}

/**
 * Facteur d'opacité du remplissage pendant l'assèchement : 1 (humide) puis
 * jusqu'à `DRY_FILL_FLOOR` (sec). À multiplier par les alphas du remplissage —
 * jamais par ceux du liseré, qui fait le mouvement inverse.
 */
export function dryFillAlpha(remainingMs: number): number {
  return DRY_FILL_FLOOR + (1 - DRY_FILL_FLOOR) * dryness(remainingMs)
}

/** Le creux de la goutte, en fraction du rayon mortel, et sa dilution vers le fond. */
const DROP_CORE_RATIO = 0.36
const DROP_CORE_DILUTION = 0.58
/** Épaisseur du liseré de la goutte, humide puis sèche. */
const DROP_RIM_WIDTH_WET = 2.2
const DROP_RIM_WIDTH_DRY = 3.6

/**
 * La goutte de Bavure : une goutte encore humide, anneau franc et cœur creusé.
 *
 * Deux dessins ont échoué avant celui-ci. Le disque net flanqué de trois
 * satellites en orbite se lisait comme une molécule de manuel de chimie. La
 * tache irrégulière qui l'a remplacé était de l'encre, enfin — mais elle
 * partageait son contour avec les taches de sa propre trace, et n'était donc
 * qu'une tache de plus, en plus gros : l'œil perdait la tête dans sa traînée.
 *
 * Ce qui la distingue ici n'est pas sa taille mais sa **structure**. Le ruban
 * est plat, dilué, figé ; la goutte est pleine, à l'encre pure, cernée d'un
 * liseré net, creusée en son centre — et elle respire. Aucun de ces quatre
 * traits n'appartient à la trace.
 *
 * Le creux ne perce pas jusqu'au fond : le disque mortel reste dessous, et le
 * cœur n'est qu'une encre mélangée vers le fond par-dessus. Il se lit comme la
 * profondeur d'une goutte, jamais comme une absence d'encre — un vrai trou
 * dirait « ici tu ne risques rien », au milieu exact de ce qui tue.
 *
 * La déformation suit `time`, le temps de SIMULATION : elle gèle donc pendant
 * un hitstop, avec le reste du monde, au lieu de continuer à vivre toute seule.
 *
 * Sur ses `DRY_MS` dernières millisecondes, la goutte **s'assèche** : le
 * remplissage pâlit jusqu'à `DRY_FILL_FLOOR`, pendant que le liseré du rayon
 * mortel s'épaissit. La goutte est la seule zone du jeu assez longue (6,5 s)
 * pour qu'un avertissement de 800 ms veuille dire quelque chose.
 *
 * **Le rayon ne bouge pas d'un pixel.** Rétrécir le dessin d'une zone qui tue
 * encore laisserait une bande meurtrière hors du trait ; l'assèchement fait
 * l'inverse — il efface le remplissage et laisse la frontière, plus explicite
 * que jamais au moment où elle compte le plus.
 */
function drawSplatterDrop(
  gfx: Graphics,
  radius: number,
  color: number,
  time: number,
  remainingMs: number,
): void {
  const wet = dryness(remainingMs)
  const fill = dryFillAlpha(remainingMs)

  // Le disque mortel d'abord, plein : quoi qu'il arrive au contour, cette
  // surface-là est couverte.
  gfx.circle(0, 0, radius).fill({ color, alpha: fill })

  // Puis les lobes par-dessus, qui ne font que déborder. Amplitudes retenues,
  // et surtout pilotées par le temps : la goutte ondule au lieu d'être figée,
  // ce que ne fait aucune tache de la trace.
  const phase = time * 0.0009
  inkBlobPath(gfx, radius, { rotation: phase, ampA: 0.13, ampB: 0.08, freqA: 3, freqB: 5 }, 30)
  gfx.fill({ color, alpha: fill })

  // Le creux. Lui aussi bosselé, et à contretemps de la silhouette
  // (`-phase * 1.3`) : un disque parfaitement rond au milieu d'une tache
  // d'encre se lit comme un trou percé à l'emporte-pièce, pas comme un creux.
  gfx.beginPath()
  inkBlobPath(
    gfx,
    radius * DROP_CORE_RATIO,
    { rotation: -phase * 1.3, ampA: 0.16, ampB: 0.1, freqA: 3, freqB: 7 },
    20,
  )
  gfx.fill({ color: mixColor(color, INK.bg, DROP_CORE_DILUTION), alpha: 0.85 * fill })

  // Puis le liseré au rayon mortel EXACT — la frontière de ce qui tue reste
  // tracée en propre, sous les lobes qui la débordent.
  //
  // Il se renforce en s'ÉPAISSISSANT, et non en gagnant de l'opacité : la
  // goutte le porte déjà à 0,95 dès sa naissance (c'est ce qui la distingue
  // des taches de sa propre trace), et il ne reste rien à gagner au-dessus.
  // C'est le trait qui grossit pendant que le remplissage s'efface.
  gfx.circle(0, 0, radius).stroke({
    color,
    width: DROP_RIM_WIDTH_DRY + (DROP_RIM_WIDTH_WET - DROP_RIM_WIDTH_DRY) * wet,
    alpha: 0.95,
  })
}

/** Échantillons du contour d'une tache de trace : 24 pour une harmonique à 7. */
const INK_TRAIL_STEPS = 24
/**
 * Le séchage d'une tache, compté en ms **avant sa mort** et non depuis sa
 * naissance. C'est ce qui permet à la constante de rester ici plutôt que de
 * suivre un réglage de simulation : `HAZARD_INK_TRAIL` est un genre de zone,
 * pas la propriété de la Bavure, et la vue n'a pas à savoir qui l'a semée.
 *
 * Toute tache finit donc son séchage au même rythme, quelle que soit sa durée.
 * Celles de la Bavure (850 ms) sèchent sur pratiquement toute leur existence ;
 * une tache plus tenace reste simplement humide plus longtemps avant d'entrer
 * dans la même fin. Dans les deux cas, plus de palier suivi d'une cassure.
 */
const INK_TRAIL_DRY_MS = 700
/**
 * Opacité fraîche et opacité sèche. Le plancher n'est **pas** zéro : la tache
 * tue jusqu'à sa toute dernière image, et la faire disparaître avant sa mort
 * en ferait une zone mortelle invisible — précisément ce que le reste du
 * fichier refuse. 0,28 sur le fond sombre reste franchement lisible.
 */
const INK_TRAIL_ALPHA_FRESH = 0.8
const INK_TRAIL_ALPHA_DRY = 0.28
/** Dilution de l'encre vers le fond, fraîche puis sèche. */
const INK_TRAIL_WET_DILUTION = 0.35
const INK_TRAIL_DRY_DILUTION = 0.55

/** Départ et arrivée sans cassure : c'est tout l'intérêt sur un fondu long. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Part d'humidité d'une tache, de 1 (fraîche) à 0 (sèche). */
export function inkTrailWetness(remainingMs: number): number {
  return smoothstep(Math.min(1, Math.max(0, remainingMs / INK_TRAIL_DRY_MS)))
}

/** Opacité d'une tache à `remainingMs` de sa mort. */
export function inkTrailAlpha(remainingMs: number): number {
  return (
    INK_TRAIL_ALPHA_DRY +
    (INK_TRAIL_ALPHA_FRESH - INK_TRAIL_ALPHA_DRY) * inkTrailWetness(remainingMs)
  )
}

/**
 * Une tache de la trace d'encre. **Elle tue**, donc le disque plein couvre
 * exactement son rayon mortel, et les lobes ne font que déborder — même règle
 * que la goutte, pour la même raison.
 *
 * Sa forme vient de sa position, pas du temps : deux taches voisines ne doivent
 * pas se déformer à l'unisson, sinon le ruban ondule comme un serpent au lieu
 * de se lire comme de la peinture posée. Figée par tache, elle ne scintille pas
 * d'une image à l'autre — et, contrairement à la goutte, elle ne bouge plus du
 * tout : c'est de l'encre qui a séché.
 *
 * Le fondu se calcule sur `remainingMs` et non sur `lifeRatio`, qui est une
 * falaise : la fenêtre globale de 400 ms laissait la tache à pleine opacité
 * pendant l'essentiel de sa vie, la faisait tomber à 55 % en 400 ms, puis
 * disparaître d'un coup depuis ce palier. Ici elle sèche en continu, lissée,
 * en pâlissant ET en se diluant vers le fond — de l'encre délavée, pas un
 * voile blanc qui s'éteint.
 */
function drawInkTrail(
  gfx: Graphics,
  radius: number,
  color: number,
  remainingMs: number,
  x: number,
  y: number,
): void {
  const wet = inkTrailWetness(remainingMs)
  const alpha = inkTrailAlpha(remainingMs)
  const dilution = INK_TRAIL_DRY_DILUTION + (INK_TRAIL_WET_DILUTION - INK_TRAIL_DRY_DILUTION) * wet
  const diluted = mixColor(color, INK.bg, dilution)

  gfx.circle(0, 0, radius).fill({ color: diluted, alpha })
  inkBlobPath(gfx, radius, blobAt(x, y), INK_TRAIL_STEPS)
  gfx.fill({ color: diluted, alpha })
}

/** Tirets du liseré du calque : leur compte et la part d'arc que chacun couvre. */
const TRACING_DASHES = 12
const TRACING_DASH_FILL = 0.55

/**
 * Le calque de « Papier calque ». Il tue, donc le disque plein couvre
 * **exactement** son rayon mortel : un dessin plus petit laisserait une bande
 * meurtrière invisible, contre la règle que le projet défend partout.
 *
 * Le liseré pointillé se pose par-dessus, au même rayon — il dit « copie » (un
 * calque est un trait recopié, pas le trait d'origine) sans jamais rogner la
 * surface qui tue. Les tirets sont figés dans le repère de la zone et ne
 * tournent pas : le calque n'a pas de direction propre, une rotation lui en
 * inventerait une.
 */
function drawTracing(gfx: Graphics, radius: number, color: number): void {
  gfx.circle(0, 0, radius).fill({ color, alpha: 0.45 })

  const span = (Math.PI * 2) / TRACING_DASHES
  for (let i = 0; i < TRACING_DASHES; i++) {
    const start = i * span
    // `moveTo` avant chaque arc : sans lui, Pixi relie le tiret précédent au
    // suivant et le pointillé redevient un cercle plein.
    gfx.moveTo(Math.cos(start) * radius, Math.sin(start) * radius)
    gfx.arc(0, 0, radius, start, start + span * TRACING_DASH_FILL)
  }
  gfx.stroke({ color, width: 1.5, alpha: 0.9 })
}

// En fraction de `radius` (le disque mortel réel), pour que le chevron reste par construction inscrit dedans.
const CHEVRON_TIP_RATIO = 1
const CHEVRON_WING_BACK_RATIO = 0.45
const CHEVRON_WING_HALF_RATIO = 0.62
const CHEVRON_NOTCH_RATIO = 0.1

/**
 * Le disque à `radius` est le cercle de collision réel ; le chevron n'est
 * qu'une lecture du sens de la ruée inscrite dedans — un chevron seul
 * laisserait les flancs du disque mortels mais invisibles.
 *
 * `visible` relève le plancher d'opacité : la fenêtre de fondu (400 ms) est
 * plus courte que la vie du segment (800 ms), qui reste mortel après.
 *
 * `angle` à `null` : disque seul, jamais de flèche inventée.
 */
function drawWake(
  gfx: Graphics,
  radius: number,
  color: number,
  angle: number | null,
  lifeRatio: number,
): void {
  const visible = 0.25 + 0.75 * lifeRatio

  gfx.circle(0, 0, radius).fill({ color, alpha: 0.22 * visible })
  gfx.circle(0, 0, radius).stroke({ color, width: 1.5, alpha: 0.5 * visible })

  if (angle === null) {
    return
  }

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const tip = radius * CHEVRON_TIP_RATIO
  const back = radius * CHEVRON_WING_BACK_RATIO
  const half = radius * CHEVRON_WING_HALF_RATIO
  const notch = radius * CHEVRON_NOTCH_RATIO

  const tipX = cos * tip
  const tipY = sin * tip
  const wingX = -cos * back
  const wingY = -sin * back
  const sideX = -sin * half
  const sideY = cos * half
  const notchX = -cos * notch
  const notchY = -sin * notch

  gfx
    .moveTo(tipX, tipY)
    .lineTo(wingX + sideX, wingY + sideY)
    .lineTo(notchX, notchY)
    .lineTo(wingX - sideX, wingY - sideY)
    .closePath()
    .fill({ color, alpha: 0.75 * visible })
}

export function createHazardView(): HazardView {
  const container = new Container()
  const gfx = new Graphics()
  container.addChild(gfx)
  return {
    container,
    update({ x, y, radius, kind, lifeRatio, time, remainingMs, angle }) {
      container.x = x
      container.y = y
      gfx.clear()

      const color = COLORS[kind] ?? INK.paper

      if (kind === HAZARD_BRAMBLE) {
        // `angle ?? 0` : les épines portent toujours `Facing`, ce repli ne devrait jamais s'activer.
        drawBramble(gfx, radius, color, angle ?? 0, remainingMs, time)
        return
      }

      if (kind === HAZARD_QUILL) {
        // `angle !== null` plutôt qu'un repli à 0 : sans `Facing`, la vue doit
        // s'abstenir de dessiner une plume plutôt que d'en pointer une au
        // hasard — c'est la règle que le type `angle: number | null` impose
        // déjà en tête de ce fichier.
        if (angle !== null) {
          drawQuill(gfx, radius, color, angle)
        }
        return
      }

      if (kind === HAZARD_SPLATTER) {
        drawSplatterDrop(gfx, radius, color, time, remainingMs)
        return
      }

      if (kind === HAZARD_TRACING) {
        drawTracing(gfx, radius, color)
        return
      }

      if (kind === HAZARD_INK_TRAIL) {
        // `remainingMs` et non `lifeRatio` : la trace mène son propre séchage,
        // plus long et lissé, là où `lifeRatio` est une fenêtre de 400 ms
        // commune à toutes les zones.
        drawInkTrail(gfx, radius, color, remainingMs, x, y)
        return
      }

      if (kind === HAZARD_BLOTTER) {
        drawVortex(gfx, radius, color, lifeRatio, time)
      } else if (kind === HAZARD_TRAIL) {
        drawWake(gfx, radius, color, angle, lifeRatio)
      } else {
        gfx.circle(0, 0, radius).stroke({ color, width: 3, alpha: lifeRatio })
      }
    },
  }
}
