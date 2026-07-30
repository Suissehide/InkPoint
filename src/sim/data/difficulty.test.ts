import { describe, expect, it } from 'vitest'

import {
  ambushChance,
  enemyMaxSpeed,
  formationInterval,
  formationSize,
  spawnInterval,
} from './difficulty'

describe('courbe de difficulté', () => {
  it("l'intervalle d'apparition décroît de 2,2 s vers 0,35 s", () => {
    expect(spawnInterval(0)).toBeCloseTo(2.2, 1)
    expect(spawnInterval(600)).toBeCloseTo(0.35, 1)
  })

  it("l'intervalle est monotone décroissant", () => {
    for (let t = 0; t < 600; t += 10) {
      expect(spawnInterval(t + 10)).toBeLessThanOrEqual(spawnInterval(t))
    }
  })

  it("l'intervalle ne descend jamais sous 0,35 s", () => {
    expect(spawnInterval(100_000)).toBeGreaterThanOrEqual(0.35)
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

  it('la taille des formations va de 3 à 12, en entiers', () => {
    expect(formationSize(0)).toBe(3)
    expect(formationSize(100_000)).toBe(12)
    expect(Number.isInteger(formationSize(123))).toBe(true)
  })

  it("la part d'embuscades va de 0 à 35%", () => {
    expect(ambushChance(0)).toBe(0)
    expect(ambushChance(100_000)).toBeCloseTo(0.35, 2)
  })

  it("l'intervalle des formations décroît de 18 s vers 8 s", () => {
    expect(formationInterval(0)).toBeCloseTo(18, 1)
    expect(formationInterval(100_000)).toBeCloseTo(8, 1)
  })

  it("l'intervalle des formations est monotone décroissant", () => {
    for (let t = 0; t < 600; t += 10) {
      expect(formationInterval(t + 10)).toBeLessThanOrEqual(formationInterval(t))
    }
  })
})
