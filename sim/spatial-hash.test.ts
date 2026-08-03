import { describe, expect, it } from 'vitest'

import { createSpatialHash } from './spatial-hash'

describe('createSpatialHash', () => {
  it('retrouve une entité dans le rayon', () => {
    const hash = createSpatialHash(64)
    hash.insert(1, 100, 100)
    expect(hash.query(100, 100, 10, [])).toContain(1)
  })

  it('ignore une entité hors du rayon de recherche', () => {
    const hash = createSpatialHash(64)
    hash.insert(1, 1000, 1000)
    expect(hash.query(100, 100, 10, [])).not.toContain(1)
  })

  it('trouve les entités à cheval sur plusieurs cellules', () => {
    const hash = createSpatialHash(64)
    hash.insert(1, 63, 63)
    hash.insert(2, 65, 65)
    const found = hash.query(64, 64, 20, [])
    expect(found).toContain(1)
    expect(found).toContain(2)
  })

  it('gère les coordonnées négatives', () => {
    const hash = createSpatialHash(64)
    hash.insert(1, -50, -50)
    expect(hash.query(-50, -50, 5, [])).toContain(1)
  })

  it('clear() vide la grille', () => {
    const hash = createSpatialHash(64)
    hash.insert(1, 100, 100)
    hash.clear()
    expect(hash.query(100, 100, 10, [])).toEqual([])
  })

  it('réutilise le tableau de sortie fourni', () => {
    const hash = createSpatialHash(64)
    hash.insert(1, 100, 100)
    const out: number[] = [999]
    const result = hash.query(100, 100, 10, out)
    expect(result).toBe(out)
    expect(result).toEqual([1])
  })
})
