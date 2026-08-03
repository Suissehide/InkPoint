# Lot 2 du classement — publication et affichage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un joueur meurt, clique « Publier mon score », voit son rang — et retrouve le classement au menu.

**Architecture:** Le service du lot 1 est en place et fusionné. Ce lot ajoute au front un client HTTP, un pseudo mémorisé, un bouton de publication et un panneau de classement réutilisé à deux endroits ; et au back trois ajustements que la relecture du lot 1 a rendus nécessaires.

**Tech Stack:** TypeScript, Vite, Pixi pour le jeu mais **DOM pur pour ces écrans** (comme tous les écrans existants sous `front/src/ui/screens/`), `CompressionStream('gzip')`, Vitest.

Spec : `docs/superpowers/specs/2026-08-03-leaderboard-service-design.md`, §4 et §8.

## Global Constraints

- **Commentaires et messages de commit en français ; les identifiants restent en anglais.**
- Conventional Commits (husky + commitlint actifs). `merge:` est refusé.
- Biome 2.4.5, configuration racine, `semicolons: asNeeded`, guillemets simples, `lineWidth: 100`, accolades sur tous les `if`. Aucun `biome-ignore`.
- `T[]` et jamais `Array<T>`. `noUncheckedIndexedAccess` activé.
- **Ne jamais `git add -A`** — mettre en index uniquement les fichiers touchés.
- **Ne jamais tuer de processus ni de conteneur par motif.** `gachapon-postgres`, `medisync-postgres` et `inkpoint-postgres-dev` (port 5434) appartiennent à d'autres travaux ; le port 3000 de la machine est occupé par un service tiers.
- Postgres de développement : `npm run db:up` depuis `back/`, port **5434**.
- Pseudo : **1 à 20 caractères après élagage**. Le front normalise avant d'envoyer ; le serveur ne contrôle que la longueur.
- Toute chaîne visible passe par l'i18n (`front/src/i18n/locales/{fr,en}.json`), clés plates en notation pointée.
- Ces écrans doivent rester utilisables au doigt : le jeu tourne aussi en arène mobile.

---

## Structure des fichiers

```
back/
  src/ranking.ts        + rang de compétition partout, + bestOf(nickname)
  src/routes/leaderboard.ts   + paramètre nickname facultatif, réponse { top, you }
  src/server.ts         + setErrorHandler qui donne un `reason` à toutes les erreurs
front/src/
  app/leaderboard-client.ts   fetch, gzip, typage des réponses et des refus
  app/nickname.ts             lecture, écriture et normalisation du pseudo
  ui/screens/leaderboard.ts   le panneau, réutilisé au menu et à l'écran de fin
  ui/screens/gameover.ts      + bouton « Publier mon score » et ses états
  ui/screens/menu.ts          + entrée « Classement »
  ui/screens/settings.ts      + champ pseudo
  app/game.ts                 câblage : passer le replay enregistré au client
```

`leaderboard-client.ts` ne connaît pas le DOM ; `leaderboard.ts` ne connaît pas `fetch`. C'est ce qui rend le premier testable sans navigateur et le second sans serveur.

---

## Task 1 : Une seule formule de rang, et `bestOf`

**Files:**
- Modify: `back/src/ranking.ts`
- Test: `back/src/ranking.test.ts` (créer)

**Interfaces:**
- Produces: `topRuns(limit)` inchangé de signature mais **rangs en compétition** ; `bestOf(nickname: string): Promise<LeaderboardRow | null>` — la meilleure ligne d'un pseudo, avec son rang, ou `null` si le pseudo n'a rien publié.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `back/src/ranking.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from './db/client'
import { bestOf, topRuns } from './ranking'

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
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npx vitest run src/ranking.test.ts`
Expected: FAIL — `bestOf` n'existe pas, et `topRuns` rend `[1, 2, 3]`.

- [ ] **Step 3 : Calculer le rang en SQL plutôt qu'en JavaScript**

Dans `back/src/ranking.ts`, remplacer la numérotation par index de `topRuns` par un rang calculé dans la requête, avec la même formule que `rankOf` :

