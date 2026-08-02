import { describe, expect, it } from 'vitest'

import {
  DEATH_DETONATE_MS,
  DEATH_DISPERSE_MS,
  DEATH_FREEZE_MS,
  DEATH_SEQUENCE_MS,
  deathPhaseAt,
  detonationDelay,
} from './death-sequence'

describe('durée de la séquence', () => {
  it('vaut exactement la somme de ses phases', () => {
    expect(DEATH_FREEZE_MS + DEATH_DETONATE_MS + DEATH_DISPERSE_MS).toBe(DEATH_SEQUENCE_MS)
  })
})

describe('deathPhaseAt', () => {
  it('commence par le temps d’arrêt', () => {
    expect(deathPhaseAt(0)).toBe('freeze')
    expect(deathPhaseAt(DEATH_FREEZE_MS - 1)).toBe('freeze')
  })

  it('enchaîne sur les détonations', () => {
    expect(deathPhaseAt(DEATH_FREEZE_MS)).toBe('detonate')
    expect(deathPhaseAt(DEATH_FREEZE_MS + DEATH_DETONATE_MS - 1)).toBe('detonate')
  })

  it('finit par la dispersion du joueur', () => {
    expect(deathPhaseAt(DEATH_FREEZE_MS + DEATH_DETONATE_MS)).toBe('disperse')
    expect(deathPhaseAt(DEATH_SEQUENCE_MS - 1)).toBe('disperse')
  })

  it('est terminée au bout de sa durée', () => {
    expect(deathPhaseAt(DEATH_SEQUENCE_MS)).toBe('done')
    expect(deathPhaseAt(DEATH_SEQUENCE_MS * 3)).toBe('done')
  })
})

describe('detonationDelay', () => {
  it('fait partir le plus proche avant le plus lointain', () => {
    expect(detonationDelay(10, 1000, 4)).toBeLessThan(detonationDelay(900, 1000, 4))
  })

  it('est déterministe : deux appels sur la même entité coïncident', () => {
    expect(detonationDelay(500, 1000, 42)).toBe(detonationDelay(500, 1000, 42))
  })

  it('désordonne un peu : deux entités à la même distance ne partent pas ensemble', () => {
    const delais = [1, 2, 3, 4, 5, 6, 7, 8].map((eid) => detonationDelay(500, 1000, eid))
    expect(new Set(delais).size).toBeGreaterThan(1)
  })

  it('laisse toute la file détoner avant la fin de sa phase', () => {
    for (let eid = 0; eid < 200; eid++) {
      expect(detonationDelay(1000, 1000, eid)).toBeLessThan(DEATH_DETONATE_MS)
    }
  })

  it('ne renvoie jamais de délai négatif', () => {
    expect(detonationDelay(0, 1000, 0)).toBeGreaterThanOrEqual(0)
  })

  it('supporte une distance au-delà du maximum sans dépasser la phase', () => {
    expect(detonationDelay(5000, 1000, 9)).toBeLessThan(DEATH_DETONATE_MS)
  })
})
