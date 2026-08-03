# Lot 1 du classement — service et déploiement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un service Fastify qui reçoit un replay, le rejoue, calcule le score lui-même et rend un rang — déployable en compose derrière Traefik.

**Architecture:** Trois routes, structure plate (`routes/`, `verify/`, `db/`). La vérification est **synchrone dans la requête** : 234 ms mesurés pour dix minutes de jeu, donc ni file, ni worker, ni état `PENDING`. Le serveur ne reçoit jamais de score : il le recalcule depuis le replay.

**Tech Stack:** Node 22, Fastify 5, zod 4 + `fastify-type-provider-zod`, Prisma + PostgreSQL 16, Vitest, `tsx` en développement, `esbuild` pour le build.

Spec : `docs/superpowers/specs/2026-08-03-leaderboard-service-design.md`. Ce plan couvre le **lot 1** (§12). Le lot 2 (front) aura son propre plan, écrit après la livraison de celui-ci.

**Ce que ce lot ne peut pas prouver.** La spec §10 appelle « le test qui compte » un replay *produit par le front*, envoyé à l'API, dont le score recalculé égale celui affiché par le jeu après arrondi. Ce lot ne peut pas l'écrire : il fabrique ses replays lui-même, avec le même `sim/` que le serveur. Il prouve donc que le service calcule de façon cohérente avec la simulation, **pas** que le chemin d'enregistrement du navigateur produit ce que le serveur attend. Cette preuve-là appartient au lot 2, et elle doit y figurer explicitement — sans elle, une erreur dans l'enregistreur ou dans la compression du navigateur ne serait rattrapée par rien.

## Global Constraints

- **Commentaires et messages de commit en français ; les identifiants restent en anglais.**
- Conventional Commits (husky + commitlint actifs). `merge:` est refusé.
- Biome 2.4.5, configuration racine, `semicolons: asNeeded`, guillemets simples, `lineWidth: 100`, accolades sur tous les `if`. Aucun `biome-ignore`.
- `T[]` et jamais `Array<T>`. `noUncheckedIndexedAccess` activé.
- **Ne jamais `git add -A`** — mettre en index uniquement les fichiers touchés, explicitement.
- **Ne jamais tuer de processus par motif** (`pkill -f …`) : d'autres sessions travaillent dans le même arbre.
- Ne pas pousser vers `origin`.
- Plafond de pas : **72 000**. Corps HTTP : **768 Ko**. Décompression : **1 Mo**. Pseudo : **1 à 20 caractères après élagage**.
- **Aucun `await` entre la réception d'une soumission et le retour de `replayRun`.** `resetGlobals()` remet à zéro l'état bitECS *global au processus* : deux rejeux entrelacés se corrompraient mutuellement, sans que rien ne le signale. La contrainte tient aujourd'hui par construction ; toute remontée de progression ou tout `yield` ajouté dans ce chemin la romprait.
- Le port Postgres de développement est **5434**. 5432 est pris par Gachapon et 5433 par MediSync, deux projets qui tournent en permanence sur cette machine — vérifié au moment d'exécuter ce plan, après qu'une première rédaction eut prescrit 5433 à tort. Un port déjà lié se manifeste par un échec de `docker compose up`, mais deux bases qui se le disputent donnent des erreurs d'authentification incompréhensibles.

---

## Structure des fichiers

```
back/
  package.json          scripts, dépendances
  tsconfig.json         strict, chemins @sim/*
  vitest.config.ts      tests unitaires et d'intégration
  prisma/
    schema.prisma       le modèle Run
    migrations/         générées
  src/
    env.ts              variables d'environnement validées par zod
    server.ts           buildServer() — construit l'app sans l'écouter (testable)
    main.ts             point d'entrée : écoute
    db/client.ts        client Prisma partagé
    verify/
      refusal.ts        le type Refusal et ses codes
      decode.ts         base64 → gunzip borné → decodeReplay
      verify.ts         orchestration : décodage, bornes, rejeu, règles
    ranking.ts          SQL du classement dédoublonné et du rang
    routes/
      health.ts         GET /health
      runs.ts           POST /runs
      leaderboard.ts    GET /leaderboard
deploy/
  Dockerfile.back       image du service
  compose.dev.yaml      Postgres local, port 5434
  compose.yaml          + services postgres et back (modifié)
```

Chaque fichier a une responsabilité : `verify/` ne connaît ni HTTP ni base, `ranking.ts` ne connaît que SQL, les routes n'ont aucune logique de vérification. C'est ce qui rend `verify/` testable sans Postgres et `ranking.ts` testable sans replay.

---

## Task 1 : Squelette du service et `GET /health`

**Files:**
- Create: `back/package.json`, `back/tsconfig.json`, `back/vitest.config.ts`, `back/src/env.ts`, `back/src/server.ts`, `back/src/main.ts`, `back/src/routes/health.ts`
- Test: `back/src/routes/health.test.ts`
- Delete: `back/.gitkeep`

**Interfaces:**
- Produces: `buildServer(): FastifyInstance` — construit l'app **sans écouter**, pour que les tests l'interrogent par `app.inject()` sans ouvrir de port. `env` : objet validé, `{ PORT: number, DATABASE_URL: string, CORS_ORIGIN: string }`.

- [ ] **Step 1 : Créer `back/package.json`**

```json
{
  "name": "inkpoint-back",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "esbuild src/main.ts --bundle --platform=node --format=esm --target=node22 --packages=external --tsconfig=tsconfig.json --outfile=dist/main.js",
    "start": "node dist/main.js",
    "test": "vitest run",
    "lint": "biome check src ../sim",
    "typecheck": "tsc --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@fastify/cors": "^11.0.1",
    "@prisma/client": "^6.16.2",
    "fastify": "^5.6.0",
    "fastify-type-provider-zod": "^5.0.1",
    "zod": "^4.1.11"
  },
  "devDependencies": {
    "@types/node": "^22.18.6",
    "esbuild": "^0.25.9",
    "prisma": "^6.16.2",
    "tsx": "^4.20.5",
    "typescript": "^5.9.3",
    "vitest": "^2.1.9"
  }
}
```

> **Pourquoi `esbuild` et pas `tsc` pour le build.** `back/` importe `sim/` par l'alias `@sim/*`. **`tsc` ne réécrit pas les alias à l'émission** : le JavaScript produit garderait `import … from '@sim/replay/run'`, que Node ne sait pas résoudre, et le conteneur planterait au démarrage sur `Cannot find module`. `esbuild --bundle` lit les `paths` du `tsconfig` et inline `sim/` dans le fichier de sortie ; `--packages=external` laisse `node_modules` dehors, donc l'image reste petite. `tsc --noEmit` continue de servir au typage.

- [ ] **Step 2 : Créer `back/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@sim/*": ["../sim/*"]
    }
  },
  "include": ["src", "../sim", "vitest.config.ts"]
}
```

- [ ] **Step 3 : Créer `back/vitest.config.ts`**

