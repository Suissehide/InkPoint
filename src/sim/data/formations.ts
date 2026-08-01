import { MAX_ENEMY_RADIUS } from './enemies'

export type FormationKind = 'line' | 'square' | 'circle' | 'vee' | 'spiral'

export const FORMATION_KINDS: readonly FormationKind[] = [
  'line',
  'square',
  'circle',
  'vee',
  'spiral',
]

/**
 * Chorégraphie de chaque formation : `formationSystem` applique ces réglages ;
 * `waveSystem` calcule `durationMs` séparément (fixe pour les figures
 * immobiles, dérivée de la traversée de l'arène pour celles qui avancent —
 * voir `crossingDurationMs`).
 */
export interface FormationChoreo {
  /** px/s : 0 = la formation ne se déplace pas comme un bloc. */
  travelSpeed: number
  /** Multiplicateur final des décalages initiaux (1 = pas de resserrement, jamais 0 — un resserrement total collerait les ennemis les uns sur les autres). */
  shrinkTo: number
  /** rad/s de rotation additionnelle, au-delà de l'orientation de marche figée au spawn. */
  spin: number
  /** ms — ignoré pour les formations qui avancent (voir crossingDurationMs). */
  holdMs: number
}

export const FORMATION_CHOREO: Record<FormationKind, FormationChoreo> = {
  // Avance droit devant, alignement inchangé, jusqu'à traverser l'arène.
  line: { travelSpeed: 130, shrinkTo: 1, spin: 0, holdMs: 0 },
  // Immobile : se resserre progressivement vers son propre centre, comme un étau.
  square: { travelSpeed: 0, shrinkTo: 0.15, spin: 0, holdMs: 2400 },
  // Immobile : se resserre en tournant lentement sur elle-même.
  circle: { travelSpeed: 0, shrinkTo: 0.12, spin: 1.4, holdMs: 2800 },
  // Avance pointe en avant, les ailes se referment progressivement.
  vee: { travelSpeed: 120, shrinkTo: 0.3, spin: 0, holdMs: 0 },
  // Avance en s'enroulant vers son centre.
  spiral: { travelSpeed: 90, shrinkTo: 0.15, spin: 1.8, holdMs: 0 },
}

/**
 * Retrait du bord, vers l'INTÉRIEUR de l'arène. Les ennemis naissaient
 * auparavant à cette distance à l'extérieur, où le masque de découpe du rendu
 * les cachait : leur contour pointillé — le seul signal disant « pas encore
 * mortel » — n'était jamais visible, et ils entraient dans le champ déjà
 * pleins. La valeur vaut `MAX_ENEMY_RADIUS` pour que le plus large d'entre eux
 * soit entièrement visible dès sa première image.
 */
export const FORMATION_EDGE_MARGIN = MAX_ENEMY_RADIUS

/**
 * Sursaut vers le joueur à la dislocation d'une figure traversante (Ligne, V,
 * Spirale). Vitesse au-delà de celle du joueur (240 px/s) pour se lire comme
 * une menace soudaine, pas du `Homing` ordinaire ; durée courte pour rester un
 * sursaut — `Homing` reprend ensuite.
 */
export const BURST_SPEED = 260
export const BURST_DURATION_MS = 350

/**
 * Durée de la chorégraphie pour une formation qui avance : temps de traverser
 * l'arène plus la marge hors-écran des deux côtés.
 *
 * `marginPx` vaut la marge du point d'apparition (`FORMATION_EDGE_MARGIN`) et
 * rien de plus : la profondeur du motif n'est pas compensée. Un V ou une
 * Spirale traînent des membres derrière leur origine, qui n'ont donc pas
 * achevé la traversée à la dislocation — assumé, puisque la dislocation les
 * relance de toute façon sur le joueur (`BURST_SPEED`) depuis là où ils en
 * sont. Ce que `waveSystem` borne, c'est l'envergure *perpendiculaire* à la
 * marche (`crossingLayout`) : la seule qui ferait naître des membres hors de
 * l'arène, invisibles jusqu'à ce qu'ils tuent.
 */