```ts
export async function topRuns(limit: number): Promise<LeaderboardRow[]> {
  // `rank()` de SQL est exactement `count(strictement meilleur) + 1` : c'est la
  // même formule que `rankOf`, et c'est le point. Numéroter par index de
  // tableau donnait « 1, 2, 3 » à trois scores égaux, quand `rankOf` disait
  // « 1, 1, 1 » — un joueur s'entendait dire 1ᵉʳ à la publication et se voyait
  // 3ᵉ au menu.
  return prisma.$queryRawUnsafe<LeaderboardRow[]>(
    `WITH best AS (${BEST_PER_NICKNAME}),
          classed AS (
            SELECT nickname, score, wave, "arenaId", "createdAt",
                   rank() OVER (ORDER BY score DESC) AS rank
            FROM best
          )
     SELECT * FROM classed ORDER BY rank ASC, "createdAt" ASC LIMIT $1`,
    limit,
  )
}
```

> `rank()` est fenêtré sur `score DESC` **seul**, sans `createdAt` : inclure la date départagerait les égalités et redonnerait `1, 2, 3`. L'ordre d'affichage, lui, garde `createdAt` en second critère pour être déterministe.

- [ ] **Step 4 : Ajouter `bestOf`**

```ts
/**
 * La meilleure ligne d'un pseudo et son rang, ou `null` s'il n'a rien publié.
 *
 * Sert la ligne « toi » du panneau de classement, pour que le tableau dise
 * quelque chose à qui n'atteindra jamais le top 100.
 */
export async function bestOf(nickname: string): Promise<LeaderboardRow | null> {
  const rows = await prisma.$queryRawUnsafe<LeaderboardRow[]>(
    `WITH best AS (${BEST_PER_NICKNAME}),
          classed AS (
            SELECT nickname, score, wave, "arenaId", "createdAt",
                   rank() OVER (ORDER BY score DESC) AS rank
            FROM best
          )
     SELECT * FROM classed WHERE nickname = $1`,
    nickname,
  )
  return rows[0] ?? null
}
```

- [ ] **Step 5 : Lancer les tests**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npm test`
Expected: PASS. `rank` revient de Postgres en `bigint` — le convertir en `Number` là où il est rendu, comme `rankOf` le fait déjà.

- [ ] **Step 6 : Falsifier**

Remettre `rank() OVER (ORDER BY score DESC, "createdAt" ASC)`, relancer : le premier test doit rougir en rendant `[1, 2, 3]`. Remettre.

Consigner les deux sorties. **Si le test reste vert, le dire** : il ne mesurerait alors pas ce qu'il annonce.

- [ ] **Step 7 : Committer**

```bash
git add back/src/ranking.ts back/src/ranking.test.ts
git commit -m "fix(back): une seule formule de rang, et la meilleure ligne d'un pseudo"
```

---

## Task 2 : `GET /leaderboard?nickname=`, et un `reason` sur toutes les erreurs

**Files:**
- Modify: `back/src/routes/leaderboard.ts`, `back/src/server.ts`
- Test: `back/src/routes/leaderboard.test.ts`

**Interfaces:**
- Consumes: `topRuns`, `bestOf` (tâche 1).
- Produces: `GET /leaderboard` rend `{ top: LeaderboardRow[], you?: LeaderboardRow }`. Toute erreur du service porte désormais `{ reason, message }`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter dans `back/src/routes/leaderboard.test.ts` :

```ts
  it('rend { top } sans pseudo', async () => {
    await seedRun('ana', 100, 'a')
    const app = buildServer()
    await app.ready()
    const body = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    expect(body.top).toHaveLength(1)
    expect(body.you).toBeUndefined()
    await app.close()
  })

  it('ajoute « toi » quand le pseudo est hors du top rendu', async () => {
    // Semé depuis `TOP_SIZE` et non depuis un nombre écrit en dur : ce test doit
    // suivre le jour où la taille du classement change.
    for (let i = 0; i < TOP_SIZE; i++) {
      await seedRun(`j${i}`, 1000 - i, `h${i}`)
    }
    await seedRun('leo', 1, 'moi')
    const app = buildServer()
    await app.ready()
    const body = (await app.inject({ method: 'GET', url: '/leaderboard?nickname=leo' })).json()
    expect(body.top).toHaveLength(TOP_SIZE)
    expect(body.you.nickname).toBe('leo')
    expect(body.you.rank).toBe(TOP_SIZE + 1)
    await app.close()
  })

  it('n’ajoute pas « toi » quand le pseudo est déjà dans le top', async () => {
    await seedRun('leo', 100, 'a')
    const app = buildServer()
    await app.ready()
    const body = (await app.inject({ method: 'GET', url: '/leaderboard?nickname=leo' })).json()
    expect(body.top[0].nickname).toBe('leo')
    // Répéter en pied une ligne déjà visible n'apprendrait rien au joueur.
    expect(body.you).toBeUndefined()
    await app.close()
  })

  it('donne un reason à une erreur de validation', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: '', replay: 'x' },
    })
    // Le front traite une seule forme d'erreur, pas trois.
    expect(res.json().reason).toBe('invalid_request')
    await app.close()
  })
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npx vitest run src/routes/leaderboard.test.ts`
Expected: FAIL — la route rend un tableau nu et le 400 de zod n'a pas de `reason`.

- [ ] **Step 3 : Réécrire la route**

```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { bestOf, topRuns } from '../ranking'