```ts
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Les tests d'intégration partagent une base : les faire tourner en
    // parallèle les ferait se marcher dessus sur la table `Run`.
    fileParallelism: false,
  },
})
```

- [ ] **Step 4 : Écrire le test qui échoue**

Créer `back/src/routes/health.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { buildServer } from '../server'

describe('GET /health', () => {
  it('répond 200 et un statut lisible', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})
```

- [ ] **Step 5 : Lancer le test pour le voir échouer**

Run: `cd back && npx vitest run src/routes/health.test.ts`
Expected: FAIL — `Failed to resolve import "../server"`.

- [ ] **Step 6 : Créer `back/src/env.ts`**

```ts
import { z } from 'zod'

/**
 * Les variables d'environnement, validées au démarrage plutôt qu'au premier
 * usage : un `DATABASE_URL` absent doit faire échouer le conteneur tout de
 * suite, pas à la première soumission d'un joueur.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  /** Origine autorisée par CORS — le front, et lui seul. */
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
})

export const env = schema.parse(process.env)
```

- [ ] **Step 7 : Créer `back/src/routes/health.ts`**

```ts
import type { FastifyInstance } from 'fastify'

/**
 * Sonde du healthcheck compose. Ne touche pas encore à la base : la tâche 2
 * la branchera, quand il y aura une base à interroger.
 */
export function registerHealth(app: FastifyInstance): void {
  app.get('/health', async () => ({ status: 'ok' }))
}
```

- [ ] **Step 8 : Créer `back/src/server.ts`**

```ts
import cors from '@fastify/cors'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import { env } from './env'
import { registerHealth } from './routes/health'

/**
 * Construit l'application **sans l'écouter**. C'est ce qui permet aux tests de
 * l'interroger par `app.inject()` sans ouvrir de port : plusieurs fichiers de
 * test peuvent alors construire leur propre instance sans se disputer 3000.
 * `main.ts` est le seul endroit qui appelle `listen`.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({
    // Le replay arrive en base64 dans du JSON : 432 Ko bruts font environ
    // 260 Ko compressés, donc 347 Ko en base64. 768 Ko laisse un facteur deux
    // sur ce qui transite réellement, et non sur la charge compressée.
    bodyLimit: 768 * 1024,
    logger: true,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.register(cors, { origin: env.CORS_ORIGIN })

  registerHealth(app)

  return app
}
```

- [ ] **Step 9 : Créer `back/src/main.ts`**

```ts
import { env } from './env'
import { buildServer } from './server'

const app = buildServer()

try {
  // `0.0.0.0` et non `localhost` : dans un conteneur, n'écouter que la boucle
  // locale rend le service injoignable depuis le réseau compose.
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
```

- [ ] **Step 10 : Installer et lancer le test**

Run: `npm install` (à la racine — le lockfile des workspaces y vit), puis `cd back && DATABASE_URL=postgresql://x npx vitest run src/routes/health.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 11 : Vérifier lint et typage**

Run: `cd back && npm run lint && npm run typecheck`
Expected: aucun diagnostic.

- [ ] **Step 12 : Supprimer le fichier témoin et committer**

```bash
git rm back/.gitkeep
git add back/package.json back/tsconfig.json back/vitest.config.ts back/src package-lock.json
git commit -m "feat(back): squelette Fastify et sonde de sante"
```

---

## Task 2 : Le modèle `Run`, Postgres local, et un `/health` qui interroge la base

**Files:**
- Create: `back/prisma/schema.prisma`, `back/src/db/client.ts`, `deploy/compose.dev.yaml`
- Modify: `back/src/routes/health.ts`, `back/src/routes/health.test.ts`, `back/package.json` (script `db:up`)
- Test: `back/src/db/client.test.ts`

**Interfaces:**
- Consumes: `buildServer()` (tâche 1).
- Produces: `prisma` — instance `PrismaClient` partagée, exportée par `back/src/db/client.ts`. Modèle `Run` avec les champs `id`, `nickname`, `seed`, `arenaId`, `simVersion`, `score`, `wave`, `steps`, `replay`, `replayHash`, `createdAt`.

- [ ] **Step 1 : Créer `deploy/compose.dev.yaml`**

```yaml
# Postgres de développement et de test, uniquement local — ce fichier n'est
# jamais déployé. Port 5434 : 5432 est pris par Gachapon et 5433 par MediSync
# sur cette machine. Deux bases qui se disputent un port se manifestent par des
# erreurs d'authentification déroutantes plutôt que par un conflit lisible.
name: inkpoint-dev

services:
  postgres:
    image: postgres:16-alpine
    container_name: inkpoint-postgres-dev
    environment:
      POSTGRES_USER: inkpoint
      POSTGRES_PASSWORD: inkpoint
      POSTGRES_DB: inkpoint
    ports:
      - '5434:5432'
    volumes:
      - inkpoint-pgdata-dev:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U inkpoint']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  inkpoint-pgdata-dev:
```

- [ ] **Step 2 : Ajouter le script de démarrage dans `back/package.json`**

Dans `scripts`, ajouter :

```json
    "db:up": "docker compose -f ../deploy/compose.dev.yaml up -d",
    "db:down": "docker compose -f ../deploy/compose.dev.yaml down"
```

- [ ] **Step 3 : Créer `back/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// Une partie soumise et vérifiée. Tous les champs de simulation sont lus dans
/// le replay par le serveur, jamais dans la requête : le client n'envoie que
/// son pseudo et ses octets.
model Run {
  id         String   @id @default(uuid())
  nickname   String
  seed       BigInt
  arenaId    Int
  simVersion String
  /// Flottant brut. L'affichage arrondit, comme l'écran de fin du jeu.
  score      Float
  wave       Int
  steps      Int
  /// Gardé pour le top 100 seulement, purgé au-delà (spec §7).
  replay     Bytes?
  /// SHA-256 des octets soumis : ferme la resoumission de la même partie.
  replayHash String   @unique
  createdAt  DateTime @default(now())

  /// Le classement lit toujours dans cet ordre : meilleur score d'abord, et à
  /// score égal le premier arrivé devant.
  @@index([score(sort: Desc), createdAt])
}
```

> `seed` est un `BigInt` parce qu'une graine est un `uint32` : le `Int` de Prisma est signé sur 32 bits, donc une graine au-delà de 2³¹ y deviendrait négative — silencieusement.

- [ ] **Step 4 : Créer `back/src/db/client.ts`**

```ts
import { PrismaClient } from '../generated/prisma/client'

/**
 * Une seule instance pour tout le processus. Prisma ouvre un pool de
 * connexions par client : en créer un par requête épuiserait Postgres bien
 * avant que le service ne soit chargé.
 */