export function crossingDurationMs(
  arenaWidth: number,
  arenaHeight: number,
  dirX: number,
  travelSpeed: number,
  marginPx: number = FORMATION_EDGE_MARGIN,
): number {
  // Un seul des deux axes est jamais non nul (voir edgeOrigin, waves.ts) :
  // horizontal (dirX ≠ 0) traverse la largeur, vertical la hauteur.
  const span = dirX !== 0 ? arenaWidth : arenaHeight
  const distance = span + marginPx * 2
  return (distance / travelSpeed) * 1000
}

/**
 * Oriente le patron local d'une formation (`formationOffsets`) pour qu'il
 * fasse face à sa direction de marche. Renvoie 0 pour une formation immobile :
 * la rotation ne change rien à un carré ou un cercle resserré sur lui-même.
 */
export function formationBaseRotation(dirX: number, dirY: number): number {
  if (dirX === 0 && dirY === 0) {
    return 0
  }
  return Math.atan2(dirY, dirX) + Math.PI / 2
}

export interface Offset {
  x: number
  y: number
}

/**
 * Décalages relatifs au point d'apparition d'une formation. Fonctions pures :
 * ajouter un motif ne touche à aucun système.
 *
 * `square` produit un périmètre (quatre côtés), pas une grille pleine — pensé
 * pour encercler le joueur comme un étau. Chaque point reste entre `halfSide`
 * (milieu d'un côté) et `halfSide·√2` (coin) du centre, le même rôle que joue
 * `radius` pour `circle`.
 */
export function formationOffsets(kind: FormationKind, count: number, spacing: number): Offset[] {
  const out: Offset[] = []

  switch (kind) {
    case 'line': {
      const half = (count - 1) / 2
      for (let i = 0; i < count; i++) {
        out.push({ x: (i - half) * spacing, y: 0 })
      }
      break
    }
    case 'square': {
      // Périmètre parcouru à vitesse angulaire constante : `perimeter/count`
      // ≈ l'écart voulu entre deux voisins, comme `spacing` pour une ligne.
      const perimeter = spacing * count
      const halfSide = perimeter / 8
      for (let i = 0; i < count; i++) {
        const t = (i / count) * 4
        const side = Math.floor(t)
        const f = t - side
        let x: number
        let y: number
        switch (side) {
          case 0: {
            x = -halfSide + f * 2 * halfSide
            y = -halfSide
            break
          }
          case 1: {
            x = halfSide
            y = -halfSide + f * 2 * halfSide
            break
          }
          case 2: {
            x = halfSide - f * 2 * halfSide
            y = halfSide
            break
          }
          default: {
            x = -halfSide
            y = halfSide - f * 2 * halfSide
            break
          }
        }
        out.push({ x, y })
      }
      break
    }
    case 'circle': {
      const radius = (spacing * count) / (2 * Math.PI)
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2
        out.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius })
      }
      break
    }
    case 'vee': {
      out.push({ x: 0, y: 0 })
      for (let i = 1; out.length < count; i++) {
        out.push({ x: -i * spacing, y: i * spacing * 0.7 })
        if (out.length < count) {
          out.push({ x: i * spacing, y: i * spacing * 0.7 })
        }
      }
      break
    }
    case 'spiral': {
      for (let i = 0; i < count; i++) {
        const a = i * 0.9
        const r = spacing * 0.5 + i * spacing * 0.42
        out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
      }
      break
    }
  }

  return out
}

/**
 * Espacement nominal d'une figure traversante : l'écart voulu entre deux
 * voisins tant que la figure tient dans l'arène.
 */
export const CROSSING_SPACING = 34

/**
 * Espacement plancher d'une figure traversante, dérivé du plus gros ennemi et
 * non écrit en dur : au plancher, le centre d'un membre ne tombe jamais dans
 * le disque de son voisin, même pour des Blocs. La figure se lit donc encore
 * comme une chaîne de disques distincts, pas comme une tache continue — et
 * deux Points (le type le plus courant) y sont exactement tangents.
 */