/**
 * Taille du classement rendu (spec §4). Exporté parce que les tests doivent
 * s'en servir plutôt que de réécrire le nombre : semer « un de plus que le
 * top » en dur casserait silencieusement le jour où ce nombre change.
 */
export const TOP_SIZE = 100

const querySchema = z.object({
  /** Facultatif : fourni, la réponse porte en plus la ligne de ce pseudo. */
  nickname: z.string().trim().min(1).max(20).optional(),
})

export function registerLeaderboard(app: FastifyInstance): void {
  app.get('/leaderboard', { schema: { querystring: querySchema } }, async (request) => {
    const top = await topRuns(TOP_SIZE)
    const rows = top.map(present)

    const { nickname } = request.query
    if (nickname === undefined) {
      return { top: rows }
    }
    // Inutile de répéter en pied une ligne déjà visible dans la liste.
    if (rows.some((row) => row.nickname === nickname)) {
      return { top: rows }
    }
    const you = await bestOf(nickname)
    return you === null ? { top: rows } : { top: rows, you: present(you) }
  })
}
```

Avec un `present(row)` local qui arrondit le score et sérialise la date — le même pour les deux clés, sans quoi la ligne « toi » pourrait afficher un score au format différent des autres.

- [ ] **Step 4 : Ajouter le gestionnaire d'erreurs**

Dans `back/src/server.ts`, avant les enregistrements de routes :

```ts
  // Le front n'a qu'une forme d'erreur à traiter. Sans ça, il en aurait trois :
  // les 422 métier portent `{reason, message}`, le 400 de zod et le 413 de
  // `bodyLimit` portent le `{statusCode, error, message}` de Fastify.
  app.setErrorHandler((error, _request, reply) => {
    const status = error.statusCode ?? 500
    if (status === 413) {
      return reply.code(413).send({ reason: 'too_large', message: error.message })
    }
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ reason: 'invalid_request', message: error.message })
    }
    // Une panne reste une panne : ni `reason` métier, ni détail interne exposé.
    reply.log.error(error)
    return reply.code(500).send({ reason: 'server_error', message: 'erreur interne' })
  })
```

- [ ] **Step 5 : Lancer toute la suite**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npm test`
Expected: PASS. Les tests existants qui lisaient un tableau nu doivent être adaptés à `{ top }` — c'est attendu, et c'est la seule rupture de contrat de ce lot.

- [ ] **Step 6 : Falsifier le gestionnaire**

Retirer le `setErrorHandler`, relancer : le test du `reason` sur le 400 doit rougir. Remettre.

- [ ] **Step 7 : Committer**

```bash
git add back/src/routes/leaderboard.ts back/src/routes/leaderboard.test.ts back/src/server.ts
git commit -m "feat(back): la ligne toi au classement, et une seule forme d'erreur"
```

---

## Task 3 : Le pseudo — stockage et normalisation

**Files:**
- Create: `front/src/app/nickname.ts`
- Test: `front/src/app/nickname.test.ts`

