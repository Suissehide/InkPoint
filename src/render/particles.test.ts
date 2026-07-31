import { describe, expect, it } from 'vitest'

import { burstAngle, convergeSpeed, stallDamping } from './particles'

describe('burstAngle', () => {
  it('vise exactement la direction au centre du tirage', () => {
    expect(burstAngle(1.2, Math.PI / 2, 0.5)).toBeCloseTo(1.2, 10)
  })

  it('reste dans le cône dir ± spread/2 aux bornes du tirage', () => {
    const spread = Math.PI / 2
    expect(burstAngle(0, spread, 0)).toBeCloseTo(-spread / 2, 10)
    expect(burstAngle(0, spread, 1)).toBeCloseTo(spread / 2, 10)
  })

  it('couvre le cercle entier quand le cône vaut 2π', () => {
    const full = Math.PI * 2
    expect(burstAngle(0, full, 1) - burstAngle(0, full, 0)).toBeCloseTo(full, 10)
  })
})

describe('convergeSpeed', () => {
  it('démarre lentement au bord du cercle de naissance', () => {
    expect(convergeSpeed(100, 100, 200)).toBeCloseTo(100, 6)
  })

  it('atteint sa vitesse maximale au centre', () => {
    expect(convergeSpeed(0, 100, 200)).toBeCloseTo(400, 6)
  })

  it('accélère à mesure que la particule se rapproche', () => {
    expect(convergeSpeed(20, 100, 200)).toBeGreaterThan(convergeSpeed(80, 100, 200))
  })

  it('ne ralentit pas au-delà du cercle de naissance', () => {
    expect(convergeSpeed(180, 100, 200)).toBeCloseTo(convergeSpeed(100, 100, 200), 6)
  })
})

describe('stallDamping', () => {
  it('laisse la particule libre sans délai d’arrêt', () => {
    expect(stallDamping(500, undefined, 16.67)).toBe(1)
  })

  it('laisse la particule libre avant son délai', () => {
    expect(stallDamping(100, 240, 16.67)).toBe(1)
  })

  it('la fige une fois le délai passé', () => {
    expect(stallDamping(300, 240, 16.67)).toBeLessThan(0.6)
  })

  it('ne dépend pas du framerate', () => {
    const plein = stallDamping(300, 240, 16.67)
    const moitie = stallDamping(300, 240, 8.335)
    expect(moitie * moitie).toBeCloseTo(plein, 6)
  })
})
