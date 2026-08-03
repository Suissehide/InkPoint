import { describe, expect, it } from 'vitest'

import { NIB_MAX_RADIUS, NIBS, nibPath, SKIN_IDS } from './nibs'

describe('nibs', () => {
  it('déclare une silhouette par identifiant', () => {
    for (const id of SKIN_IDS) {
      expect(NIBS[id].length).toBeGreaterThanOrEqual(3)
    }
    expect(Object.keys(NIBS).sort()).toEqual([...SKIN_IDS].sort())
  })

  // La hitbox vit dans `Collider.radius` côté simulation et ne bouge pas :
  // une silhouette plus longue que la plume promettrait une allonge qu'elle
  // n'a pas.
  it('garde chaque silhouette dans le rayon de la plume', () => {
    for (const id of SKIN_IDS) {
      for (const [x, y] of NIBS[id]) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(NIB_MAX_RADIUS)
      }
    }
  })

  it('dérive le rayon maximal de la plume elle-même', () => {
    const longest = Math.max(...NIBS.quill.map(([x, y]) => Math.hypot(x, y)))
    expect(NIB_MAX_RADIUS).toBeCloseTo(longest, 6)
  })

  // Le tracé par défaut ne doit pas bouger d'un pixel : c'est la silhouette
  // que tous les joueurs ont aujourd'hui.
  it('conserve la plume actuelle à l’identique', () => {
    expect(NIBS.quill).toEqual([
      [13, 0],
      [-8, 9],
      [-4, 0],
      [-8, -9],
    ])
  })

  it('rend un chemin SVG fermé', () => {
    expect(nibPath('quill')).toBe('M13 0 L-8 9 L-4 0 L-8 -9 Z')
  })
})