export const MIN_CROSSING_SPACING = MAX_ENEMY_RADIUS

/**
 * Envergure d'un motif perpendiculairement à sa marche, à espacement 1. Tous
 * les motifs de `formationOffsets` sont linéaires en `spacing` (seuls les
 * angles en sont indépendants) : cette envergure unitaire suffit donc à
 * déduire l'espacement qui fait tenir la figure dans une étendue donnée.
 *
 * C'est bien l'étendue en x qui compte : `formationBaseRotation` tourne le
 * motif pour qu'il fasse face à sa marche, ce qui amène l'axe local +x sur
 * l'axe d'arène perpendiculaire à cette marche.
 */
function crossingUnitSpan(kind: FormationKind, count: number): number {
  let min = 0
  let max = 0
  for (const offset of formationOffsets(kind, count, 1)) {
    min = Math.min(min, offset.x)
    max = Math.max(max, offset.x)
  }
  return max - min
}

export interface CrossingLayout {
  /** Effectif réellement plaçable — jamais plus que celui demandé. */
  count: number
  spacing: number
}

/**
 * Effectif et espacement d'une figure traversante pour qu'elle tienne dans
 * l'étendue d'arène perpendiculaire à sa marche (la hauteur pour une entrée
 * par la gauche ou la droite, la largeur pour une entrée par le haut ou le
 * bas — voir `spawnCrossingFormation`, waves.ts).
 *
 * Quand l'envergure nominale déborde, c'est **l'espacement** qui cède, pas
 * l'effectif : la figure remplit exactement l'étendue puis se densifie. Le
 * joueur voulait des lignes de bord à bord, et une ligne pleine de plus en
 * plus dense reste de plus en plus dure — la difficulté continue donc de
 * monter au lieu de replafonner.
 *
 * Ce n'est qu'une fois le plancher `MIN_CROSSING_SPACING` atteint que
 * l'effectif cède à son tour : au-delà, les membres surnuméraires naîtraient
 * hors de l'arène, donc hors du masque de découpe (render/stage.ts) — sans
 * jamais montrer leur contour pointillé d'apparition, puis plaqués pleins et
 * mortels contre la paroi par `integrationSystem`. Mieux vaut une figure moins
 * nombreuse qu'un ennemi qui tue sans s'être annoncé.
 */
export function crossingLayout(
  kind: FormationKind,
  count: number,
  availableExtent: number,
): CrossingLayout {
  const fits = (n: number): boolean =>
    crossingUnitSpan(kind, n) * MIN_CROSSING_SPACING <= availableExtent

  let kept = count
  if (!fits(count)) {
    // Dichotomie : l'envergure unitaire croît avec l'effectif pour les trois
    // figures traversantes, on cherche donc le plus grand effectif qui tient.
    let low = 1
    let high = count
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (fits(mid)) {
        low = mid
      } else {
        high = mid - 1
      }
    }
    kept = low
  }

  const unitSpan = crossingUnitSpan(kind, kept)
  // `unitSpan` nul : figure d'un seul membre, rien à resserrer.
  const spacing =
    unitSpan > 0 ? Math.min(CROSSING_SPACING, availableExtent / unitSpan) : CROSSING_SPACING
  return { count: kept, spacing }
}

/**
 * Décalages d'une figure enveloppante (Cercle, Carré), paramétrés par un
 * **rayon voulu** plutôt que par l'espacement esthétique de
 * `formationOffsets` : ces figures naissent à une distance de sécurité
 * imposée du joueur (`AMBUSH_MIN_DISTANCE`, waves.ts). `spacing` est dérivé de
 * ce rayon pour réutiliser `formationOffsets` sans deuxième implémentation.
 */
export function enclosingOffsets(
  kind: 'circle' | 'square',
  count: number,
  radius: number,
): Offset[] {
  const spacing = kind === 'circle' ? (radius * 2 * Math.PI) / count : (radius * 8) / count
  return formationOffsets(kind, count, spacing)
}
