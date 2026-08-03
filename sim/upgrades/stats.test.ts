import { describe, expect, it } from 'vitest'

import { POWERUP_BASE } from '../data/powerups'
import { createRunStats } from './stats'

describe('createRunStats', () => {
  it('sans facteur, reprend les valeurs de base telles quelles', () => {
    const stats = createRunStats()
    expect(stats.freezeRadius).toBe(POWERUP_BASE.freeze.radius)
    expect(stats.blastRadius).toBe(POWERUP_BASE.blast.maxRadius)
    expect(stats.blotterRadius).toBe(POWERUP_BASE.blotter.radius)
  })

  it('met les portées à l’échelle, et elles seules', () => {
    const stats = createRunStats(0.7)
    expect(stats.freezeRadius).toBeCloseTo(POWERUP_BASE.freeze.radius * 0.7, 9)
    expect(stats.blastRadius).toBeCloseTo(POWERUP_BASE.blast.maxRadius * 0.7, 9)
    expect(stats.blotterRadius).toBeCloseTo(POWERUP_BASE.blotter.radius * 0.7, 9)
    // Le rayon meurtrier de la Ruée est une hitbox, pas une portée.
    expect(stats.dashRadius).toBe(POWERUP_BASE.dash.radius)
    // Décision explicite de la spec : la locomotion du joueur ne change pas.
    expect(stats.moveSpeed).toBe(240)
    // Aucune durée ne bouge.
    expect(stats.freezeDurationMs).toBe(POWERUP_BASE.freeze.durationMs)
    expect(stats.dashDurationMs).toBe(POWERUP_BASE.dash.durationMs)
  })

  // Le Gel occupe la même fraction de hauteur d'arène qu'au bureau : c'est
  // toute la raison d'être de cette mise à l'échelle (spec §3).
  it('garde au Gel la même fraction d’arène', () => {
    const desktop = (createRunStats(1).freezeRadius * 2) / 720
    const mobile = (createRunStats(0.7).freezeRadius * 2) / 504
    expect(mobile).toBeCloseTo(desktop, 9)
  })
})
