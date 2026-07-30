import { describe, expect, it } from 'vitest'

import {
  ambushChance,
  enemyMaxSpeed,
  formationInterval,
  formationSize,
  pickupInterval,
  spawnInterval,
} from './difficulty'

describe('courbe de difficulté', () => {
  it("l'intervalle d'apparition décroît de 1,1 s vers 0,3 s", () => {
    expect(spawnInterval(0)).toBeCloseTo(1.1, 1)
    expect(spawnInterval(600)).toBeCloseTo(0.3, 1)
  })

  it("l'intervalle est monotone décroissant", () => {
    for (let t = 0; t < 600; t += 10) {
      expect(spawnInterval(t + 10)).toBeLessThanOrEqual(spawnInterval(t))
    }
  })

  it("l'intervalle ne descend jamais sous 0,3 s", () => {
    expect(spawnInterval(100_000)).toBeGreaterThanOrEqual(0.3)
  })

  it('la vitesse max va de 130 à 195 px/s sans jamais atteindre celle du joueur', () => {
    expect(enemyMaxSpeed(0)).toBeCloseTo(130, 0)
    expect(enemyMaxSpeed(100_000)).toBeLessThanOrEqual(195)
    expect(enemyMaxSpeed(100_000)).toBeLessThan(240)
  })

  it('la vitesse est monotone croissante', () => {
    for (let t = 0; t < 600; t += 10) {
      expect(enemyMaxSpeed(t + 10)).toBeGreaterThanOrEqual(enemyMaxSpeed(t))
    }
  })

  it('la taille des formations va de 8 à 15, en entiers', () => {
    expect(formationSize(0)).toBe(8)
    expect(formationSize(100_000)).toBe(15)
    expect(Number.isInteger(formationSize(123))).toBe(true)
  })

  it("la part d'embuscades va de 15 à 40%, jamais nulle", () => {
    expect(ambushChance(0)).toBeCloseTo(0.15, 2)
    expect(ambushChance(100_000)).toBeCloseTo(0.4, 2)
  })

  it("l'intervalle des formations décroît de 12 s vers 6 s", () => {
    expect(formationInterval(0)).toBeCloseTo(12, 1)
    expect(formationInterval(100_000)).toBeCloseTo(6, 1)
  })

  it("l'intervalle des formations est monotone décroissant", () => {
    for (let t = 0; t < 600; t += 10) {
      expect(formationInterval(t + 10)).toBeLessThanOrEqual(formationInterval(t))
    }
  })

  it("l'intervalle des power-ups décroît de 3500 ms vers 2500 ms", () => {
    expect(pickupInterval(0)).toBeCloseTo(3500, 0)
    expect(pickupInterval(100_000)).toBeCloseTo(2500, 0)
  })

  it("l'intervalle des power-ups est monotone décroissant", () => {
    for (let t = 0; t < 600; t += 10) {
      expect(pickupInterval(t + 10)).toBeLessThanOrEqual(pickupInterval(t))
    }
  })
})