export const prisma = new PrismaClient()
```

- [ ] **Step 5 : Écrire le test qui échoue**

Créer `back/src/db/client.test.ts` :

```ts
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
```

- [ ] **Step 6 : Lancer Postgres, générer, migrer**

```bash
cd back
npm run db:up
export DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint"
npm run prisma:generate
npm run prisma:migrate:dev -- --name run_initial
```

Expected: une migration créée sous `back/prisma/migrations/`, appliquée sans erreur.

- [ ] **Step 7 : Lancer le test**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npx vitest run src/db/client.test.ts`
Expected: PASS.

- [ ] **Step 8 : Brancher `/health` sur la base**

Remplacer le corps de `back/src/routes/health.ts` :

```ts
import type { FastifyInstance } from 'fastify'

import { prisma } from '../db/client'

/**
 * Sonde du healthcheck compose. Interroge réellement la base : un service qui
 * répond `ok` alors que Postgres est tombé ferait redémarrer le mauvais
 * conteneur, ou aucun.
 */
export function registerHealth(app: FastifyInstance): void {
  app.get('/health', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return { status: 'ok' }
    } catch {
      return reply.code(503).send({ status: 'degraded' })
    }
  })
}
```

- [ ] **Step 9 : Étendre le test de `/health`**

Ajouter dans `back/src/routes/health.test.ts`, à l'intérieur du `describe` :

```ts
  it('rend 503 quand la base ne répond pas', async () => {
    const app = buildServer()
    await app.ready()
    // Un mock, et il faut le dire : ce test prouve le câblage try/catch → 503,
    // pas qu'une vraie panne de Postgres emprunte ce chemin. Une coupure réelle
    // (connexion refusée, pool épuisé) pourrait présenter une autre forme
    // d'erreur, que seul un test d'intégration attraperait.
    const spy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('down'))
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'degraded' })
    spy.mockRestore()
    await app.close()
  })
```

Ajouter `vi` à l'import de `vitest` et importer `prisma` depuis `../db/client`.

- [ ] **Step 10 : Lancer les tests**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npm test`
Expected: PASS, 3 tests.

- [ ] **Step 11 : Committer**

```bash
git add back/prisma back/src/db back/src/routes/health.ts back/src/routes/health.test.ts back/package.json deploy/compose.dev.yaml package-lock.json
git commit -m "feat(back): le modele Run et une sonde qui interroge la base"
```

> Ne pas indexer `back/src/generated/` : le client Prisma est régénéré à l'installation. Ajouter `back/src/generated/` à `.gitignore` dans ce même commit.

---

## Task 3 : Le plafond de pas devient un argument obligatoire de `replayRun`

**Files:**
- Modify: `sim/replay/run.ts`, `sim/scripts/replay.ts`, `sim/replay/run.test.ts`, `sim/replay/run.mocked.test.ts`, `sim/replay/run.no-reset.test.ts` (si elles appellent `replayRun`)
- Test: `sim/replay/run.test.ts`

**Interfaces:**
- Produces: `replayRun(replay: Replay, options: { maxSteps: number }): ReplayResult`. **Le second argument est requis**, pas optionnel : la spec §5 l'exige, parce qu'un paramètre requis ne s'oublie pas alors qu'une valeur par défaut se contourne en silence.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `sim/replay/run.test.ts` :

```ts
  it('refuse un replay qui dépasse le plafond de pas, sans le rejouer', () => {
    const { replay } = recordScriptedRun(7, 600)
    expect(() => replayRun(replay, { maxSteps: 100 })).toThrow(/600 pas.*plafond.*100/i)
  })

  it('accepte un replay exactement au plafond', () => {
    const { replay, direct } = recordScriptedRun(7, 600)
    expect(replayRun(replay, { maxSteps: 600 }).score).toBe(direct.score)
  })
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `cd front && npx vitest run ../sim/replay/run.test.ts`
Expected: FAIL — `replayRun` n'accepte qu'un argument, et rien ne lève.

- [ ] **Step 3 : Modifier `sim/replay/run.ts`**

Changer la signature et insérer le contrôle **après** le calcul de `steps` et son contrôle d'intégrité, mais **avant** la boucle :

```ts
export interface ReplayOptions {
  /**
   * Nombre de pas au-delà duquel le replay est refusé.
   *
   * Requis, jamais optionnel avec une valeur par défaut : 4 octets d'entrée
   * achètent un pas complet de simulation, soit une amplification de l'ordre
   * du million. Un envoi de 100 Mo vaudrait 25 millions de pas, c'est-à-dire
   * des heures de calcul. Une valeur par défaut se contournerait en oubliant
   * l'argument ; un argument requis ne s'oublie pas.
   */
  maxSteps: number
}

export function replayRun(replay: Replay, options: ReplayOptions): ReplayResult {
```

Puis, juste après le contrôle `Number.isInteger(steps)` :

```ts
  // Refusé **avant** la boucle : le nombre de pas est dans l'en-tête, donc le
  // plafond se contrôle sans avoir dépensé une milliseconde de simulation.
  if (steps > options.maxSteps) {
    throw new Error(`replay de ${steps} pas au-delà du plafond de ${options.maxSteps} pas`)
  }
```

- [ ] **Step 4 : Mettre à jour les appelants**

Dans `sim/scripts/replay.ts`, remplacer `replayRun(replay)` par :

```ts
  // La CLI est un outil de développement, pas une porte ouverte sur le réseau :
  // le plafond y sert à ne pas faire tourner une machine indéfiniment sur un
  // fichier corrompu, pas à se défendre. Le service, lui, impose le sien.
  const result = replayRun(replay, { maxSteps: 72_000 })
```

Dans chaque test appelant `replayRun`, ajouter `{ maxSteps: 72_000 }` en second argument.

- [ ] **Step 5 : Lancer toute la suite**

Run: `cd front && npm run typecheck && npm test`
Expected: PASS. Le typage échouerait sur tout appelant oublié — c'est l'intérêt d'un argument requis.

- [ ] **Step 6 : Falsifier le garde-fou**

Retirer temporairement les trois lignes du contrôle `steps > options.maxSteps`, relancer `npx vitest run ../sim/replay/run.test.ts`, vérifier que le test « refuse un replay qui dépasse le plafond » **rougit**, puis les remettre.

Expected: rouge sans le contrôle, vert avec. Consigner les deux sorties dans le rapport.

- [ ] **Step 7 : Régénérer l'empreinte et committer**

```bash
cd front && npm run version:sim
cd .. && git add sim/replay/run.ts sim/scripts/replay.ts sim/replay/run.test.ts sim/version.generated.ts
git commit -m "feat(sim): le plafond de pas devient un argument requis de replayRun"
```

> `SIM_VERSION` change : `sim/replay/run.ts` est haché. C'est attendu.

---

## Task 4 : Le module de vérification, sans HTTP ni base

**Files:**
- Create: `back/src/verify/refusal.ts`, `back/src/verify/decode.ts`, `back/src/verify/verify.ts`
- Test: `back/src/verify/verify.test.ts`

