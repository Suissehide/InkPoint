import { describe, expect, it } from 'vitest'

import { BOIL_PERIOD_MS } from '../ink'
import { boilPhase } from './boil'

describe('boilPhase', () => {
  it("reste stable à l'intérieur d'une période", () => {
    expect(boilPhase(0)).toBe(boilPhase(BOIL_PERIOD_MS - 1))
  })

  it("change d'une période à l'autre", () => {
    expect(boilPhase(0)).not.toBe(boilPhase(BOIL_PERIOD_MS + 1))
  })

  it('produit une séquence de 8 phases consécutives et stables sur une seconde', () => {
    // Vérifie que chaque période de 125 ms produit la phase attendue de bout
    // en bout, pas juste que 8 valeurs distinctes apparaissent sur la seconde.
    for (let period = 0; period < 8; period++) {
      const start = period * BOIL_PERIOD_MS
      expect(boilPhase(start)).toBe(period)
      expect(boilPhase(start + BOIL_PERIOD_MS - 1)).toBe(period)
    }
  })

  it('retourne un entier', () => {
    expect(Number.isInteger(boilPhase(1234))).toBe(true)
  })
})
