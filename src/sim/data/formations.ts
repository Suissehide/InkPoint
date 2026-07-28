export type FormationKind = 'line' | 'square' | 'circle' | 'vee' | 'spiral'

export const FORMATION_KINDS: readonly FormationKind[] = [
  'line',
  'square',
  'circle',
  'vee',
  'spiral',
]

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