**Interfaces:**
- Consumes: `replayRun(replay, { maxSteps })` (tâche 3), `decodeReplay` et `REPLAY_FORMAT_VERSION` de `@sim/replay/format`, `SIM_VERSION` de `@sim/version.generated`.
- Produces:
  - `type RefusalReason = 'stale_build' | 'too_long' | 'not_dead' | 'already_submitted' | 'malformed'`
  - `class Refusal extends Error { readonly reason: RefusalReason }`
  - `verifyReplay(base64: string): VerifiedRun` où `VerifiedRun = { seed: number; arenaId: number; simVersion: string; score: number; wave: number; steps: number; bytes: Buffer; hash: string }`. Lève `Refusal` sur tout refus.

- [ ] **Step 1 : Créer `back/src/verify/refusal.ts`**

```ts
/** Les raisons de refus exposées au client, une par cause distincte (spec §4). */
export type RefusalReason =
  | 'stale_build'
  | 'too_long'
  | 'not_dead'
  | 'already_submitted'
  | 'malformed'

/**
 * Un refus attendu, par opposition à une panne. Les routes le traduisent en
 * `422` ; tout ce qui n'est pas un `Refusal` reste un `500`, parce qu'une
 * panne du serveur ne doit jamais ressembler à une faute du joueur.
 */
export class Refusal extends Error {
  constructor(
    readonly reason: RefusalReason,
    message: string,
  ) {
    super(message)
    this.name = 'Refusal'
  }
}
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Créer `back/src/verify/verify.test.ts` :

```ts
import { gzipSync } from 'node:zlib'

import { encodeReplay, type Replay } from '@sim/replay/format'
import { SIM_VERSION } from '@sim/version.generated'
import { describe, expect, it } from 'vitest'

import { INPUT_FIELDS } from '@sim/input'

import { MAX_STEPS, verifyReplay } from './verify'

/** Un replay minimal et valide : zéro pas, zéro choix, arène de bureau. */
function emptyReplay(overrides: Partial<Replay> = {}): Replay {
  return {
    simVersion: SIM_VERSION,
    seed: 42,
    arenaId: 0,
    inputs: new Int16Array(0),
    choices: [],
    ...overrides,
  }
}

function toBase64(replay: Replay): string {
  return Buffer.from(gzipSync(encodeReplay(replay))).toString('base64')
}

describe('verifyReplay', () => {
  it('refuse un replay enregistré sous une autre version de simulation', () => {
    const payload = toBase64(emptyReplay({ simVersion: '0000000000000000' }))
    expect(() => verifyReplay(payload)).toThrow(
      expect.objectContaining({ reason: 'stale_build' }),
    )
  })

  it('refuse des octets qui ne sont pas un replay', () => {
    const payload = Buffer.from(gzipSync(Buffer.alloc(64))).toString('base64')
    expect(() => verifyReplay(payload)).toThrow(expect.objectContaining({ reason: 'malformed' }))
  })

  it('refuse du base64 invalide', () => {
    expect(() => verifyReplay('pas du base64 !!')).toThrow(
      expect.objectContaining({ reason: 'malformed' }),
    )
  })

  it('refuse une partie qui ne se termine pas par une mort', () => {
    // Zéro pas : le joueur est vivant à la fin, donc la partie n'est pas finie.
    expect(() => verifyReplay(toBase64(emptyReplay()))).toThrow(
      expect.objectContaining({ reason: 'not_dead' }),
    )
  })

  it('refuse une charge qui se détend au-delà de la borne', () => {
    // Amendement en cours d'exécution : la première rédaction bornait la
    // décompression sans jamais l'éprouver, et l'étape de falsification l'a
    // révélé — retirer `maxOutputLength` laissait la suite entièrement verte.
    // Le seul garde-fou destiné à une charge hostile était le seul sans test.
    //
    // L'assertion sur la taille compressée n'est pas décorative : sans elle, un
    // fixture devenu gros passerait le test en étant rejeté par la limite de
    // corps ou par sa taille brute, et non par la borne qu'on prétend éprouver.
    const bomb = gzipSync(Buffer.alloc(2 * 1024 * 1024))
    expect(bomb.length).toBeLessThan(64 * 1024)
    expect(() => verifyReplay(bomb.toString('base64'))).toThrow(
      expect.objectContaining({ reason: 'malformed' }),
    )
  })

  it('refuse un replay au-delà du plafond de pas', () => {
    // 72 001 pas × `INPUT_FIELDS.length` entrées : un de trop, sans avoir à
    // simuler quoi que ce soit puisque le contrôle lit l'en-tête.
    const tooLong = emptyReplay({
      inputs: new Int16Array((MAX_STEPS + 1) * INPUT_FIELDS.length),
    })
    expect(() => verifyReplay(toBase64(tooLong))).toThrow(
      expect.objectContaining({ reason: 'too_long' }),
    )
  })
})
```

- [ ] **Step 3 : Lancer pour voir échouer**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npx vitest run src/verify/verify.test.ts`
Expected: FAIL — `./verify` n'existe pas.

- [ ] **Step 4 : Créer `back/src/verify/decode.ts`**

```ts
import { gunzipSync } from 'node:zlib'

import { decodeReplay, type Replay } from '@sim/replay/format'

import { Refusal } from './refusal'

/**
 * Borne de décompression. Un replay au plafond fait 432 Ko bruts ; 1 Mo laisse
 * de la marge sans permettre l'amplification qui rend cette borne nécessaire —
 * 509 Ko de zéros se détendent en 500 Mo, et un serveur qui décompresse sans
 * borne se fait tomber avec un seul envoi.
 */
const MAX_INFLATED_BYTES = 1024 * 1024

/** Octets soumis (gzip) → `Replay`. Toute anomalie devient un `Refusal`. */
export function decodeSubmission(bytes: Buffer): Replay {
  let raw: Buffer
  try {
    raw = gunzipSync(bytes, { maxOutputLength: MAX_INFLATED_BYTES })
  } catch (error) {
    throw new Refusal('malformed', `décompression impossible : ${String(error)}`)
  }
  try {
    return decodeReplay(new Uint8Array(raw))
  } catch (error) {
    throw new Refusal('malformed', `replay illisible : ${String(error)}`)
  }
}
```

- [ ] **Step 5 : Créer `back/src/verify/verify.ts`**

