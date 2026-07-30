export type FormationKind = 'line' | 'square' | 'circle' | 'vee' | 'spiral'

export const FORMATION_KINDS: readonly FormationKind[] = [
  'line',
  'square',
  'circle',
  'vee',
  'spiral',
]

/**
 * Chorégraphie de chaque formation (spec gameplay-pass §4) : le bloc doit se
 * voir venir, tenir sa forme, puis se disloquer — pas se dissoudre en une
 * image dès que la poursuite individuelle reprend. `formationSystem` lit ces
 * réglages ; `waveSystem` calcule `durationMs` par formation (fixe pour les
 * figures immobiles, dérivée de la traversée de l'arène pour celles qui
 * avancent — voir `crossingDurationMs` ci-dessous).
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
/** Recul vers l'intérieur de l'arène pour les formations immobiles (carré,
 *  cercle) : sans lui elles resteraient plantées à cheval sur le bord d'où
 *  elles sont apparues, jamais vraiment visibles — l'intérêt même de la tâche. */
export const FORMATION_INWARD_PUSH = 160

/**
 * Durée de la chorégraphie pour une formation qui avance : le temps de
 * traverser toute l'arène dans sa direction de marche, plus la marge
 * d'apparition hors-écran des deux côtés (elle apparaît hors-écran et doit
 * en ressortir de l'autre côté pour que « a traversé l'arène » soit vrai).
 *
 * `marginPx` : la marge hors-écran réellement utilisée au spawn, pas
 * systématiquement `FORMATION_EDGE_MARGIN` — une formation dont l'envergure
 * dépasse cette marge de base (un Spiral ou un V à fort effectif) est
 * poussée plus loin hors-écran par `waveSystem` pour que tous ses membres y
 * apparaissent ensemble ; la durée doit suivre la même marge, sinon la
 * formation n'aurait pas fini de traverser quand elle se disloque.
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
 * Oriente le patron local d'une formation (défini dans `formationOffsets`,
 * apex/ligne le long de l'axe local -y/+x respectivement) pour qu'il fasse
 * face à sa direction de marche — sinon une Ligne ou un V apparu par le haut
 * de l'arène garderait l'orientation pensée pour une apparition latérale.
 * (0,0) pour une formation immobile : la rotation ne change rien à un carré
 * ou un cercle resserré sur lui-même, autant renvoyer 0.
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
 * ajouter un motif ne touche à aucun système (spec §3.3).
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
      const cols = Math.ceil(Math.sqrt(count))
      const rows = Math.ceil(count / cols)
      for (let i = 0; i < count; i++) {
        const cx = i % cols
        const cy = Math.floor(i / cols)
        out.push({
          x: (cx - (cols - 1) / 2) * spacing,
          y: (cy - (rows - 1) / 2) * spacing,
        })
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
