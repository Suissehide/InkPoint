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

  it('produit exactement 8 valeurs par seconde', () => {
    const seen = new Set<number>()
    for (let t = 0; t < 1000; t += 5) {
      seen.add(boilPhase(t))
    }
    expect(seen.size).toBe(8)
  })

  it('retourne un entier', () => {
    expect(Number.isInteger(boilPhase(1234))).toBe(true)
  })
})