```ts
import { createHash } from 'node:crypto'

import { INPUT_FIELDS } from '@sim/input'
import { replayRun } from '@sim/replay/run'
import { SIM_VERSION } from '@sim/version.generated'

import { decodeSubmission } from './decode'
import { Refusal } from './refusal'

/** Plafond de pas : 20 minutes à 60 Hz (spec §5). */
export const MAX_STEPS = 72_000

export interface VerifiedRun {
  seed: number
  arenaId: number
  simVersion: string
  score: number
  wave: number
  steps: number
  bytes: Buffer
  hash: string
}

/**
 * Décode, contrôle, rejoue, et rend ce que la base doit stocker.
 *
 * Ne connaît ni HTTP ni Postgres : c'est ce qui la rend testable sans base, et
 * ce qui garde les routes exemptes de logique de vérification. Le seul refus
 * qu'elle ne peut pas prononcer est `already_submitted`, qui demande la base —
 * elle fournit le `hash` pour que l'appelant le fasse.
 */
export function verifyReplay(base64: string): VerifiedRun {
  let bytes: Buffer
  try {
    bytes = Buffer.from(base64, 'base64')
    if (bytes.length === 0) {
      throw new Error('charge vide')
    }
  } catch (error) {
    throw new Refusal('malformed', `base64 illisible : ${String(error)}`)
  }

  const replay = decodeSubmission(bytes)

  // Avant tout rejeu : une version périmée est le cas le plus fréquent (§6),
  // et rejouer pour le découvrir ensuite serait dépenser 470 ms pour rien.
  if (replay.simVersion !== SIM_VERSION) {
    throw new Refusal(
      'stale_build',
      `replay en version ${replay.simVersion}, serveur en ${SIM_VERSION}`,
    )
  }

  // Le plafond se contrôle **ici**, structurellement, et non en cherchant un
  // mot dans le message d'erreur de `replayRun` : un tel filtre se romprait en
  // silence le jour où quelqu'un reformule le message, et le dépassement
  // deviendrait un `malformed` — un joueur honnête lirait « replay illisible »
  // au lieu de « partie trop longue ». Le garde-fou de `replayRun` reste en
  // place derrière, pour le serveur qui l'appellerait sans passer par ici.
  const steps = replay.inputs.length / INPUT_FIELDS.length
  if (steps > MAX_STEPS) {
    throw new Refusal('too_long', `partie de ${steps} pas, plafond ${MAX_STEPS}`)
  }

  let result: ReturnType<typeof replayRun>
  try {
    result = replayRun(replay, { maxSteps: MAX_STEPS })
  } catch (error) {
    throw new Refusal('malformed', String(error))
  }

  if (result.alive) {
    throw new Refusal(
      'not_dead',
      'la partie ne se termine pas par une mort : entrées tronquées',
    )
  }

  return {
    seed: replay.seed,
    arenaId: replay.arenaId,
    simVersion: replay.simVersion,
    score: result.score,
    wave: result.wave,
    steps: result.steps,
    bytes,
    hash: createHash('sha256').update(bytes).digest('hex'),
  }
}
```

- [ ] **Step 6 : Lancer les tests**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npx vitest run src/verify/verify.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7 : Falsifier chaque garde-fou**

Pour chacun des quatre contrôles (`stale_build`, `too_long`, `not_dead`, décompression bornée), le désactiver temporairement, relancer, vérifier qu'un test rougit, puis le remettre. Un test qu'on n'a jamais vu échouer n'est pas un garde-fou.

Consigner les quatre sorties dans le rapport. **Si l'un d'eux reste vert une fois son contrôle retiré, le dire plutôt que de le passer sous silence** : cela signifie que le test ne couvre pas ce qu'il prétend.

- [ ] **Step 8 : Committer**

```bash
git add back/src/verify
git commit -m "feat(back): verifier un replay soumis, sans HTTP ni base"
```

---

## Task 5 : `POST /runs`

**Files:**
- Create: `back/src/routes/runs.ts`, `back/src/ranking.ts`
- Modify: `back/src/server.ts`
- Test: `back/src/routes/runs.test.ts`

**Interfaces:**
- Consumes: `verifyReplay`, `Refusal`, `MAX_STEPS` (tâche 4), `prisma` (tâche 2).
- Produces: `rankOf(score: number, createdAt: Date): Promise<number>` et `totalRuns(): Promise<number>` dans `back/src/ranking.ts`.

- [ ] **Step 1 : Créer `back/src/ranking.ts`**

```ts
import { prisma } from './db/client'

/**
 * Le classement ne montre **qu'une ligne par pseudo**, la meilleure (spec §4).
 * Le rang se calcule donc sur cet ensemble dédoublonné et non sur toutes les
 * parties : les deux règles cohabitant naïvement, le top 10 afficherait des
 * rangs troués (1, 2, 5, 9…) puisque les parties masquées continueraient de
 * compter.
 *
 * `DISTINCT ON (nickname)` est propre à PostgreSQL et retient la première ligne
 * de chaque groupe selon l'`ORDER BY` — donc la meilleure partie du pseudo, et
 * à score égal la plus ancienne.
 */
const BEST_PER_NICKNAME = `
  SELECT DISTINCT ON (nickname) nickname, score, wave, "arenaId", "createdAt"
  FROM "Run"
  ORDER BY nickname, score DESC, "createdAt" ASC
`

export interface LeaderboardRow {
  rank: number
  nickname: string
  score: number
  wave: number
  arenaId: number
  createdAt: Date
}

/** Rang d'une partie parmi les meilleures de chaque pseudo. */
export async function rankOf(score: number, createdAt: Date): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ rank: bigint }[]>(
    `WITH best AS (${BEST_PER_NICKNAME})
     SELECT count(*) + 1 AS rank FROM best
     WHERE score > $1 OR (score = $1 AND "createdAt" < $2)`,
    score,
    createdAt,
  )
  return Number(rows[0]?.rank ?? 1)
}

/** Nombre de pseudos classés — le dénominateur affiché au joueur. */
export async function totalRuns(): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
    `WITH best AS (${BEST_PER_NICKNAME}) SELECT count(*) AS total FROM best`,
  )
  return Number(rows[0]?.total ?? 0)
}

/** Le top `limit`, une ligne par pseudo, rangs contigus. */
export async function topRuns(limit: number): Promise<LeaderboardRow[]> {
  const rows = await prisma.$queryRawUnsafe<Omit<LeaderboardRow, 'rank'>[]>(
    `WITH best AS (${BEST_PER_NICKNAME})
     SELECT nickname, score, wave, "arenaId", "createdAt"
     FROM best ORDER BY score DESC, "createdAt" ASC LIMIT $1`,
    limit,
  )
  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Créer `back/src/routes/runs.test.ts` :

```ts
import { gzipSync } from 'node:zlib'

import { encodeReplay, type Replay } from '@sim/replay/format'
import { SIM_VERSION } from '@sim/version.generated'
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '../db/client'
import { buildServer } from '../server'

function payloadFor(replay: Replay): string {
  return Buffer.from(gzipSync(encodeReplay(replay))).toString('base64')
}

const emptyReplay: Replay = {
  simVersion: SIM_VERSION,
  seed: 42,
  arenaId: 0,
  inputs: new Int16Array(0),
  choices: [],
}

describe('POST /runs', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('refuse un pseudo vide', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: '   ', replay: payloadFor(emptyReplay) },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('refuse un replay périmé avec la raison stale_build', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: {
        nickname: 'leo',
        replay: payloadFor({ ...emptyReplay, simVersion: '0000000000000000' }),
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().reason).toBe('stale_build')
    await app.close()
  })

  it('refuse une partie qui ne finit pas par une mort', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: 'leo', replay: payloadFor(emptyReplay) },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().reason).toBe('not_dead')
    // Rien ne doit être écrit quand la vérification échoue.
    expect(await prisma.run.count()).toBe(0)
    await app.close()
  })
})
```

> Le test d'acceptation (201 avec un rang) demande un replay dont la partie se termine par une mort. Il est écrit à la tâche 6, avec le fixture partagé, parce qu'il sert aussi au classement.

- [ ] **Step 3 : Lancer pour voir échouer**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npx vitest run src/routes/runs.test.ts`
Expected: FAIL — 404 sur `/runs`.

