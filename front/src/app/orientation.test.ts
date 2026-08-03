import { describe, expect, it } from 'vitest'

import { resolveDisplayQuarters, rotateVector, screenToApp } from './orientation'

describe('rotateVector', () => {
  // Repère écran, `y` vers le bas, quart de tour HORAIRE : « vers la droite »
  // devient « vers le bas ».
  it('laisse le vecteur intact à zéro quart de tour', () => {
    expect(rotateVector(1, 0, 0)).toEqual({ x: 1, y: 0 })
    expect(rotateVector(0, 1, 0)).toEqual({ x: 0, y: 1 })
  })

  it('tourne dans le sens horaire', () => {
    expect(rotateVector(1, 0, 1)).toEqual({ x: 0, y: 1 })
    expect(rotateVector(0, 1, 1)).toEqual({ x: -1, y: 0 })
    expect(rotateVector(1, 0, 2)).toEqual({ x: -1, y: 0 })
    expect(rotateVector(1, 0, 3)).toEqual({ x: 0, y: -1 })
  })

  it('revient au point de départ après quatre quarts appliqués un à un', () => {
    let v = { x: 3, y: -7 }
    for (let i = 0; i < 4; i++) {
      v = rotateVector(v.x, v.y, 1)
    }
    expect(v).toEqual({ x: 3, y: -7 })
  })

  it("compose : un quart puis trois quarts est l'identité", () => {
    const once = rotateVector(5, 2, 1)
    expect(rotateVector(once.x, once.y, 3)).toEqual({ x: 5, y: 2 })
  })
})

describe('resolveDisplayQuarters', () => {
  it('pivote sur un pointeur grossier tenu en portrait', () => {
    expect(
      resolveDisplayQuarters({ coarsePointer: true, windowWidth: 393, windowHeight: 852 }),
    ).toBe(1)
  })

  it('ne pivote pas sur un pointeur grossier déjà en paysage', () => {
    expect(
      resolveDisplayQuarters({ coarsePointer: true, windowWidth: 852, windowHeight: 393 }),
    ).toBe(0)
  })

  // Le garde-fou qui justifie la condition `coarsePointer` : sans elle, une
  // fenêtre de bureau étroite et haute se mettrait à pivoter.
  it('ne pivote jamais sur un pointeur fin, même en fenêtre haute', () => {
    expect(
      resolveDisplayQuarters({ coarsePointer: false, windowWidth: 500, windowHeight: 1200 }),
    ).toBe(0)
  })

  it('ne pivote pas sur une fenêtre exactement carrée', () => {
    expect(
      resolveDisplayQuarters({ coarsePointer: true, windowWidth: 600, windowHeight: 600 }),
    ).toBe(0)
  })
})

describe('screenToApp', () => {
  it("est l'identité sans rotation", () => {
    const display = { quarters: 0, windowWidth: 852, windowHeight: 393 } as const
    expect(screenToApp(100, 50, display)).toEqual({ x: 100, y: 50 })
  })

  // `#app` pivoté d'un quart horaire autour de son coin haut-gauche puis
  // ramené par `translateX(windowWidth)`. Un point (ax, ay) local s'affiche
  // donc en (windowWidth − ay, ax) ; on vérifie ici l'inverse.
  it("inverse la transformation d'un quart de tour", () => {
    const display = { quarters: 1, windowWidth: 393, windowHeight: 852 } as const
    // Coin haut-gauche de `#app` → coin haut-DROIT de l'écran.
    expect(screenToApp(393, 0, display)).toEqual({ x: 0, y: 0 })
    // Un point à 10 px vers la droite dans `#app` descend de 10 px à l'écran.
    expect(screenToApp(393, 10, display)).toEqual({ x: 10, y: 0 })
    // Un point à 10 px vers le bas dans `#app` va 10 px vers la gauche à l'écran.
    expect(screenToApp(383, 0, display)).toEqual({ x: 0, y: 10 })
  })
})
