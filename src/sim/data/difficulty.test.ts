import { describe, expect, it } from 'vitest'

import { ARENA } from '@/sim/world'
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

  it('la vitesse max va de 110 à 150 px/s en laissant au joueur une marge jouable', () => {
    expect(enemyMaxSpeed(0)).toBeCloseTo(110, 0)
    expect(enemyMaxSpeed(100_000)).toBeLessThanOrEqual(150)
    // Pas seulement « moins vite que le joueur » : la marge doit rester
    // suffisante pour se replacer, pas seulement pour fuir tout droit. À 45
    // px/s (l'ancien réglage) l'esquive fine était hors de portée, et le jeu
    // vise désormais la précision au milieu d'une foule qui ne cesse
    // d'épaissir.
    expect(240 - enemyMaxSpeed(100_000)).toBeGreaterThanOrEqual(80)
  })

  it('la vitesse est monotone croissante', () => {
    for (let t = 0; t < 600; t += 10) {
      expect(enemyMaxSpeed(t + 10)).toBeGreaterThanOrEqual(enemyMaxSpeed(t))
    }
  })

  it('la taille des formations part de 8 et monte sans plafond, en entiers', () => {
    expect(formationSize(0)).toBe(8)
    expect(Number.isInteger(formationSize(123))).toBe(true)
    // Sans plafond : aucune valeur tardive ne plafonne sur une valeur précoce.
    expect(formationSize(1200)).toBeGreaterThan(formationSize(600))
    expect(formationSize(100_000)).toBeGreaterThan(formationSize(1200))
  })

  it('la taille des formations est monotone croissante', () => {
    for (let t = 0; t < 1200; t += 10) {
      expect(formationSize(t + 10)).toBeGreaterThanOrEqual(formationSize(t))
    }
  })

  it("la taille des formations atteint l'envergure de l'arène vers dix minutes", () => {
    // Les formations qui traversent utilisent un espacement fixe de 34 px
    // (sim/systems/waves.ts) : une ligne de n ennemis couvre (n − 1) · 34.
    // C'est ce seuil qui produit les « lignes sur toute la largeur », sans
    // aucune formation nouvelle.
    expect((formationSize(620) - 1) * 34).toBeGreaterThanOrEqual(ARENA.width)
    expect((formationSize(300) - 1) * 34).toBeLessThan(ARENA.width)
  })

  it("la part d'embuscades va de 15 à 40%, jamais nulle", () => {
    expect(ambushChance(0)).toBeCloseTo(0.15, 2)
    expect(ambushChance(100_000)).toBeCloseTo(0.4, 2)
  })

  it("l'intervalle des formations part de 12 s et décroît sans plancher", () => {
    expect(formationInterval(0)).toBeCloseTo(12, 1)
    expect(formationInterval(1800)).toBeLessThan(formationInterval(600))
  })

  it("l'intervalle des formations reste strictement positif, même très tard", () => {
    // Un plancher à zéro ferait naître une infinité de formations par seconde.
    expect(formationInterval(1_000_000)).toBeGreaterThan(0)
    // Discriminant : sous l'ancienne courbe plafonnée à 6 s, cette valeur
    // vaut encore ~6 à t = 100 000 s. Sans plancher, elle vaut ~0,014 : un
    // retour du plafond ferait échouer cette assertion.
    expect(formationInterval(100_000)).toBeLessThan(1)
  })

  it('les deux courbes restent finies et positives avant t = 0', () => {
    expect(formationSize(-50)).toBe(8)
    expect(formationInterval(-50)).toBeCloseTo(12, 1)
  })

  it("l'intervalle des formations est monotone décroissant", () => {
    for (let t = 0; t < 600; t += 10) {
      expect(formationInterval(t + 10)).toBeLessThanOrEqual(formationInterval(t))
    }
  })

  it("l'intervalle des power-ups décroît de 2500 ms vers 1800 ms", () => {
    expect(pickupInterval(0)).toBeCloseTo(2500, 0)
    expect(pickupInterval(100_000)).toBeCloseTo(1800, 0)
  })

  it("l'intervalle des power-ups est monotone décroissant", () => {
    for (let t = 0; t < 600; t += 10) {
      expect(pickupInterval(t + 10)).toBeLessThanOrEqual(pickupInterval(t))
    }
  })
})