- [ ] **Step 4 : Créer `back/src/routes/runs.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { prisma } from '../db/client'
import { rankOf, totalRuns } from '../ranking'
import { Refusal } from '../verify/refusal'
import { verifyReplay } from '../verify/verify'

const bodySchema = z.object({
  nickname: z.string().trim().min(1).max(20),
  /** Le `.bin` du replay, gzippé puis encodé en base64. */
  replay: z.string().min(1),
})

export function registerRuns(app: FastifyInstance): void {
  app.post('/runs', { schema: { body: bodySchema } }, async (request, reply) => {
    const { nickname, replay } = request.body

    let verified: ReturnType<typeof verifyReplay>
    try {
      verified = verifyReplay(replay)
    } catch (error) {
      if (error instanceof Refusal) {
        return reply.code(422).send({ reason: error.reason, message: error.message })
      }
      throw error
    }

    const duplicate = await prisma.run.findUnique({ where: { replayHash: verified.hash } })
    if (duplicate !== null) {
      return reply
        .code(422)
        .send({ reason: 'already_submitted', message: 'cette partie a déjà été publiée' })
    }

    const run = await prisma.run.create({
      data: {
        nickname,
        seed: BigInt(verified.seed),
        arenaId: verified.arenaId,
        simVersion: verified.simVersion,
        score: verified.score,
        wave: verified.wave,
        steps: verified.steps,
        replay: verified.bytes,
        replayHash: verified.hash,
      },
    })

    return reply.code(201).send({
      // Arrondi, comme l'écran de fin du jeu : lui renvoyer le flottant brut
      // lui ferait croire à un désaccord avec le score qu'il vient de lire.
      score: Math.round(run.score),
      rank: await rankOf(run.score, run.createdAt),
      total: await totalRuns(),
    })
  })
}
```

- [ ] **Step 5 : Enregistrer la route dans `back/src/server.ts`**

Ajouter l'import `import { registerRuns } from './routes/runs'` et l'appel `registerRuns(app)` après `registerHealth(app)`.

- [ ] **Step 6 : Lancer les tests**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npm test`
Expected: PASS.

- [ ] **Step 7 : Committer**

```bash
git add back/src/ranking.ts back/src/routes/runs.ts back/src/routes/runs.test.ts back/src/server.ts
git commit -m "feat(back): la route de soumission d'une partie"
```

---

## Task 6 : `GET /leaderboard`, et le test bout en bout qui compte

**Files:**
- Create: `back/src/routes/leaderboard.ts`, `back/src/test/fixture-run.ts`
- Modify: `back/src/server.ts`
- Test: `back/src/routes/leaderboard.test.ts`, `back/src/routes/runs.test.ts`

**Interfaces:**
- Consumes: `topRuns(limit)` (tâche 5).
- Produces: `recordDeadRun(seed: number, arenaId: 0 | 1): Replay` dans `back/src/test/fixture-run.ts` — une run scriptée qui se termine réellement par une mort, réutilisée par les deux fichiers de test.

- [ ] **Step 1 : Créer le fixture partagé `back/src/test/fixture-run.ts`**

```ts
import { INPUT_FIELDS, QUANTUM } from '@sim/input'
import type { Replay } from '@sim/replay/format'
import { createRng } from '@sim/rng'
import { spawnPlayer } from '@sim/spawn'
import { stepWorld } from '@sim/step'
import { createRunStats } from '@sim/upgrades/stats'
import { SIM_VERSION } from '@sim/version.generated'
import { ARENA_BY_ID, createWorld } from '@sim/world'
import * as bitecs from 'bitecs'

const { resetGlobals } = bitecs as unknown as { resetGlobals: () => void }

/**
 * Une run scriptée jouée jusqu'à la mort du joueur, et arrêtée là.
 *
 * Jouer jusqu'à la mort n'est pas un détail : le service refuse tout replay où
 * le joueur est encore vivant (`not_dead`), donc un fixture qui s'arrête à un
 * nombre de pas fixe serait refusé et le test d'acceptation ne testerait rien.
 * Aucun `grantInvulnerability` ici, pour la même raison qu'à l'étape 2 : une
 * boucle d'enregistrement ne peut faire que ce qu'un replay peut reproduire.
 */
export function recordDeadRun(seed: number, arenaId: 0 | 1): Replay {
  resetGlobals()
  const arena = ARENA_BY_ID[arenaId]
  const world = createWorld({
    seed,
    width: arena.width,
    height: arena.height,
    rangeScale: arena.rangeScale,
  })
  spawnPlayer(world)
  const stats = createRunStats()
  const inputRng = createRng(seed * 7919 + 13)
  const collected: number[] = []

  for (let i = 0; i < 72_000 && world.alive; i++) {
    if (i % 20 === 0) {
      world.input.moveX = Math.round(inputRng.range(-1, 1) / QUANTUM) * QUANTUM
      world.input.moveY = Math.round(inputRng.range(-1, 1) / QUANTUM) * QUANTUM
    }
    for (const field of INPUT_FIELDS) {
      collected.push(Math.round(world.input[field] / QUANTUM))
    }
    stepWorld(world, stats)
  }

  return {
    simVersion: SIM_VERSION,
    seed,
    arenaId,
    inputs: Int16Array.from(collected),
    choices: [],
  }
}
```

- [ ] **Step 2 : Ajouter le test d'acceptation dans `back/src/routes/runs.test.ts`**

```ts
  it('accepte une partie jouée jusqu’à la mort et rend un rang', async () => {
    const app = buildServer()
    await app.ready()
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      payload: { nickname: 'leo', replay: payloadFor(recordDeadRun(1234, 0)) },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ score: expect.any(Number), rank: 1, total: 1 })
    expect(await prisma.run.count()).toBe(1)
    await app.close()
  })

  it('refuse la même partie soumise deux fois', async () => {
    const app = buildServer()
    await app.ready()
    const payload = { nickname: 'leo', replay: payloadFor(recordDeadRun(1234, 0)) }
    await app.inject({ method: 'POST', url: '/runs', payload })
    const second = await app.inject({ method: 'POST', url: '/runs', payload })
    expect(second.statusCode).toBe(422)
    expect(second.json().reason).toBe('already_submitted')
    expect(await prisma.run.count()).toBe(1)
    await app.close()
  })
```

Importer `recordDeadRun` depuis `../test/fixture-run`.

- [ ] **Step 3 : Écrire le test du classement**

Créer `back/src/routes/leaderboard.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '../db/client'
import { buildServer } from '../server'