**Interfaces:**
- Produces: `readNickname(): string | null`, `writeNickname(raw: string): string | null` (rend la forme normalisée retenue, ou `null` si elle est vide après normalisation), `normalizeNickname(raw: string): string`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `front/src/app/nickname.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { normalizeNickname, readNickname, writeNickname } from './nickname'

describe('pseudo', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('élague et borne à 20 caractères', () => {
    expect(normalizeNickname('  leo  ')).toBe('leo')
    expect(normalizeNickname('a'.repeat(30))).toHaveLength(20)
  })

  it('retire les caractères de contrôle et les marques bidirectionnelles', () => {
    // `U+202E` inverse le sens de lecture et casserait la mise en page du
    // tableau ; un saut de ligne ferait déborder la ligne. Le serveur ne
    // contrôle que la longueur (spec §11), donc les deux passeraient.
    expect(normalizeNickname('le‮o')).toBe('leo')
    expect(normalizeNickname('le\no')).toBe('leo')
    expect(normalizeNickname('le o')).toBe('leo')
  })

  it('rend null quand il ne reste rien', () => {
    expect(writeNickname('   ')).toBeNull()
    expect(readNickname()).toBeNull()
  })

  it('mémorise la forme normalisée, pas la saisie brute', () => {
    expect(writeNickname('  Léo‮  ')).toBe('Léo')
    expect(readNickname()).toBe('Léo')
  })
})
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `cd front && npx vitest run src/app/nickname.test.ts`
Expected: FAIL — le module n'existe pas.

- [ ] **Step 3 : Écrire le module**

```ts
import { storage } from './storage'

const KEY = 'nickname'
const MAX_LENGTH = 20

/**
 * Élague, retire ce qui casserait l'affichage, et borne la longueur.
 *
 * Le serveur ne contrôle que la longueur (spec §11) : un pseudo contenant une
 * marque bidirectionnelle (`U+202E` inverse le sens de lecture) ou un saut de
 * ligne passerait sa validation et casserait la mise en page du tableau pour
 * tout le monde. C'est donc ici que ça se ferme.
 */
export function normalizeNickname(raw: string): string {
  return raw
    // Caractères de contrôle C0/C1, plus les marques de direction.
    .replace(/[ --‎‏‪-‮⁦-⁩]/g, '')
    .trim()
    .slice(0, MAX_LENGTH)
}

/** Le pseudo mémorisé, ou `null` s'il n'y en a pas. */
export function readNickname(): string | null {
  const stored = storage.get<string | null>(KEY, null)
  if (stored === null) {
    return null
  }
  const clean = normalizeNickname(stored)
  return clean === '' ? null : clean
}

/** Mémorise la forme normalisée et la rend, ou `null` si elle est vide. */
export function writeNickname(raw: string): string | null {
  const clean = normalizeNickname(raw)
  if (clean === '') {
    return null
  }
  storage.set(KEY, clean)
  return clean
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `cd front && npx vitest run src/app/nickname.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5 : Falsifier**

Retirer le `.replace(...)` de `normalizeNickname`, relancer : le test des caractères de contrôle doit rougir. Remettre.

- [ ] **Step 6 : Committer**

```bash
git add front/src/app/nickname.ts front/src/app/nickname.test.ts
git commit -m "feat(front): le pseudo, memorise et normalise"
```

---

## Task 4 : Le client HTTP

**Files:**
- Create: `front/src/app/leaderboard-client.ts`
- Test: `front/src/app/leaderboard-client.test.ts`
- Modify: `front/.env.example` (créer si absent), `front/src/vite-env.d.ts` si présent

**Interfaces:**
- Consumes: `encodeReplay` de `@sim/replay/format`, `Replay`.
- Produces:
  - `type SubmitOutcome = { ok: true; score: number; rank: number; total: number; improved: boolean } | { ok: false; reason: string; message: string }`
  - `submitRun(nickname: string, replay: Replay): Promise<SubmitOutcome>`
  - `fetchLeaderboard(nickname: string | null): Promise<{ top: LeaderboardEntry[]; you?: LeaderboardEntry } | null>` — `null` si le service est injoignable.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `front/src/app/leaderboard-client.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchLeaderboard, submitRun } from './leaderboard-client'

