import { describe, expect, it } from 'vitest'

import { createPositionHistory } from './position-history'

describe('createPositionHistory', () => {
  it("retourne la position à l'instant demandé", () => {
    const h = createPositionHistory(64)
    h.push(0, 0, 0)
    h.push(100, 100, 0)
    expect(h.sample(100)).toEqual({ x: 100, y: 0 })
  })

  it('interpole entre deux échantillons', () => {
    const h = createPositionHistory(64)
    h.push(0, 0, 0)
    h.push(100, 100, 0)
    const p = h.sample(50)
    expect(p.x).toBeCloseTo(50, 1)
  })

  it('retourne le plus ancien échantillon si on demande avant lui', () => {
    const h = createPositionHistory(64)
    h.push(100, 10, 10)
    h.push(200, 20, 20)
    expect(h.sample(0)).toEqual({ x: 10, y: 10 })
  })

  it('retourne le plus récent si on demande après lui', () => {
    const h = createPositionHistory(64)
    h.push(0, 0, 0)
    h.push(100, 100, 100)
    expect(h.sample(999)).toEqual({ x: 100, y: 100 })
  })

  /**
   * Pendant un hitstop, `world.timeScale` vaut 0 : les pas continuent,
   * `world.time` non. Pousser quand même remplirait le tampon d'échantillons
   * au même instant et raccourcirait l'historique utile — la capacité
   * cesserait de se déduire du seul retard à couvrir.
   */
  it("ignore un échantillon dont l'horodatage n'a pas avancé", () => {
    const h = createPositionHistory(3)
    h.push(0, 0, 0)
    h.push(10, 10, 0)
    // Trois poussées gelées : sans le garde-fou, elles chassent t=0 du tampon.
    h.push(10, 99, 99)
    h.push(10, 99, 99)
    h.push(10, 99, 99)
    expect(h.oldestTime()).toBe(0)
    expect(h.sample(0)).toEqual({ x: 0, y: 0 })
    // Et la position du sosie ignoré n'a écrasé personne.
    expect(h.sample(10)).toEqual({ x: 10, y: 0 })
  })

  it("dit à partir de quand il a de la mémoire, et rien tant qu'il n'en a pas", () => {
    const h = createPositionHistory(3)
    expect(h.oldestTime()).toBeNull()
    h.push(100, 1, 1)
    expect(h.oldestTime()).toBe(100)
    h.push(110, 2, 2)
    h.push(120, 3, 3)
    h.push(130, 4, 4)
    // Le plus ancien suit l'écrasement circulaire, il n'est pas figé au premier poussé.
    expect(h.oldestTime()).toBe(110)
  })

  it('écrase les plus anciens quand la capacité est atteinte', () => {
    const h = createPositionHistory(3)
    h.push(0, 0, 0)
    h.push(10, 10, 0)
    h.push(20, 20, 0)
    h.push(30, 30, 0)
    // L'échantillon t=0 a été écrasé : le plus ancien est maintenant t=10.
    expect(h.sample(0)).toEqual({ x: 10, y: 0 })
  })
})