async function seedRun(nickname: string, score: number, hash: string): Promise<void> {
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

describe('GET /leaderboard', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('ne montre qu’une ligne par pseudo, la meilleure', async () => {
    await seedRun('leo', 100, 'a')
    await seedRun('leo', 300, 'b')
    await seedRun('ana', 200, 'c')
    const app = buildServer()
    await app.ready()
    const rows = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    expect(rows.map((r: { nickname: string }) => r.nickname)).toEqual(['leo', 'ana'])
    expect(rows[0].score).toBe(300)
    await app.close()
  })

  it('donne des rangs contigus, sans trou laissé par les parties masquées', async () => {
    await seedRun('leo', 300, 'a')
    await seedRun('leo', 250, 'b')
    await seedRun('ana', 200, 'c')
    const app = buildServer()
    await app.ready()
    const rows = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    // Sans le dédoublonnage dans le calcul du rang, `ana` serait 3e.
    expect(rows.map((r: { rank: number }) => r.rank)).toEqual([1, 2])
    await app.close()
  })

  it('arrondit le score, comme l’écran de fin du jeu', async () => {
    await seedRun('leo', 19449.33333333197, 'a')
    const app = buildServer()
    await app.ready()
    const rows = (await app.inject({ method: 'GET', url: '/leaderboard' })).json()
    expect(rows[0].score).toBe(19449)
    await app.close()
  })
})
```

- [ ] **Step 4 : Lancer pour voir échouer**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npx vitest run src/routes/leaderboard.test.ts`
Expected: FAIL — 404.

- [ ] **Step 5 : Créer `back/src/routes/leaderboard.ts`**

```ts
import type { FastifyInstance } from 'fastify'

import { topRuns } from '../ranking'

/** Taille du classement rendu (spec §4). */
const TOP_SIZE = 10

export function registerLeaderboard(app: FastifyInstance): void {
  app.get('/leaderboard', async () => {
    const rows = await topRuns(TOP_SIZE)
    return rows.map((row) => ({
      rank: row.rank,
      nickname: row.nickname,
      // Arrondi ici et nulle part ailleurs : la base garde le flottant brut,
      // l'affichage arrondit — comme l'écran de fin du jeu.
      score: Math.round(row.score),
      wave: row.wave,
      arenaId: row.arenaId,
      createdAt: row.createdAt.toISOString(),
    }))
  })
}
```

- [ ] **Step 6 : Enregistrer la route et lancer toute la suite**

Ajouter l'import et `registerLeaderboard(app)` dans `back/src/server.ts`.

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npm test`
Expected: PASS.

- [ ] **Step 7 : Falsifier le dédoublonnage**

Remplacer temporairement `DISTINCT ON (nickname)` par un simple `SELECT` dans `BEST_PER_NICKNAME`, relancer, vérifier que **les deux premiers tests du classement rougissent**, puis remettre.

- [ ] **Step 8 : Committer**

```bash
git add back/src/routes/leaderboard.ts back/src/routes/leaderboard.test.ts back/src/test back/src/routes/runs.test.ts back/src/server.ts
git commit -m "feat(back): le classement dedoublonne par pseudo"
```

---

## Task 7 : Purge des replays hors du top 100

**Files:**
- Create: `back/src/purge.ts`
- Modify: `back/src/routes/runs.ts`
- Test: `back/src/purge.test.ts`

**Interfaces:**
- Produces: `purgeReplaysOutsideTop(limit: number): Promise<number>` — met `replay` à `null` pour les parties hors du top, et rend le nombre de lignes purgées.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `back/src/purge.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { prisma } from './db/client'
import { purgeReplaysOutsideTop } from './purge'

describe('purge des replays', () => {
  beforeEach(async () => {
    await prisma.run.deleteMany()
  })

  it('garde les octets du top et efface ceux du reste', async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.run.create({
        data: {
          nickname: `j${i}`,
          seed: 1n,
          arenaId: 0,
          simVersion: '0'.repeat(16),
          score: i * 100,
          wave: 1,
          steps: 10,
          replay: Buffer.from([1, 2, 3]),
          replayHash: `h${i}`,
        },
      })
    }

    const purged = await purgeReplaysOutsideTop(2)
    expect(purged).toBe(3)

    const kept = await prisma.run.findMany({ orderBy: { score: 'desc' } })
    expect(kept[0]?.replay).not.toBeNull()
    expect(kept[1]?.replay).not.toBeNull()
    expect(kept[2]?.replay).toBeNull()
    // La ligne reste : seul le verdict compte, et il est déjà calculé.
    expect(kept).toHaveLength(5)
  })
})
```

- [ ] **Step 2 : Lancer pour voir échouer**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npx vitest run src/purge.test.ts`
Expected: FAIL — `./purge` n'existe pas.

- [ ] **Step 3 : Créer `back/src/purge.ts`**

```ts
import { prisma } from './db/client'

/**
 * Efface les octets des replays hors du top, en gardant la ligne.
 *
 * Le verdict est calculé une fois et définitif : garder le replay au-delà du
 * top ne sert qu'à un ré-audit, lequel est de toute façon impossible dès que
 * `sim/` change. Jusqu'à 260 Ko par partie finiraient par compter sur un petit
 * serveur ; le top 100 conservé plafonne à environ 26 Mo.
 */
export async function purgeReplaysOutsideTop(limit: number): Promise<number> {
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "Run" SET replay = NULL
     WHERE replay IS NOT NULL
       AND id NOT IN (
         SELECT id FROM "Run" ORDER BY score DESC, "createdAt" ASC LIMIT $1
       )`,
    limit,
  )
  return result
}
```

- [ ] **Step 4 : Appeler la purge après chaque insertion**

Dans `back/src/routes/runs.ts`, juste avant le `return reply.code(201)` :

```ts
    // Après insertion, jamais avant : la partie qui vient d'arriver doit
    // pouvoir entrer dans le top et en chasser une autre.
    await purgeReplaysOutsideTop(KEPT_REPLAYS)
```

Ajouter en tête du fichier `import { purgeReplaysOutsideTop } from '../purge'` et la constante :

```ts
/** Nombre de replays dont on garde les octets (spec §7). */
const KEPT_REPLAYS = 100
```

- [ ] **Step 5 : Lancer toute la suite**

Run: `cd back && DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" npm test`
Expected: PASS.

- [ ] **Step 6 : Committer**

```bash
git add back/src/purge.ts back/src/purge.test.ts back/src/routes/runs.ts
git commit -m "feat(back): purger les replays hors du top 100"
```

---

## Task 8 : Déploiement

**Files:**
- Create: `deploy/Dockerfile.back`
- Modify: `deploy/compose.yaml`, `deploy/dokploy/docker-compose.dokploy.yml`, `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: tout ce qui précède.

- [ ] **Step 1 : Créer `deploy/Dockerfile.back`**

```dockerfile
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
# Le lockfile vit à la racine des workspaces, et c'est `<racine>/node_modules`
# qui rend `bitecs` résolvable depuis `sim/`.
COPY package.json package-lock.json ./
COPY front/package.json front/
COPY back/package.json back/
RUN npm ci
COPY sim/ sim/
COPY back/ back/
WORKDIR /app/back
RUN npm run prisma:generate && npm run build