const replay = { simVersion: '0'.repeat(16), seed: 1, arenaId: 0 as const, inputs: new Int16Array(0), choices: [] }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('client du classement', () => {
  it('rend le rang quand le serveur accepte', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ score: 31, rank: 7, total: 42, improved: true }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    )))
    const out = await submitRun('leo', replay)
    expect(out).toEqual({ ok: true, score: 31, rank: 7, total: 42, improved: true })
  })

  it('rend le motif quand le serveur refuse', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ reason: 'stale_build', message: 'version périmée' }),
      { status: 422, headers: { 'content-type': 'application/json' } },
    )))
    const out = await submitRun('leo', replay)
    expect(out).toEqual({ ok: false, reason: 'stale_build', message: 'version périmée' })
  })

  it('rend un motif réseau plutôt que de lever, quand le service est injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    // Le jeu reste jouable hors ligne (spec §8) : une publication qui échoue ne
    // doit jamais remonter en exception jusqu'à la boucle de jeu.
    expect(await submitRun('leo', replay)).toEqual({
      ok: false,
      reason: 'offline',
      message: expect.any(String),
    })
    expect(await fetchLeaderboard(null)).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `cd front && npx vitest run src/app/leaderboard-client.test.ts`
Expected: FAIL — le module n'existe pas.

- [ ] **Step 3 : Écrire le client**

Le corps doit :

```ts
/** Base de l'API. En développement, le sous-domaine n'existe pas. */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** `Replay` → gzip → base64, avec l'API du navigateur. */
async function toBase64(replay: Replay): Promise<string> {
  const bytes = encodeReplay(replay)
  // `CompressionStream` est l'équivalent navigateur de `node:zlib` : le flux
  // gzip diffère, mais le `.bin` décompressé est identique — et c'est lui que
  // le serveur hache et rejoue.
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  const gz = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ''
  for (const byte of gz) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}
```

`submitRun` fait le `POST`, lit le JSON, et **n'exclut jamais** : tout `catch` rend `{ ok: false, reason: 'offline', … }`. `fetchLeaderboard` rend `null` sur échec réseau et n'a pas d'autre chemin d'erreur — un classement qu'on n'a pas pu charger n'est pas une faute du joueur.

- [ ] **Step 4 : Lancer les tests**

Run: `cd front && npx vitest run src/app/leaderboard-client.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5 : Vérifier dans les trois moteurs**

`CompressionStream` et `btoa` sont des API navigateur : les tester sous Node ne prouve pas qu'elles se comportent pareil ailleurs.

Run: `cd front && npm run test:browser:chromium && npm run test:browser:firefox && npm run test:browser:webkit`
Expected: PASS partout. Si un moteur manque `CompressionStream`, le dire — c'est une contrainte de conception, pas un détail.

- [ ] **Step 6 : Committer**

```bash
git add front/src/app/leaderboard-client.ts front/src/app/leaderboard-client.test.ts front/.env.example
git commit -m "feat(front): le client du service de classement"
```

---

## Task 5 : Le test qui compte — un replay du navigateur, vérifié par le serveur

**Files:**
- Test: `back/src/routes/runs.browser-replay.test.ts` (créer)

**Interfaces:**
- Consumes: tout ce qui précède.

> **Ce test est la raison d'être de ce lot.** La spec §10 l'appelle « le test qui compte », et le lot 1 ne pouvait pas l'écrire : il fabriquait ses replays avec le même code que le serveur, donc il prouvait la cohérence interne, **pas** que le chemin d'enregistrement du navigateur produit ce que le serveur attend. Une erreur dans l'enregistreur, dans la quantification ou dans la compression du navigateur ne serait rattrapée par rien d'autre.

- [ ] **Step 1 : Écrire le test**

Il doit, dans cet ordre : produire un replay **par le chemin du front** (`createReplayRecorder`, alimenté par une run scriptée jouée jusqu'à la mort), le compresser **avec `CompressionStream`** et non `node:zlib`, le poster à `/runs` via `app.inject()`, et vérifier que le score rendu par le serveur égale, **après arrondi**, celui de la run directe.

```ts
    const recorder = createReplayRecorder(seed)
    // … boucle : writeInto, quantizeInput, recorder.step, stepAndAbsorb …
    const replay = recorder.build()
    const payload = await toBase64(replay)   // CompressionStream, pas zlib
    const res = await app.inject({ method: 'POST', url: '/runs', payload: { nickname: 'leo', replay: payload } })
    expect(res.statusCode).toBe(201)
    expect(res.json().score).toBe(Math.round(direct.score))
```

- [ ] **Step 2 : Lancer**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npx vitest run src/routes/runs.browser-replay.test.ts`
Expected: PASS.

> `CompressionStream` n'existe pas dans l'environnement Node de Vitest avant Node 18 ; il existe en Node 22, qui est la version du projet. S'il manque, faire tourner ce test dans la configuration navigateur du front plutôt que d'y substituer `zlib` — **substituer `zlib` annulerait tout l'intérêt du test**.

- [ ] **Step 3 : Falsifier**

Décaler l'enregistrement d'un pas (enregistrer **après** `stepAndAbsorb` au lieu d'avant), relancer : le test doit rougir sur un score différent. Remettre.

C'est la falsification la plus importante de ce lot : elle prouve que le test verrait un décalage entre ce que le jeu simule et ce qu'il enregistre.

- [ ] **Step 4 : Committer**

```bash
git add back/src/routes/runs.browser-replay.test.ts
git commit -m "test(back): un replay produit par le chemin du front, verifie par le service"
```

---

## Task 6 : Le panneau de classement

**Files:**
- Create: `front/src/ui/screens/leaderboard.ts`
- Test: `front/src/ui/screens/leaderboard.test.ts`
- Modify: `front/src/i18n/locales/fr.json`, `front/src/i18n/locales/en.json`, `front/src/styles/main.css`

**Interfaces:**
- Produces: `createLeaderboardPanel(root: HTMLElement): { show(data, highlight?): void; hide(): void; showError(): void; showLoading(): void }`.

- [ ] **Step 1 : Écrire les tests**

Le panneau se teste sans serveur : on lui donne des données. Couvrir au minimum — une liste rendue dans l'ordre ; la ligne « toi » en pied quand `you` est fourni ; la mise en évidence d'une ligne quand `highlight` est donné, **et son amenée dans la vue** ; le classement vide (« sois le premier ») ; l'état d'erreur.

Le classement fait **cent lignes**, donc le panneau défile. Deux conséquences à tester : la zone de défilement existe et est bornée en hauteur (sans quoi l'écran de fin déborde), et la ligne mise en évidence est amenée dans la vue — une mise en évidence au rang 73, hors écran, n'apprend rien au joueur qui vient de publier.

```ts
  it('affiche la ligne « toi » en pied quand elle est fournie', () => {
    const panel = createLeaderboardPanel(root)
    panel.show({ top: [row('ana', 1, 100)], you: row('leo', 47, 8) })
    expect(root.querySelector('[data-you]')?.textContent).toContain('leo')
  })

  it('n’affiche pas de pied quand le joueur est dans la liste', () => {
    const panel = createLeaderboardPanel(root)
    panel.show({ top: [row('leo', 1, 100)] })
    expect(root.querySelector('[data-you]')).toBeNull()
  })
```

- [ ] **Step 2 : Lancer pour voir échouer, puis écrire le panneau**

Run: `cd front && npx vitest run src/ui/screens/leaderboard.test.ts`

Le panneau doit : afficher `rank`, `nickname`, `score` arrondi et une pastille d'arène (bureau / mobile, depuis `arenaId`) ; **échapper le pseudo** en passant par `textContent` et jamais `innerHTML` ; défiler dans une hauteur bornée ; appeler `scrollIntoView` sur la ligne mise en évidence ; rester lisible et défilable au doigt.

> L'échappement n'est pas facultatif : le serveur n'assainit pas le pseudo (spec §11), donc un joueur peut publier `<img src=x onerror=…>`. `textContent` ferme la question à la source.

- [ ] **Step 3 : Ajouter les clés i18n**

Dans les deux fichiers de locales : titre du panneau, en-têtes, état vide, état d'erreur, libellé « toi », pastilles d'arène.

- [ ] **Step 4 : Falsifier l'échappement**

Passer un pseudo `<b>gras</b>` et vérifier que le DOM contient le texte littéral et non un élément `<b>`. Puis remplacer `textContent` par `innerHTML`, vérifier que le test rougit, remettre.

- [ ] **Step 5 : Lancer lint, typage, suite, et committer**

```bash
cd front && npm run lint && npm run typecheck && npm test
git add front/src/ui/screens/leaderboard.ts front/src/ui/screens/leaderboard.test.ts front/src/i18n/locales front/src/styles/main.css
git commit -m "feat(front): le panneau de classement"
```

---

## Task 7 : Publier depuis l'écran de fin

**Files:**
- Modify: `front/src/ui/screens/gameover.ts`, `front/src/app/game.ts`, les deux fichiers de locales
- Test: `front/src/ui/screens/gameover.test.ts` (créer si absent)

**Interfaces:**
- Consumes: `submitRun`, `fetchLeaderboard` (tâche 4), `readNickname`/`writeNickname` (tâche 3), `createLeaderboardPanel` (tâche 6), le replay de `recorder.build()`.

- [ ] **Step 1 : Écrire les tests des états du bouton**

Cinq états à couvrir : au repos ; en cours d'envoi (désactivé) ; publié, montrant le rang et `improved` ; refusé avec un motif ; hors ligne, le bouton restant disponible pour réessayer.

Le cas `stale_build` mérite son propre test : le message doit inviter à **recharger la page**, pas dire que le replay est invalide (spec §6). Un joueur honnête ne doit jamais lire qu'on soupçonne son score.

- [ ] **Step 2 : Écrire le bouton et son câblage**

`game.ts` passe `recorder.build()` à l'écran de fin. Au premier clic, si `readNickname()` rend `null`, on demande le pseudo — un champ dans l'écran de fin, pas une `prompt()` du navigateur, qui bloque la boucle d'événements et ne se style pas.

- [ ] **Step 3 : Falsifier**

Faire répondre le client `{ ok: false, reason: 'stale_build' }` et vérifier que l'écran affiche l'invitation à recharger. Puis retirer la branche `stale_build`, vérifier que le test rougit, remettre.

- [ ] **Step 4 : Lancer lint, typage, suite, et committer**

```bash
git add front/src/ui/screens/gameover.ts front/src/app/game.ts front/src/i18n/locales
git commit -m "feat(front): publier son score depuis l'ecran de fin"
```

---

## Task 8 : Le classement au menu, et le pseudo dans les Réglages

**Files:**
- Modify: `front/src/ui/screens/menu.ts`, `front/src/ui/screens/settings.ts`, les deux fichiers de locales
- Test: `front/src/ui/screens/settings.test.ts` (créer si absent)

- [ ] **Step 1 : Ajouter l'entrée « Classement » au menu**

Elle ouvre le panneau de la tâche 6, alimenté par `fetchLeaderboard(readNickname())` — cent lignes, donc défilant. Afficher l'état de chargement, puis les données ou l'état d'erreur — jamais un panneau vide sans explication.

- [ ] **Step 2 : Ajouter le champ pseudo aux Réglages**

Avec, sous le champ, la phrase que la spec §8 impose : **les scores déjà publiés gardent l'ancien nom**. Sans comptes, rien ne les relie au joueur, donc rien ne peut les renommer. Le taire ferait découvrir la chose au pire moment.

- [ ] **Step 3 : Tester**

Que la saisie passe par `writeNickname` (donc normalisée), qu'un pseudo vide n'efface pas l'ancien sans le dire, et que la phrase d'avertissement est présente.

- [ ] **Step 4 : Lancer lint, typage, suite, et committer**

```bash
git add front/src/ui/screens/menu.ts front/src/ui/screens/settings.ts front/src/i18n/locales
git commit -m "feat(front): le classement au menu et le pseudo dans les reglages"
```

---

## Vérification finale du lot

- [ ] `cd back && npm run lint && npm run typecheck && npm test` — vert
- [ ] `cd front && npm run lint && npm run typecheck && npm test && npm run build` — vert
- [ ] `cd front && npm run test:browser:chromium && … firefox && … webkit` — vert dans les trois
- [ ] `git diff --exit-code sim/version.generated.ts` après `npm run version:sim` — aucun diff
- [ ] Les deux images Docker se construisent, et **le conteneur du back démarre et sert `/health`** — pas seulement le build
- [ ] Chaque falsification prescrite a été **vue en train de rougir**, sortie consignée
- [ ] **À la main, et c'est la seule vérification de bout en bout réelle** : lancer `npm run db:up`, `npm run dev` côté back, `npm run dev` côté front, jouer, mourir, publier, voir son rang ; recharger, ouvrir le classement au menu, y retrouver la ligne
