import { describe, expect, it } from 'vitest'

import type { Viewport } from '@/render/viewport'
import { aimInput, screenToArena } from './mouse'

/** Arène 1280×720 dans une fenêtre plus large : zoom 1, marge latérale de 100 px. */
const VIEWPORT: Viewport = { scale: 1, x: 100, y: 0, arenaWidth: 1280, arenaHeight: 720 }

describe('screenToArena', () => {
  it('retire le décalage du letterbox', () => {
    expect(screenToArena(100, 0, VIEWPORT)).toEqual({ x: 0, y: 0 })
  })

  it('divise par le zoom', () => {
    const zoomed: Viewport = { scale: 0.5, x: 0, y: 0, arenaWidth: 1280, arenaHeight: 720 }
    expect(screenToArena(320, 180, zoomed)).toEqual({ x: 640, y: 360 })
  })

  it("borne un point de la marge sur le bord de l'arène", () => {
    expect(screenToArena(0, 0, VIEWPORT)).toEqual({ x: 0, y: 0 })
    expect(screenToArena(9999, 9999, VIEWPORT)).toEqual({ x: 1280, y: 720 })
  })
})

describe('aimInput', () => {
  it('donne le plein régime au-delà du rayon', () => {
    const { moveX, moveY } = aimInput({ x: 0, y: 0 }, { x: 500, y: 0 })
    expect(moveX).toBe(1)
    expect(moveY).toBe(0)
  })

  it("décroît proportionnellement à l'intérieur du rayon", () => {
    // 16 px pour un rayon de 32 : moitié de régime.
    const { moveX } = aimInput({ x: 0, y: 0 }, { x: 16, y: 0 })
    expect(moveX).toBeCloseTo(0.5, 2)
  })

  it('rend une entrée nulle dans la zone morte', () => {
    expect(aimInput({ x: 100, y: 100 }, { x: 102, y: 100 })).toEqual({ moveX: 0, moveY: 0 })
  })

  it('ne calcule aucun angle quand la cible est confondue avec le joueur', () => {
    expect(aimInput({ x: 40, y: 40 }, { x: 40, y: 40 })).toEqual({ moveX: 0, moveY: 0 })
  })

  it('vise bien la cible en diagonale', () => {
    const { moveX, moveY } = aimInput({ x: 0, y: 0 }, { x: -300, y: -300 })
    expect(moveX).toBeCloseTo(-Math.SQRT1_2, 2)
    expect(moveY).toBeCloseTo(-Math.SQRT1_2, 2)
  })

  it('ne rend que des multiples de 1/128', () => {
    const { moveX, moveY } = aimInput({ x: 0, y: 0 }, { x: 137, y: -61 })
    expect(moveX * 128).toBeCloseTo(Math.round(moveX * 128), 10)
    expect(moveY * 128).toBeCloseTo(Math.round(moveY * 128), 10)
  })

  it('reste à magnitude 1 à un pas de quantification près', () => {
    // La quantification peut pousser chaque composante d'un demi-pas vers le
    // haut. `playerMovementSystem` renormalise toute entrée > 1 : ce test borne
    // le dépassement, il ne prétend pas qu'il n'existe pas.
    const { moveX, moveY } = aimInput({ x: 0, y: 0 }, { x: 400, y: 400 })
    expect(Math.hypot(moveX, moveY)).toBeLessThanOrEqual(1 + 2 / 128)
  })
})
