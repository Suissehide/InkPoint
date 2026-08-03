import { describe, expect, it } from 'vitest'

import { uiScalePx } from './ui-scale'

describe('uiScalePx', () => {
  // Reproduit `clamp(18px, 1.4vh + 8px, 30px)` sur pointeur fin : le rendu au
  // bureau ne doit pas bouger d'un pixel.
  it('reproduit la rampe historique sur pointeur fin', () => {
    expect(uiScalePx({ viewHeight: 1000, coarsePointer: false })).toBeCloseTo(22, 6)
    expect(uiScalePx({ viewHeight: 720, coarsePointer: false })).toBeCloseTo(18.08, 6)
  })

  it('applique le plancher de 18 px sur pointeur fin', () => {
    expect(uiScalePx({ viewHeight: 300, coarsePointer: false })).toBe(18)
  })

  // Le plafond existe pour la 4K : au-delà, agrandir ne rend plus rien plus
  // lisible.
  it('applique le plafond de 30 px', () => {
    expect(uiScalePx({ viewHeight: 4000, coarsePointer: false })).toBe(30)
    expect(uiScalePx({ viewHeight: 4000, coarsePointer: true })).toBe(30)
  })

  // Le vrai motif : un téléphone en paysage fait ~393 px de haut, la rampe y
  // est au plancher, et 18 px donnent un `ui-2xs` de 10 px.
  it('relève le plancher sur pointeur grossier', () => {
    expect(uiScalePx({ viewHeight: 393, coarsePointer: true })).toBe(22)
    expect(uiScalePx({ viewHeight: 393, coarsePointer: false })).toBe(18)
  })

  it('prend la hauteur EFFECTIVE, celle passée en argument', () => {
    // Sous rotation, l'appelant passe `window.innerWidth` : la fonction n'a
    // aucun moyen de lire `vh` et c'est exactement l'intention. 393 et 852
    // (paysage/portrait d'un même téléphone) donneraient tous deux 22 — le
    // plancher les masque —, donc on prend une hauteur qui dépasse le
    // plancher pour prouver que l'argument, et lui seul, pilote le résultat.
    expect(uiScalePx({ viewHeight: 393, coarsePointer: true })).not.toBe(
      uiScalePx({ viewHeight: 1500, coarsePointer: true }),
    )
  })
})
