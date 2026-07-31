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

/** Marge d'apparition hors-écran, cohérente avec `edgeOrigin` (waves.ts). */
export const FORMATION_EDGE_MARGIN = 40

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
 * `marginPx` doit correspondre à la marge réellement utilisée au spawn, pas
 * forcément `FORMATION_EDGE_MARGIN` — `waveSystem` pousse une formation plus
 * loin hors-écran quand son envergure dépasse la marge de base (Spiral ou V à
 * fort effectif), sinon elle n'aurait pas fini de traverser à la dislocation.
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
