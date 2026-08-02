import { describe, expect, it } from 'vitest'

import { formatDuration, formatScore } from './format'

describe('formatScore', () => {
  it("n'espace pas les petits nombres", () => expect(formatScore(421)).toBe('421'))
  it('groupe les milliers', () => expect(formatScore(4210)).toBe('4 210'))
  it('groupe les millions', () => expect(formatScore(1234567)).toBe('1 234 567'))
  it('arrondit les décimales', () => expect(formatScore(4210.7)).toBe('4 211'))
  it('gère zéro', () => expect(formatScore(0)).toBe('0'))
})

describe('formatDuration', () => {
  it("formate moins d'une minute", () => expect(formatDuration(45_000)).toBe('0:45'))
  it("formate plus d'une minute", () => expect(formatDuration(134_000)).toBe('2:14'))
  it('complète les secondes à deux chiffres', () => expect(formatDuration(65_000)).toBe('1:05'))
  it('gère zéro', () => expect(formatDuration(0)).toBe('0:00'))
})
