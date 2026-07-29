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
    // Ne pas se contenter de compter les valeurs distinctes : un bug à 9 Hz
    // (ou 7 Hz) implémenté avec le même modulo 8 produirait aussi 8 (ou 7)
    // valeurs distinctes réparties sur la seconde. Ce qui distingue le bon
    // comportement, c'est que chaque période de 125 ms produit exactement la
    // phase attendue, du début à la fin de cette période.
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
