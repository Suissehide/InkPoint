import { describe, expect, it } from 'vitest'

import { JOYSTICK_DEAD_ZONE, JOYSTICK_RADIUS, joystickVector } from './joystick'

describe('joystickVector', () => {
  it('rend une entrée nulle quand le doigt n’a pas bougé', () => {
    expect(joystickVector(100, 100, 100, 100, JOYSTICK_RADIUS)).toEqual({
      x: 0,
      y: 0,
      magnitude: 0,
    })
  })

  it('rend une entrée nulle dans la zone morte', () => {
    const inside = JOYSTICK_DEAD_ZONE * JOYSTICK_RADIUS * 0.9
    const v = joystickVector(100, 100, 100 + inside, 100, JOYSTICK_RADIUS)
    expect(v).toEqual({ x: 0, y: 0, magnitude: 0 })
  })

  it('rend une direction unitaire dès qu’on sort de la zone morte', () => {
    const v = joystickVector(100, 100, 100 + JOYSTICK_RADIUS / 2, 100, JOYSTICK_RADIUS)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6)
    expect(v.x).toBeCloseTo(1, 6)
    expect(v.y).toBeCloseTo(0, 6)
  })

  // La magnitude est le plafond de vitesse ; la direction reste unitaire pour
  // que l'accélération, elle, soit toujours pleine (voir `InputState.speedCap`).
  it('fait croître la magnitude avec la distance, jusqu’à saturer au rayon', () => {
    const half = joystickVector(0, 0, JOYSTICK_RADIUS / 2, 0, JOYSTICK_RADIUS)
    const full = joystickVector(0, 0, JOYSTICK_RADIUS, 0, JOYSTICK_RADIUS)
    const beyond = joystickVector(0, 0, JOYSTICK_RADIUS * 10, 0, JOYSTICK_RADIUS)
    expect(half.magnitude).toBeGreaterThan(0)
    expect(half.magnitude).toBeLessThan(full.magnitude)
    expect(full.magnitude).toBeCloseTo(1, 6)
    expect(beyond.magnitude).toBeCloseTo(1, 6)
  })

  it('oriente le bas de l’écran vers les y positifs', () => {
    const v = joystickVector(0, 0, 0, JOYSTICK_RADIUS, JOYSTICK_RADIUS)
    expect(v.x).toBeCloseTo(0, 6)
    expect(v.y).toBeCloseTo(1, 6)
  })

  it('normalise une diagonale', () => {
    const d = JOYSTICK_RADIUS / Math.SQRT2
    const v = joystickVector(0, 0, d, d, JOYSTICK_RADIUS)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6)
    expect(v.magnitude).toBeCloseTo(1, 6)
  })

  it('rend une magnitude jamais inférieure à la zone morte une fois armé', () => {
    const justOut = JOYSTICK_DEAD_ZONE * JOYSTICK_RADIUS * 1.01
    const v = joystickVector(0, 0, justOut, 0, JOYSTICK_RADIUS)
    // Garantit qu'aucune magnitude ne quantifie à zéro : un plafond nul
    // figerait le joueur alors qu'il commande bien quelque chose.
    expect(v.magnitude).toBeGreaterThan(1 / 128)
  })
})