FROM node:${NODE_VERSION}-alpine AS app
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY front/package.json front/
COPY back/package.json back/
RUN npm ci --omit=dev
# `esbuild` a inliné `sim/` dans ce fichier : il n'y a rien d'autre à copier.
COPY --from=build /app/back/dist/ back/dist/
COPY --from=build /app/back/prisma/ back/prisma/
COPY --from=build /app/back/src/generated/ back/src/generated/
WORKDIR /app/back
EXPOSE 3000
# Migrer puis servir : le conteneur ne doit pas répondre avant que le schéma
# soit à jour, sinon la première requête tombe sur une table absente.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

- [ ] **Step 2 : Ajouter les services dans `deploy/compose.yaml`**

```yaml
  postgres:
    image: postgres:16-alpine
    container_name: '${APP_IMAGE_NAME}-postgres'
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - inkpoint-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER}']
      interval: 10s
      timeout: 5s
      retries: 5
    # Volontairement hors du réseau `proxy` : la base n'a aucune raison d'être
    # joignable depuis Traefik.
    networks:
      - internal
    restart: unless-stopped

  back:
    build:
      context: ..
      dockerfile: deploy/Dockerfile.back
      args:
        NODE_VERSION: ${NODE_VERSION}
    image: '${CONTAINER_REGISTRY_PREFIX}${APP_IMAGE_NAME}-back:${VERSION:-latest}'
    container_name: '${APP_IMAGE_NAME}-back'
    environment:
      DATABASE_URL: 'postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}'
      CORS_ORIGIN: 'https://${TRAEFIK_FRONT_HOST}'
      PORT: 3000
    depends_on:
      postgres:
        condition: service_healthy
    labels:
      - 'traefik.enable=true'
      - 'traefik.docker.network=proxy'
      - 'traefik.http.routers.${APP_IMAGE_NAME}-back.rule=Host(`${TRAEFIK_API_HOST}`)'
      - 'traefik.http.routers.${APP_IMAGE_NAME}-back.entrypoints=https'
      - 'traefik.http.routers.${APP_IMAGE_NAME}-back.tls=true'
      - 'traefik.http.routers.${APP_IMAGE_NAME}-back.tls.certresolver=ovh'
      - 'traefik.http.services.${APP_IMAGE_NAME}-back.loadbalancer.server.port=3000'
    networks:
      - proxy
      - internal
    restart: unless-stopped

networks:
  internal:
    name: inkpoint-internal

volumes:
  inkpoint-pgdata:
```

Le bloc `networks:` existant en tête du fichier garde `proxy` ; ajouter `internal` à côté.

- [ ] **Step 3 : Renommer `TRAEFIK_HOST` en `TRAEFIK_FRONT_HOST`**

Dans le service `front`, remplacer `${TRAEFIK_HOST}` par `${TRAEFIK_FRONT_HOST}` et **supprimer le commentaire de six lignes** qui expliquait pourquoi le renommage attendait cette étape : il a rempli son office.

> Le renommage se fait **maintenant** et pas plus tôt parce que `deploy/.env` n'est pas versionné : renommer sans éditer le `.env` du serveur ferait résoudre la variable à vide, Traefik recevrait `Host()`, rejetterait le routeur, et le site rendrait 404 sans qu'aucun service n'ait l'air en échec. Cette étape est celle où le `.env` doit de toute façon être édité pour Postgres.

- [ ] **Step 4 : Documenter les variables dans le README**

Ajouter à la section de déploiement du `README.md` la liste des variables que `deploy/.env` doit désormais porter : `TRAEFIK_FRONT_HOST` (renommée depuis `TRAEFIK_HOST`), `TRAEFIK_API_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, en signalant explicitement que **ne pas renommer `TRAEFIK_HOST` sur le serveur produit un 404 silencieux**.

- [ ] **Step 5 : Étendre la CI**

Ajouter un job dans `.github/workflows/ci.yml` :

```yaml
  back:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: inkpoint
          POSTGRES_PASSWORD: inkpoint
          POSTGRES_DB: inkpoint
        ports:
          - 5434:5432
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://inkpoint:inkpoint@localhost:5434/inkpoint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: package-lock.json
      - run: npm ci
      - run: npm run prisma:generate
        working-directory: back
      - run: npm run prisma:migrate:deploy
        working-directory: back
      - run: npm run lint
        working-directory: back
      - run: npm run typecheck
        working-directory: back
      - run: npm test
        working-directory: back
```

Ajouter aussi, dans le job `docker` existant, la construction de l'image du back :

```yaml
      - run: docker build -f deploy/Dockerfile.back --target app -t inkpoint-back:ci .
```

- [ ] **Step 6 : Vérifier l'image en local**

```bash
docker build -f deploy/Dockerfile.back --target app -t inkpoint-back:essai .
```

Expected: build réussi.

Puis vérifier que le service **démarre réellement et sert `/health`**, ce que le build seul ne prouve pas :

```bash
docker run --rm --network host \
  -e DATABASE_URL="postgresql://inkpoint:inkpoint@localhost:5434/inkpoint" \
  -e CORS_ORIGIN="http://localhost:5173" \
  inkpoint-back:essai &
sleep 5 && curl -fsS http://localhost:3000/health
```

Expected: `{"status":"ok"}`. C'est ce pas qui attrape l'échec d'alias décrit à la tâche 1 : si `esbuild` n'avait pas inliné `sim/`, le conteneur planterait ici sur `Cannot find module '@sim/replay/run'` alors que le build serait passé.

Arrêter le conteneur en notant son identifiant (`docker ps`), **jamais par motif**.

- [ ] **Step 7 : Committer**

```bash
git add deploy/Dockerfile.back deploy/compose.yaml deploy/dokploy .github/workflows/ci.yml README.md
git commit -m "feat(deploy): le service de classement et sa base"
```

---

## Vérification finale du lot

- [ ] `cd back && npm run lint && npm run typecheck && npm test` — vert
- [ ] `cd front && npm run lint && npm run typecheck && npm test` — vert (la tâche 3 a touché `sim/`)
- [ ] `cd front && npm run test:browser:chromium && npm run test:browser:firefox && npm run test:browser:webkit` — vert
- [ ] `git diff --exit-code sim/version.generated.ts` après `npm run version:sim` — aucun diff
- [ ] `docker build -f deploy/Dockerfile --target app` et `docker build -f deploy/Dockerfile.back --target app` — les deux réussissent
- [ ] Le conteneur du back sert `/health` (tâche 8, pas 6)
- [ ] Chaque garde-fou des tâches 3, 4 et 6 a été **vu en train de refuser**, sortie consignée
