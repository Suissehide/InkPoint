import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from './db/client'
import { bestOf, rankOf, topRuns, totalRuns } from './ranking'

async function seedRun(
  nickname: string,
  score: number,
  hash: string,
): Promise<{ id: string; createdAt: Date }> {
  return prisma.run.create({
    data: {
      nickname,
      seed: 1n,
      arenaId: 0,
      simVersion: '0'.repeat(16),
      score,
      wave: 1,
      steps: 10,
      replayHash: hash,
    },
  })
}

describe('rankOf', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('rend le rang de LA PARTIE SOUMISE, pas celui du record du pseudo — et rank ≤ total même hors record', async () => {
    // Cinq pseudos mieux classés que le record de `leo`, puis `leo` republie
    // une partie plus faible que ce record. Règles « arcade cabinet » (spec
    // du jour) : chaque partie a sa propre ligne, donc le record de `leo`
    // (100 000) ET la republication plus faible (31) comptent TOUTES LES
    // DEUX dans l'ensemble classé — la republication se classe derrière les
    // cinq autres pseudos ET derrière son propre record : rang 7 sur 7
    // parties au total.
    //
    // C'est précisément le cas qui produisait, avant la correction du
    // dédoublonnage, un rang supérieur au total (« 2ᵉ sur 1 ») : la
    // republication était alors ABSENTE de l'ensemble dédoublonné, donc son
    // propre record se comptait contre elle EN PLUS des cinq autres pseudos,
    // pour un total qui ne comptait, lui, que les pseudos.
    for (let i = 0; i < 5; i++) {
      await seedRun(`j${i}`, 200_000 - i, `top-${i}`)
    }
    await seedRun('leo', 100_000, 'leo-best')
    const worse = await seedRun('leo', 31, 'leo-worse')

    const { rank, improved } = await rankOf(worse.id)
    expect(rank).toBe(7)
    expect(improved).toBe(false)
    expect(rank).toBeLessThanOrEqual(await totalRuns())
  })

  it('marque improved quand la soumission devient le record du pseudo', async () => {
    await seedRun('leo', 100, 'first')
    const better = await seedRun('leo', 200, 'better')

    const { rank, improved } = await rankOf(better.id)
    expect(rank).toBe(1)
    expect(improved).toBe(true)
  })
})

describe('totalRuns', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('compte les parties, pas les pseudos : un pseudo qui republie compte pour chacune', async () => {
    // Règles « arcade cabinet » : l'inverse exact du comportement dédoublonné
    // d'avant (`DISTINCT ON (nickname)`), qui ne comptait `leo` qu'une fois
    // quel que soit le nombre de parties publiées sous ce pseudo.
    await seedRun('leo', 100, 'a')
    await seedRun('leo', 200, 'b')
    await seedRun('leo', 300, 'c')
    await seedRun('ana', 50, 'd')
    expect(await totalRuns()).toBe(4)
  })
})

async function seed(nickname: string, score: number, hash: string): Promise<void> {
  await prisma.run.create({
    data: {
      nickname,
      seed: 1n,
      arenaId: 0,
      simVersion: '0'.repeat(16),
      score,
      wave: 1,
      steps: 10,
      replayHash: hash,
    },
  })
}

describe('classement', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('donne le même rang aux scores égaux, et saute les rangs ensuite', async () => {
    await seed('ana', 100, 'a')
    await seed('bo', 100, 'b')
    await seed('cy', 50, 'c')
    // Rang de compétition : deux premiers ex æquo, puis 3 — jamais 1, 2, 3.
    expect((await topRuns(10)).map((r) => r.rank)).toEqual([1, 1, 3])
  })

  it('un même pseudo occupe plusieurs lignes, triées par score — falsifié en repassant par DISTINCT ON', async () => {
    // Trois parties de `leo`, une d'`ana` intercalée par le score. Règles
    // « arcade cabinet » : les TROIS lignes de `leo` doivent apparaître,
    // dans l'ordre du score, pas seulement la meilleure.
    await seed('leo', 300, 'leo-1')
    await seed('leo', 200, 'leo-2')
    await seed('ana', 150, 'ana-1')
    await seed('leo', 100, 'leo-3')

    const top = await topRuns(10)
    expect(top.map((r) => ({ nickname: r.nickname, score: r.score, rank: r.rank }))).toEqual([
      { nickname: 'leo', score: 300, rank: 1 },
      { nickname: 'leo', score: 200, rank: 2 },
      { nickname: 'ana', score: 150, rank: 3 },
      { nickname: 'leo', score: 100, rank: 4 },
    ])
    // Falsification (brief) : en remettant `DISTINCT ON (nickname)` dans
    // `RUNS_BY_SCORE`, ce test doit rougir — `leo` ne garderait plus que sa
    // ligne à 300, `ana` passerait 2ᵉ avec un rang 2 et non 3. Vérifié à la
    // main pendant l'implémentation (voir le rapport), pas rejoué ici : un
    // test qui altère le module qu'il teste pour se prouver lui-même n'a pas
    // sa place dans la suite permanente.
  })

  it('rend la meilleure ligne d’un pseudo et son rang', async () => {
    await seed('ana', 100, 'a')
    await seed('leo', 40, 'b')
    await seed('leo', 70, 'c')
    const you = await bestOf('leo')
    expect(you?.score).toBe(70)
    expect(you?.rank).toBe(2)
  })

  it('rend null pour un pseudo qui n’a rien publié', async () => {
    await seed('ana', 100, 'a')
    expect(await bestOf('inconnu')).toBeNull()
  })
})
