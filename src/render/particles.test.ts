import { describe, expect, it } from 'vitest'

import { burstAngle } from './particles'

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
