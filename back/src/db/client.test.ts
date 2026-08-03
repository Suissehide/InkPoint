import { describe, expect, it } from 'vitest'

import { prisma } from './client'

describe('client Prisma', () => {
  it('atteint la base et voit la table Run', async () => {
    // `count` échoue si la migration n'a pas été appliquée : c'est ce qu'on
    // veut vérifier, plus qu'une simple connexion TCP.
    const total = await prisma.run.count()
    expect(total).toBeGreaterThanOrEqual(0)
  })
})
