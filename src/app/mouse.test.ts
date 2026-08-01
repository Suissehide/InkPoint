import { describe, expect, it } from 'vitest'

import type { Viewport } from '@/render/viewport'
import { PLAYER_ACCEL, PLAYER_FRICTION, PLAYER_SPEED } from '@/sim/spawn'
import type { PlayerMotion } from './input-source'
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

  it("retire le décalage avant de diviser par le zoom, pas l'inverse", () => {
    // Décalage et zoom tous deux non triviaux : une implémentation qui
    // diviserait avant de soustraire le décalage (`clientX / scale - x`)
    // donnerait { x: 300, y: 180 } au lieu de { x: 200, y: 160 }.
    const offsetAndZoomed: Viewport = {
      scale: 0.5,
      x: 100,
      y: 20,
      arenaWidth: 1280,
      arenaHeight: 720,
    }
    expect(screenToArena(200, 100, offsetAndZoomed)).toEqual({ x: 200, y: 160 })
  })
})

describe('aimInput', () => {
  /**
   * Joueur immobile : vitesse d'approche nulle, donc distance d'arrêt nulle.
   * Les cas historiques d'`aimInput` restent ainsi inchangés — c'est le
   * freinage qui est nouveau, pas la visée.
   */
  function immobile(x: number, y: number): PlayerMotion {
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      friction: PLAYER_FRICTION,
      accel: PLAYER_ACCEL,
      maxSpeed: PLAYER_SPEED,
    }
  }

  it('donne le plein régime au-delà du rayon', () => {
    const { moveX, moveY } = aimInput(immobile(0, 0), { x: 500, y: 0 })
    expect(moveX).toBe(1)
    expect(moveY).toBe(0)
  })

  it('rend une entrée nulle dans la zone morte', () => {
    expect(aimInput(immobile(100, 100), { x: 102, y: 100 })).toEqual({ moveX: 0, moveY: 0 })
  })

  it('ne calcule aucun angle quand la cible est confondue avec le joueur', () => {
    expect(aimInput(immobile(40, 40), { x: 40, y: 40 })).toEqual({ moveX: 0, moveY: 0 })
  })

  it('vise bien la cible en diagonale', () => {
    const { moveX, moveY } = aimInput(immobile(0, 0), { x: -300, y: -300 })
    expect(moveX).toBeCloseTo(-Math.SQRT1_2, 2)
    expect(moveY).toBeCloseTo(-Math.SQRT1_2, 2)
  })

  it('ne rend que des multiples de 1/128', () => {
    const { moveX, moveY } = aimInput(immobile(0, 0), { x: 137, y: -61 })
    expect(moveX * 128).toBeCloseTo(Math.round(moveX * 128), 10)
    expect(moveY * 128).toBeCloseTo(Math.round(moveY * 128), 10)
  })

  it('reste à magnitude 1 à un pas de quantification près', () => {
    // La quantification peut pousser chaque composante d'un demi-pas vers le
    // haut. `playerMovementSystem` renormalise toute entrée > 1 : ce test borne
    // le dépassement, il ne prétend pas qu'il n'existe pas.
    const { moveX, moveY } = aimInput(immobile(0, 0), { x: 400, y: 400 })
    expect(Math.hypot(moveX, moveY)).toBeLessThanOrEqual(1 + 2 / 128)
  })

  it('freine en poussant à contresens quand il arrive trop vite', () => {
    // À 10 px et 240 px/s, la vitesse souhaitée vaut √(2 × accel × 10) ≈ 200,
    // donc inférieure à la vitesse actuelle : l'écart pointe à l'opposé.
    const player = { ...immobile(0, 0), vx: 240 }
    expect(aimInput(player, { x: 10, y: 0 }).moveX).toBeLessThan(0)
  })

  it('pousse à plein quand il part de l’arrêt, quelle que soit la distance', () => {
    // Plus d'atténuation par palier : à l'arrêt, la vitesse souhaitée dépasse
    // toujours largement ce qu'une image d'accélération peut fournir.
    expect(aimInput(immobile(0, 0), { x: 16, y: 0 }).moveX).toBeCloseTo(1, 2)
    expect(aimInput(immobile(0, 0), { x: 500, y: 0 }).moveX).toBeCloseTo(1, 2)
  })

  it('corrige latéralement pendant le freinage', () => {
    // Le cœur du correctif : le point arrive vite vers l'est, la cible est au
    // nord-est. Il doit freiner ET tourner, pas seulement freiner.
    const player = { ...immobile(0, 0), vx: 240 }
    const { moveY } = aimInput(player, { x: 12, y: -12 })
    expect(moveY).toBeLessThan(0)
  })

  it('ne bat pas entre poussée et relâchement en croisière', () => {
    // Cible lointaine, point déjà à sa vitesse de croisière vers elle : la
    // commande ne doit pas s'annuler, sinon la friction reprend la main et le
    // point pulse à chaque image.
    const player = { ...immobile(0, 0), vx: PLAYER_SPEED }
    expect(Math.abs(aimInput(player, { x: 800, y: 0 }).moveX)).toBeGreaterThan(0.001)
  })

  it('maintient la poussée quand le point dérive de côté', () => {
    // Vitesse élevée mais perpendiculaire à la cible : la vitesse d'approche
    // est nulle, donc rien à freiner — il faut au contraire redresser.
    const player = { ...immobile(0, 0), vy: 240 }
    expect(aimInput(player, { x: 10, y: 0 }).moveX).toBeGreaterThan(0)
  })

  it("maintient la poussée à plein quand le point s'éloigne", () => {
    // Vitesse d'approche négative : le point s'éloigne, la vitesse souhaitée
    // vers la cible et la vitesse actuelle pointent en sens opposés.
    const player = { ...immobile(0, 0), vx: -240 }
    expect(aimInput(player, { x: 10, y: 0 }).moveX).toBeGreaterThan(0)
  })

  it('ne coupe jamais la poussée si la friction est nulle', () => {
    // `friction` ne gouverne plus aimInput : la nouvelle règle vise une
    // vitesse via `accel` et `maxSpeed`, jamais via la friction — sa valeur
    // ne doit donc plus influencer la sortie, y compris à zéro.
    const target = { x: 300, y: 0 }
    const withFriction = aimInput({ ...immobile(0, 0), friction: PLAYER_FRICTION }, target)
    const withoutFriction = aimInput({ ...immobile(0, 0), friction: 0 }, target)
    expect(withoutFriction).toEqual(withFriction)
  })

  it('ne renvoie jamais une entrée dirigée à l’opposé de la cible tant que la vitesse reste sous le plafond', () => {
    // Aucun recul en dessous de maxSpeed : freiner « à contresens » n'apparaît
    // que si la vitesse actuelle dépasse la vitesse qu'on peut encore viser,
    // couvert par « freine en poussant à contresens quand il arrive trop vite ».
    for (const vx of [-200, -100, 0, 100, 200]) {
      const player = { ...immobile(0, 0), vx }
      expect(aimInput(player, { x: 20, y: 0 }).moveX).toBeGreaterThanOrEqual(0)
    }
  })
})
