# Simulation portable — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la simulation d'InkPoint reproductible au bit près entre moteurs JavaScript, pour qu'un serveur Node puisse rejouer la partie d'un joueur et recalculer son score.

**Architecture:** Le dépôt passe à `front/` + `back/` + `sim/` (noyau partagé). La machine à états du hitstop, aujourd'hui dans `src/app/juice.ts` mais dont dépendent les vingt systèmes via `world.timeScale`, entre dans la simulation. Un module `sim/math.ts` remplace `Math.sin`, `cos`, `atan2`, `exp` et `hypot` par des implémentations n'utilisant que des opérations exactement spécifiées par IEEE-754. Un test de pureté interdit ensuite tout retour en arrière, et la CI rejoue une partie complète dans Chromium, Firefox et WebKit.

**Tech Stack:** TypeScript 5.7, Vite 6, Vitest 2, bitECS 0.3, Biome 2.4.5, Playwright + `@vitest/browser`.

Spec de référence : `docs/superpowers/specs/2026-08-02-sim-portable-design.md`.
Vue d'ensemble : `docs/superpowers/specs/2026-08-02-leaderboard-architecture-design.md`.

## Global Constraints

- **Français** pour tout commentaire, nom de test et message de commit. Le code (identifiants, API) reste en anglais, comme le reste du dépôt.
- **Conventional Commits**, imposé par commitlint. Types utilisés ici : `refactor`, `feat`, `test`, `build`, `ci`, `docs`.
- **Biome 2.4.5**, épinglé sans caret. `semicolons: asNeeded`, guillemets simples, `lineWidth: 100`, indentation par espaces.
- **`sim/` ne doit jamais importer `front/`, `back/`, Pixi, le DOM, `Math.random`, `Date.now`.** `purity.test.ts` le vérifie textuellement.
- **`noUncheckedIndexedAccess` est actif** : tout accès à un `Float32Array` de composant s'écrit `Position.x[eid]!`.
- **Ne jamais `git add -A`.** Plusieurs sessions peuvent partager ce worktree. Toujours lister les fichiers explicitement.
- **Ne jamais pousser vers `origin`** sans demande explicite.
- **L'empreinte de déterminisme ne bouge qu'une seule fois**, à la tâche 9. Si elle change aux tâches 2 ou 3, c'est un bug, pas un effet de bord.

## Structure des fichiers

| Fichier | Responsabilité |
| --- | --- |
| `sim/math.ts` | **Créé.** sin, cos, atan2, exp, hypot, wrapAngle, constantes. Seul fichier de `sim/` autorisé à approcher les transcendants. |
| `sim/math.test.ts` | **Créé.** Précision face à `Math.*`, cas limites, propriétés algébriques. |
| `sim/math.golden.test.ts` | **Créé.** Compare aux motifs binaires figés de `math.golden.json`. Tourne aussi dans les navigateurs. |
| `sim/math.golden.json` | **Créé.** Fixture de motifs binaires f64, générée puis committée. |
| `sim/scripts/gen-golden.ts` | **Créé.** Générateur de la fixture ci-dessus. |
| `sim/systems/hitstop.ts` | **Créé.** Compteurs de hitstop et écriture de `world.timeScale`. |
| `sim/systems/hitstop.test.ts` | **Créé.** Déclenchement, cadence, décroissance. |
| `sim/determinism.test.ts` | **Modifié.** Empreinte binaire exacte + constante figée. |
| `sim/purity.test.ts` | **Modifié.** Interdiction des transcendants. |
| `sim/world.ts` | **Modifié.** Deux champs de hitstop. |
| `sim/step.ts` | **Modifié.** `hitstopSystem` en tête, avant la purge des événements. |
| 13 fichiers de `sim/` | **Modifiés.** Bascule sur `sim/math.ts`. |
| `front/src/app/juice.ts` | **Modifié.** Perd le hitstop, ne garde que la présentation. |
| `front/src/app/game.ts` | **Modifié.** Perd l'affectation de `timeScale`. |
| `front/vitest.browser.config.ts` | **Créé.** Rejeu inter-moteurs. |
| `.github/workflows/ci.yml` | **Modifié.** Chemins, `master` → `main`, job `cross-engine`. |

---

### Task 1 : Empreinte de déterminisme exacte

Filet de sécurité posé **avant** tout déplacement. L'empreinte actuelle sérialise des `toFixed(3)`, ce qui absorbe précisément les divergences d'un ULP que la suite du chantier cherche à détecter. Et le fichier ne compare que deux runs du même processus, donc il ne peut pas repérer qu'un refactor a changé le comportement.

**Files:**
- Modify: `src/sim/determinism.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: la constante `EMPREINTE_REFERENCE` et le test « une run de référence produit une empreinte figée », que les tâches 2, 3 et 9 utilisent comme invariant.

- [ ] **Step 1 : Remplacer la fonction `fingerprint` par une sérialisation binaire exacte**

Dans `src/sim/determinism.test.ts`, remplacer la fonction `fingerprint` par :

```ts
/**
 * Empreinte binaire exacte de l'état du monde. Les valeurs ne sont pas
 * arrondies : `toFixed(3)` absorberait justement les divergences d'un ULP que
 * ce test existe pour détecter, maintenant qu'il sert aussi à prouver la
 * portabilité entre moteurs JavaScript.
 */
const scratch = new DataView(new ArrayBuffer(8))

/** Les composants sont des `Types.f32` : leur valeur tient exactement sur 32 bits. */
function f32bits(v: number): string {
  scratch.setFloat32(0, v)
  return scratch.getUint32(0).toString(16).padStart(8, '0')
}

/** Les scalaires de `SimWorld` (score, time) sont des doubles. */
function f64bits(v: number): string {
  scratch.setFloat64(0, v)
  return scratch.getBigUint64(0).toString(16).padStart(16, '0')
}

function fingerprint(world: SimWorld): string {
  const parts = Array.from(enemies(world))
    .map((eid) => `${eid}:${f32bits(Position.x[eid]!)}:${f32bits(Position.y[eid]!)}`)
    .sort()
  return [
    parts.join('|'),
    f64bits(world.score),
    f64bits(world.time),
    world.wave,
    world.combo,
    world.alive ? '1' : '0',
    f32bits(Position.x[world.playerEid]!),
    f32bits(Position.y[world.playerEid]!),
  ].join('#')
}
```

- [ ] **Step 2 : Ajouter le test à empreinte figée, avec une valeur volontairement fausse**

Ajouter en haut du fichier, sous les imports :

```ts
/**
 * Empreinte d'une run de référence. Ce n'est pas un test de comportement mais
 * un test de caractérisation : il n'affirme rien sur ce que la simulation
 * *devrait* produire, seulement qu'elle produit toujours la même chose. C'est
 * ce qui permet de prouver qu'un refactor n'a rien déplacé — et, une fois le
 * fichier rejoué dans un navigateur, que deux moteurs JavaScript s'accordent
 * au bit près.
 *
 * Elle ne change qu'avec une modification volontaire de la simulation.
 */
const EMPREINTE_REFERENCE = 'a-remplir'
```

et le test, à la fin du `describe` :

```ts
  it('produit une empreinte identique à la référence figée', () => {
    expect(runSimulation(1234, 3600)).toBe(EMPREINTE_REFERENCE)
  })
```

- [ ] **Step 3 : Lancer le test pour le voir échouer et récupérer la vraie valeur**

Run: `npx vitest run src/sim/determinism.test.ts -t 'référence figée'`
Expected: FAIL. Vitest affiche le diff, dont la valeur reçue.

- [ ] **Step 4 : Coller la valeur reçue dans `EMPREINTE_REFERENCE`**

Copier la chaîne « Received » du diff, sans guillemets ni troncature. Elle est longue (une centaine d'ennemis × 18 caractères) : vérifier qu'elle n'a pas été abrégée par un `...` de l'affichage. Si Vitest tronque, ajouter temporairement `console.log(runSimulation(1234, 3600))` dans le test, relancer, puis retirer le `console.log`.

- [ ] **Step 5 : Vérifier que toute la suite passe**

Run: `npm test`
Expected: PASS, y compris les trois anciens tests de `determinism.test.ts`.

- [ ] **Step 6 : Commit**

```bash
git add src/sim/determinism.test.ts
git commit -m "test(sim): une empreinte de déterminisme au bit près, et figée"
```

---

### Task 2 : Restructuration du dépôt

Déplacement mécanique, sans aucun changement de comportement. La preuve qu'il n'en a pas : l'empreinte de la tâche 1 doit rester intacte.

**Files:**
- Move: `src/sim/` → `sim/`
- Move: `src/` (le reste), `index.html`, `public/`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `package.json`, `package-lock.json` → `front/`
- Create: `back/.gitkeep`
- Modify: `biome.json`, `.dockerignore`, `deploy/Dockerfile`, `.github/workflows/ci.yml`
- Modify: tous les fichiers de `front/src/` important `@/sim/...`

**Interfaces:**
- Consumes: `EMPREINTE_REFERENCE` (tâche 1).
- Produces: l'alias `@sim` → `sim/`, disponible dans `front/vite.config.ts`, `front/vitest.config.ts` et `front/tsconfig.json`. Toutes les tâches suivantes importent la simulation par `@sim/...`.

- [ ] **Step 1 : Déplacer les fichiers avec `git mv`**

```bash
mkdir -p front back
git mv src/sim sim
git mv src front/src
git mv index.html public vite.config.ts tsconfig.json vitest.config.ts package.json package-lock.json front/
touch back/.gitkeep
git add back/.gitkeep
```

- [ ] **Step 2 : Réécrire `front/package.json`**

```json
{
  "name": "inkpoint-front",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src ../sim",
    "format": "biome check --write src ../sim",
    "typecheck": "tsc --noEmit",
    "prepare": "git config core.hooksPath .husky || true"
  },
  "dependencies": {
    "bitecs": "^0.3.40",
    "pixi.js": "^8.6.0"
  },
  "devDependencies": {
    "@biomejs/biome": "2.4.5",
    "@commitlint/cli": "^19.6.0",
    "@commitlint/config-conventional": "^19.6.0",
    "@tailwindcss/vite": "^4.0.0",
    "@types/node": "^22.10.0",
    "husky": "^9.1.7",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.2",
    "vite": "^6.0.0",
    "vitest": "^2.1.8"
  }
}
```

Le `prepare` passe de `husky` à `git config core.hooksPath .husky || true`, comme dans Gachapon : le hook reste à la racine du dépôt et non dans `front/`. La valeur de `core.hooksPath` est interprétée depuis la racine du dépôt, donc elle vaut `.husky` quel que soit le répertoire courant.

- [ ] **Step 3 : Ajouter l'alias `@sim` dans `front/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
    },
  },
  build: { target: 'es2022' },
})
```

- [ ] **Step 4 : Réécrire `front/vitest.config.ts`**

`test.root` remonte à la racine du dépôt : sans cela les motifs `include` ne peuvent pas désigner un dossier situé au-dessus de `front/`.

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['front/src/**/*.test.ts', 'sim/**/*.test.ts'],
  },
})
```

- [ ] **Step 5 : Étendre `front/tsconfig.json`**

Remplacer le bloc `paths` et `include` :

```json
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@sim/*": ["../sim/*"]
    }
  },
  "include": ["src", "../sim", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 6 : Réécrire les imports `@/sim/...` en `@sim/...`**

```bash
grep -rl "@/sim/" front/src | xargs sed -i '' 's#@/sim/#@sim/#g'
grep -rn "@/sim/" front/src sim || echo "aucun reste"
```

Vérifier aussi les imports relatifs qui traversaient l'ancienne frontière :

```bash
grep -rn "\.\./sim/\|\./sim/" front/src || echo "aucun reste"
```

- [ ] **Step 7 : Étendre `biome.json` aux trois dossiers**

Remplacer la ligne 14 :

```json
  "files": { "includes": ["front/src/**", "back/src/**", "sim/**"] },
```

Biome remonte l'arborescence pour trouver sa configuration, donc `npm run lint` depuis `front/` la trouve toujours à la racine. Un fichier partagé entre deux paquets ne peut pas dépendre de deux configurations concurrentes : c'est la raison de garder une configuration unique, là où Gachapon en a une par paquet.

- [ ] **Step 8 : Corriger `.dockerignore`**

Les motifs sans barre oblique ne s'appliquent qu'à la racine du contexte : `node_modules` ne couvre plus `front/node_modules`.

```
**/node_modules
**/dist
.git
.github
docs
.superpowers
.idea
deploy/.env
*.log
```

- [ ] **Step 9 : Réécrire `deploy/Dockerfile`**

Le contexte de build est déjà la racine du dépôt (`context: ..` dans `deploy/compose.yaml`), donc `sim/` y est visible. `sim/` est copié avant `front/` pour que la couche du noyau partagé ne soit pas invalidée par un changement du front.

```dockerfile
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app/front
COPY front/package*.json ./
RUN npm ci
WORKDIR /app
COPY sim ./sim
COPY front ./front
WORKDIR /app/front
RUN npm run build

FROM nginx:alpine AS app
COPY --from=builder /app/front/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 10 : Réécrire `.github/workflows/ci.yml`**

Le déclencheur passe de `master` à `main` : la branche s'appelle `main`, donc aucun push ne déclenchait le workflow aujourd'hui — seules les pull requests le faisaient.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: front
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: front/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

  docker:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v4
      - run: docker build -f deploy/Dockerfile --target app -t inkpoint:ci .
```

- [ ] **Step 11 : Réinstaller et vérifier que tout passe**

```bash
cd front && npm install && npm run lint && npm run typecheck && npm test && npm run build
```
Expected: les quatre commandes passent. En particulier `determinism.test.ts` doit être **vert sans modification de `EMPREINTE_REFERENCE`** — c'est la preuve que le déplacement n'a rien changé.

- [ ] **Step 12 : Vérifier l'image Docker**

Run: `docker build -f deploy/Dockerfile --target app -t inkpoint:restructure .` (depuis la racine du dépôt)
Expected: build réussi.

- [ ] **Step 13 : Mettre à jour le README**

Dans la section « Development », préfixer les commandes par `cd front`. Dans « Architecture », remplacer `src/sim/` par `sim/` et `src/render/`, `src/ui/` par `front/src/render/`, `front/src/ui/`, et ajouter une ligne expliquant que `sim/` est un dossier de sources partagé entre le front et le futur back, sans `package.json`.

- [ ] **Step 14 : Commit**

```bash
git add -u
git add front back sim biome.json
git status --short
git commit -m "refactor(repo): un front, un back et une sim partagée, comme Gachapon"
```

`git add -u` n'enregistre que les fichiers déjà suivis, y compris les suppressions dues aux `git mv`. Relire la sortie de `git status --short` avant de valider : aucun fichier étranger au chantier ne doit apparaître.

---

### Task 3 : Le hitstop entre dans la simulation

`world.timeScale` est écrit par `front/src/app/game.ts`, hors de la simulation, alors que les vingt systèmes de `stepWorld` en dépendent. Tant qu'il en va ainsi, un test inter-moteurs qui laisse `timeScale` à 1 ne prouve rien sur les vraies parties.

**Files:**
- Create: `sim/systems/hitstop.ts`, `sim/systems/hitstop.test.ts`
- Modify: `sim/world.ts`, `sim/step.ts`, `front/src/app/juice.ts`, `front/src/app/juice.test.ts`, `front/src/app/game.ts`

**Interfaces:**
- Consumes: `SimWorld`, `SimEvent` (`sim/world.ts`), `EMPREINTE_REFERENCE` (tâche 1).
- Produces: `hitstopSystem(world: SimWorld): void` exporté par `sim/systems/hitstop.ts` ; `HITSTOP_MS = 60` et `HITSTOP_CADENCE_MS = 200` exportés du même fichier ; les champs `hitstopRemaining: number` et `hitstopCooldownRemaining: number` sur `SimWorld`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `sim/systems/hitstop.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { createWorld, type SimWorld } from '../world'
import { HITSTOP_CADENCE_MS, HITSTOP_MS, hitstopSystem } from './hitstop'

function monde(): SimWorld {
  return createWorld({ seed: 1, width: 1280, height: 720 })
}

function kill(world: SimWorld): void {
  world.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
}

describe('hitstop', () => {
  it('laisse le temps couler quand rien ne meurt', () => {
    const world = monde()
    hitstopSystem(world)
    expect(world.timeScale).toBe(1)
  })

  it('gèle le temps au pas qui suit un kill', () => {
    const world = monde()
    kill(world)
    hitstopSystem(world)
    expect(world.timeScale).toBe(0)
    expect(world.hitstopRemaining).toBe(HITSTOP_MS)
  })

  it('dégèle une fois la durée écoulée', () => {
    const world = monde()
    kill(world)
    // Quatre pas de 16,67 ms dépassent les 60 ms de gel.
    for (let i = 0; i < 5; i++) {
      hitstopSystem(world)
      world.events.length = 0
    }
    expect(world.timeScale).toBe(1)
  })

  it('refuse un second gel tant que la cadence n’est pas écoulée', () => {
    const world = monde()
    kill(world)
    hitstopSystem(world)
    world.events.length = 0
    // On laisse le gel expirer, sans atteindre la cadence de 200 ms.
    for (let i = 0; i < 5; i++) {
      hitstopSystem(world)
    }
    expect(world.timeScale).toBe(1)
    kill(world)
    hitstopSystem(world)
    expect(world.timeScale).toBe(1)
    expect(world.hitstopCooldownRemaining).toBeGreaterThan(0)
  })

  it('regèle une fois la cadence écoulée', () => {
    const world = monde()
    kill(world)
    hitstopSystem(world)
    world.events.length = 0
    // 13 pas de 16,67 ms passent les 200 ms de cadence.
    for (let i = 0; i < 13; i++) {
      hitstopSystem(world)
    }
    kill(world)
    hitstopSystem(world)
    expect(world.timeScale).toBe(0)
  })

  it('décompte la cadence même pendant un gel', () => {
    const world = monde()
    kill(world)
    hitstopSystem(world)
    const avant = world.hitstopCooldownRemaining
    world.events.length = 0
    hitstopSystem(world)
    expect(world.hitstopCooldownRemaining).toBeLessThan(avant)
  })
})
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `cd front && npx vitest run ../sim/systems/hitstop.test.ts`
Expected: FAIL, « Failed to resolve import "./hitstop" ».

- [ ] **Step 3 : Ajouter les deux champs à `SimWorld`**

Dans `sim/world.ts`, à la suite de `timeScale: number` dans l'interface :

```ts
  timeScale: number
  /**
   * Gel d'image après un kill. Ces deux compteurs vivaient dans
   * `app/juice.ts` : ils en ont été rapatriés parce que les vingt systèmes de
   * `stepWorld` multiplient leur `dt` par `timeScale`, et qu'une simulation
   * dont le facteur de temps est produit ailleurs ne peut pas être rejouée
   * par un serveur.
   */
  hitstopRemaining: number
  hitstopCooldownRemaining: number
```

et dans `createWorld`, à la suite de `world.timeScale = 1` :

```ts
  world.hitstopRemaining = 0
  world.hitstopCooldownRemaining = 0
```

- [ ] **Step 4 : Écrire `sim/systems/hitstop.ts`**

```ts
import { FIXED_DT, type SimWorld } from '../world'

/** Durée du gel d'image sur un kill. */
export const HITSTOP_MS = 60

/**
 * Cadence minimale entre deux gels, mesurée depuis le déclenchement du
 * précédent. Sans elle une vague dense hacherait l'image en continu.
 */
export const HITSTOP_CADENCE_MS = 200

/**
 * Écrit `world.timeScale` pour ce pas, à partir des kills du pas précédent.
 *
 * Il doit tourner **avant** la purge de `world.events` en tête de `stepWorld`.
 * Ce décalage d'un pas n'est pas un défaut : c'est exactement le comportement
 * qu'avait `game.ts`, qui appelait `timeScaleFor(juice, FIXED_DT)` avant
 * `stepWorld` et lisait donc les événements déjà émis. Le déplacer après la
 * purge ferait gagner un pas au gel et déplacerait l'équilibrage.
 */
export function hitstopSystem(world: SimWorld): void {
  // Décompte indépendant de l'état du gel : mesuré en temps de pas et non en
  // temps simulé, sinon il ne s'écoulerait jamais tant qu'un gel est actif —
  // `timeScale` valant zéro, le temps simulé est à l'arrêt.
  if (world.hitstopCooldownRemaining > 0) {
    world.hitstopCooldownRemaining -= FIXED_DT
  }
  if (world.hitstopRemaining > 0) {
    world.hitstopRemaining -= FIXED_DT
  }

  let kills = 0
  for (const event of world.events) {
    if (event.type === 'enemyKilled') {
      kills++
    }
  }

  // Le plancher de cadence ne s'applique qu'au déclenchement, jamais à un kill
  // isolé : un kill pendant le refroidissement ne fait rien, il ne repousse pas
  // non plus l'échéance.
  if (kills > 0 && world.hitstopCooldownRemaining <= 0) {
    world.hitstopRemaining = HITSTOP_MS
    world.hitstopCooldownRemaining = HITSTOP_CADENCE_MS
  }

  world.timeScale = world.hitstopRemaining > 0 ? 0 : 1
}
```

- [ ] **Step 5 : Lancer le test pour le voir passer**

Run: `cd front && npx vitest run ../sim/systems/hitstop.test.ts`
Expected: PASS, six tests.

- [ ] **Step 6 : Brancher le système en tête de `stepWorld`**

Dans `sim/step.ts`, ajouter l'import et placer l'appel **avant** la purge des événements :

```ts
export function stepWorld(world: SimWorld, stats: RunStats): void {
  // Avant la purge : le gel de ce pas se décide sur les kills du pas
  // précédent. Voir le commentaire de `hitstopSystem`.
  hitstopSystem(world)
  world.events.length = 0
```

- [ ] **Step 7 : Retirer le hitstop de `front/src/app/juice.ts`**

- Supprimer les constantes `HITSTOP_MS` (ligne ~13) et `HITSTOP_CADENCE_MS` (ligne ~21).
- Supprimer les champs `hitstopRemaining` et `hitstopCooldownRemaining` de l'interface `JuiceState` (lignes ~309-311).
- Dans `createJuiceState`, retirer les deux champs de l'objet retourné (ligne ~315).
- Dans `resetJuiceState`, retirer les deux affectations (lignes ~324-325).
- Dans `applyJuice`, retirer le bloc `if (state.hitstopCooldownRemaining <= 0) { … }` (lignes ~443-446), en gardant le `if (fx.motionEnabled) { … }` qui suit.
- Supprimer entièrement la fonction `timeScaleFor` (lignes ~458-470).

Si `JuiceState` se retrouve avec un seul champ ou aucun, ne pas supprimer le type : les autres champs de juice restent. Vérifier avec `npm run typecheck`.

- [ ] **Step 8 : Retirer l'affectation dans `front/src/app/game.ts`**

Supprimer la ligne 330 `run.world.timeScale = timeScaleFor(juice, FIXED_DT)` et retirer `timeScaleFor` de l'import de la ligne 28.

- [ ] **Step 9 : Déplacer les tests de hitstop hors de `juice.test.ts`**

Dans `front/src/app/juice.test.ts` :
- Retirer `HITSTOP_MS` de l'import (ligne ~20).
- Le test « coupe la secousse et les particules sur un kill, mais laisse le hitstop se déclencher » (ligne ~48) perd son assertion `expect(state.hitstopRemaining).toBe(HITSTOP_MS)` et son titre devient « coupe la secousse et les particules sur un kill ».
- Supprimer le test « remet à zéro un hitstop en cours » (ligne ~234) et celui de la fuite qui le suit (ligne ~244) : leur objet est désormais couvert par `sim/systems/hitstop.test.ts` et par la remise à zéro dans `createWorld`.

- [ ] **Step 10 : Vérifier que la suite passe et que l'empreinte n'a pas bougé**

Run: `cd front && npm run lint && npm run typecheck && npm test`
Expected: PASS, et `EMPREINTE_REFERENCE` **inchangée**.

Si l'empreinte a changé, ne pas la régénérer. Diagnostiquer d'abord : la run scriptée de `determinism.test.ts` fait bouger le joueur au hasard sans lui donner de power-up, donc elle ne devrait produire aucun `enemyKilled` et le hitstop ne devrait jamais s'armer. Vérifier en ajoutant temporairement un compteur d'événements `enemyKilled` dans `runSimulation`. S'il vaut zéro et que l'empreinte a quand même bougé, c'est que le décalage d'un pas n'a pas été respecté — relire l'ordre dans `stepWorld`. S'il est non nul, l'empreinte a le droit de bouger : documenter le compte dans le message de commit avant de la régénérer.

- [ ] **Step 11 : Jouer une partie**

Run: `cd front && npm run dev`
Vérifier que le gel d'image sur un kill est toujours présent et de même durée qu'avant, et que la pause et la reprise se comportent normalement.

- [ ] **Step 12 : Commit**

```bash
git add sim/systems/hitstop.ts sim/systems/hitstop.test.ts sim/world.ts sim/step.ts \
        front/src/app/juice.ts front/src/app/juice.test.ts front/src/app/game.ts
git commit -m "refactor(sim): rapatrier le gel d'image, dont toute la simulation dépendait"
```

---

### Task 4 : `sim/math.ts` — constantes, `wrapAngle`, `hypot`

Les deux fonctions exactes d'abord. Elles n'ont besoin d'aucun polynôme et suppriment à elles seules 9 appels à `Math.hypot` et 3 appels transcendants dans `seeker.ts`.

**Files:**
- Create: `sim/math.ts`, `sim/math.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `PI`, `TAU`, `HALF_PI` (constantes `number`) ; `hypot(x: number, y: number): number` ; `wrapAngle(a: number): number`, qui ramène un angle dans (-π, π].

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `sim/math.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { createRng } from './rng'
import { hypot, PI, TAU, wrapAngle } from './math'

const rng = createRng(0x5eed)
const echantillon = (n: number, min: number, max: number): number[] =>
  Array.from({ length: n }, () => rng.range(min, max))

describe('hypot', () => {
  it('vaut exactement sqrt(x² + y²)', () => {
    for (const x of echantillon(200, -2000, 2000)) {
      const y = rng.range(-2000, 2000)
      expect(hypot(x, y)).toBe(Math.sqrt(x * x + y * y))
    }
  })

  it('reste à moins d’un ulp de Math.hypot à l’échelle de l’arène', () => {
    for (const x of echantillon(200, -2000, 2000)) {
      const y = rng.range(-2000, 2000)
      const attendu = Math.hypot(x, y)
      expect(Math.abs(hypot(x, y) - attendu)).toBeLessThanOrEqual(
        Number.EPSILON * Math.abs(attendu),
      )
    }
  })

  it('vaut zéro à l’origine', () => {
    expect(hypot(0, 0)).toBe(0)
  })
})

describe('wrapAngle', () => {
  it('laisse intact un angle déjà dans (-π, π]', () => {
    for (const a of echantillon(200, -3.14, 3.14)) {
      expect(wrapAngle(a)).toBe(a)
    }
  })

  it('ramène tout angle dans (-π, π]', () => {
    for (const a of echantillon(500, -1000, 1000)) {
      const w = wrapAngle(a)
      expect(w).toBeGreaterThan(-PI - 1e-9)
      expect(w).toBeLessThanOrEqual(PI + 1e-9)
    }
  })

  it('préserve le cosinus et le sinus de l’angle', () => {
    for (const a of echantillon(200, -1000, 1000)) {
      expect(Math.cos(wrapAngle(a))).toBeCloseTo(Math.cos(a), 9)
      expect(Math.sin(wrapAngle(a))).toBeCloseTo(Math.sin(a), 9)
    }
  })

  it('ramène un tour complet à zéro', () => {
    expect(wrapAngle(TAU)).toBeCloseTo(0, 12)
    expect(wrapAngle(-TAU)).toBeCloseTo(0, 12)
  })
})
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `cd front && npx vitest run ../sim/math.test.ts`
Expected: FAIL, « Failed to resolve import "./math" ».

- [ ] **Step 3 : Écrire `sim/math.ts`**

```ts
/**
 * Arithmétique portable de la simulation.
 *
 * La spec ECMAScript laisse à chaque moteur le choix de son approximation pour
 * `Math.sin`, `cos`, `atan2`, `exp` et `hypot` : deux navigateurs n'ont aucune
 * obligation de renvoyer le même bit de poids faible. Une simulation qui les
 * appelle n'est donc reproductible que sur la machine qui l'a produite — ce qui
 * interdit à un serveur de rejouer la partie d'un joueur pour en recalculer le
 * score, et interdirait aussi le netcode à rollback.
 *
 * Ce module les remplace par des implémentations qui n'utilisent que `+`, `-`,
 * `*`, `/`, `Math.sqrt`, `Math.floor`, `Math.round` et `Math.abs`. Toutes sont
 * exactement spécifiées par IEEE-754 en arrondi au plus proche pair, et la spec
 * JavaScript interdit la contraction en FMA. La portabilité vient donc de la
 * construction, pas de la chance : deux moteurs conformes ne *peuvent pas*
 * produire des résultats différents.
 *
 * `purity.test.ts` interdit d'appeler les transcendants ailleurs dans `sim/`.
 * Ce fichier est la seule exemption.
 */

/** Exact : la spec impose la valeur double la plus proche de π. */
export const PI = Math.PI
export const TAU = 2 * Math.PI
export const HALF_PI = Math.PI / 2

/**
 * `Math.hypot` protège contre l'over/underflow au prix d'une approximation
 * laissée au moteur. À l'échelle d'une arène de 1280 × 720 la protection n'a
 * aucun objet, et `sqrt` est exactement spécifié.
 */
export function hypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

/**
 * Repli d'un angle dans (-π, π], en arithmétique exacte.
 *
 * Sert à deux choses : remplacer l'idiome `atan2(sin(a), cos(a))`, et borner
 * `Facing.angle`, qui s'accumule sans repli et dériverait hors du domaine où la
 * réduction d'argument de `sin`/`cos` reste précise.
 */
export function wrapAngle(a: number): number {
  const w = a - TAU * Math.round(a / TAU)
  // `round` arrondit les demis vers +∞, donc l'intervalle obtenu est [-π, π).
  // On rabat la borne basse pour obtenir (-π, π], la convention d'`atan2`.
  return w <= -PI ? w + TAU : w
}
```

- [ ] **Step 4 : Lancer le test pour le voir passer**

Run: `cd front && npx vitest run ../sim/math.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add sim/math.ts sim/math.test.ts
git commit -m "feat(sim): hypot et repli d'angle, en arithmétique exacte"
```

---

### Task 5 : `sin` et `cos`

Réduction de Cody-Waite puis polynômes minimax de fdlibm. Le test de précision est l'autorité : il attrapera immédiatement un chiffre mal recopié dans une constante.

**Files:**
- Modify: `sim/math.ts`, `sim/math.test.ts`

**Interfaces:**
- Consumes: `PI`, `TAU`, `HALF_PI`, `wrapAngle` (tâche 4).
- Produces: `sin(x: number): number`, `cos(x: number): number`.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `sim/math.test.ts` (et compléter l'import : `import { cos, hypot, PI, sin, TAU, wrapAngle } from './math'`) :

```ts
/** Écart en ulp entre deux doubles voisins de `attendu`. */
function ulps(obtenu: number, attendu: number): number {
  if (obtenu === attendu) return 0
  const ulp = Math.max(Number.MIN_VALUE, Math.abs(attendu) * Number.EPSILON)
  return Math.abs(obtenu - attendu) / ulp
}

describe('sin et cos', () => {
  it('restent à moins de 2 ulp de Math.sin sur (-π, π]', () => {
    for (const x of echantillon(2000, -PI, PI)) {
      expect(ulps(sin(x), Math.sin(x))).toBeLessThan(2)
    }
  })

  it('restent à moins de 2 ulp de Math.cos sur (-π, π]', () => {
    for (const x of echantillon(2000, -PI, PI)) {
      expect(ulps(cos(x), Math.cos(x))).toBeLessThan(2)
    }
  })

  it('tiennent au-delà d’un tour, jusqu’à 1000 radians', () => {
    for (const x of echantillon(2000, -1000, 1000)) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(4e-16)
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(4e-16)
    }
  })

  it('donne les valeurs remarquables', () => {
    expect(sin(0)).toBe(0)
    expect(cos(0)).toBe(1)
    expect(sin(HALF_PI)).toBeCloseTo(1, 15)
    expect(cos(HALF_PI)).toBeCloseTo(0, 15)
    expect(sin(PI)).toBeCloseTo(0, 15)
    expect(cos(PI)).toBeCloseTo(-1, 15)
    expect(sin(TAU)).toBeCloseTo(0, 15)
    expect(cos(TAU)).toBeCloseTo(1, 15)
  })

  it('respecte l’identité fondamentale', () => {
    for (const x of echantillon(1000, -100, 100)) {
      expect(sin(x) * sin(x) + cos(x) * cos(x)).toBeCloseTo(1, 15)
    }
  })

  it('est impaire pour sin, paire pour cos', () => {
    for (const x of echantillon(500, -10, 10)) {
      expect(sin(-x)).toBe(-sin(x))
      expect(cos(-x)).toBe(cos(x))
    }
  })
})
```

Compléter aussi l'import de `HALF_PI` dans le fichier de test.

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `cd front && npx vitest run ../sim/math.test.ts`
Expected: FAIL, `sin is not a function`.

- [ ] **Step 3 : Implémenter la réduction et les noyaux dans `sim/math.ts`**

```ts
/**
 * π/2 scindé en une partie haute dont les 33 bits de poids faible sont nuls et
 * un reste. C'est ce qui rend la soustraction `x - n*PIO2_HI` exacte pour les
 * `n` que l'on rencontre, et donc la réduction d'argument fiable là où un
 * simple `x % (π/2)` perdrait la moitié des chiffres significatifs.
 * Valeurs de fdlibm (`__ieee754_rem_pio2`).
 */
const PIO2_HI = 1.5707963267341256
const PIO2_LO = 6.077100506506192e-11
const TWO_OVER_PI = 0.6366197723675814

/** Minimax de fdlibm pour sin sur [-π/4, π/4]. */
const S1 = -1.66666666666666324348e-1
const S2 = 8.33333333332248946124e-3
const S3 = -1.98412698298579493134e-4
const S4 = 2.75573137070700676789e-6
const S5 = -2.50507602534068634195e-8
const S6 = 1.58969099521155010221e-10

/** Minimax de fdlibm pour cos sur [-π/4, π/4]. */
const C1 = 4.16666666666666019037e-2
const C2 = -1.38888888888741095749e-3
const C3 = 2.48015872894767294178e-5
const C4 = -2.75573143513906633035e-7
const C5 = 2.08757232129817482790e-9
const C6 = -1.13596475577881948265e-11

function noyauSin(x: number): number {
  const z = x * x
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))
  return x + z * x * (S1 + z * r)
}

function noyauCos(x: number): number {
  const z = x * x
  const r = C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6))))
  return 1 - 0.5 * z + z * z * r
}

/**
 * Ramène `x` dans [-π/4, π/4] et renvoie le quadrant. Le reste `r` est calculé
 * en deux temps (`PIO2_HI` puis `PIO2_LO`) pour ne pas perdre de précision
 * quand `n` est grand.
 */
function reduire(x: number): { r: number; quadrant: number } {
  const n = Math.round(x * TWO_OVER_PI)
  const r = x - n * PIO2_HI - n * PIO2_LO
  return { r, quadrant: ((n % 4) + 4) % 4 }
}

export function sin(x: number): number {
  const { r, quadrant } = reduire(x)
  switch (quadrant) {
    case 0:
      return noyauSin(r)
    case 1:
      return noyauCos(r)
    case 2:
      return -noyauSin(r)
    default:
      return -noyauCos(r)
  }
}

export function cos(x: number): number {
  const { r, quadrant } = reduire(x)
  switch (quadrant) {
    case 0:
      return noyauCos(r)
    case 1:
      return -noyauSin(r)
    case 2:
      return -noyauCos(r)
    default:
      return noyauSin(r)
  }
}
```

- [ ] **Step 4 : Lancer le test pour le voir passer**

Run: `cd front && npx vitest run ../sim/math.test.ts`
Expected: PASS.

Si le test « valeurs remarquables » échoue sur `sin(0)` ou `cos(0)` en renvoyant `-0` au lieu de `0`, c'est un cas légitime : remplacer `toBe(0)` par `toBe(0)` reste correct puisque `Object.is(-0, 0)` est faux mais `-0 === 0` est vrai, et `toBe` utilise `Object.is`. Utiliser alors `expect(sin(0) === 0).toBe(true)`.

Si un test de précision échoue avec un écart de l'ordre de `1e-8` ou plus, c'est une constante mal recopiée : comparer chiffre à chiffre les blocs `S1..S6`, `C1..C6`, `PIO2_HI`, `PIO2_LO`, `TWO_OVER_PI` avec la source fdlibm avant de toucher à l'algorithme.

- [ ] **Step 5 : Commit**

```bash
git add sim/math.ts sim/math.test.ts
git commit -m "feat(sim): sin et cos portables, par réduction et minimax"
```

---

### Task 6 : `atan2`

**Files:**
- Modify: `sim/math.ts`, `sim/math.test.ts`

**Interfaces:**
- Consumes: `PI`, `HALF_PI` (tâche 4).
- Produces: `atan2(y: number, x: number): number`, de convention identique à `Math.atan2` : résultat dans (-π, π], signes de zéro compris.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `sim/math.test.ts` :

```ts
describe('atan2', () => {
  it('reste à moins de 2 ulp de Math.atan2', () => {
    for (const y of echantillon(2000, -2000, 2000)) {
      const x = rng.range(-2000, 2000)
      expect(ulps(atan2(y, x), Math.atan2(y, x))).toBeLessThan(2)
    }
  })

  it('tient sur les rapports extrêmes', () => {
    const cas: Array<[number, number]> = [
      [1, 1e-12],
      [1e-12, 1],
      [-1, 1e-12],
      [1e-12, -1],
      [1e8, 1],
      [1, 1e8],
    ]
    for (const [y, x] of cas) {
      expect(ulps(atan2(y, x), Math.atan2(y, x))).toBeLessThan(2)
    }
  })

  it('respecte les axes et les quadrants', () => {
    const cas: Array<[number, number]> = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
      [0, 0],
    ]
    for (const [y, x] of cas) {
      expect(atan2(y, x)).toBeCloseTo(Math.atan2(y, x), 15)
    }
  })

  it('inverse sin et cos', () => {
    for (const a of echantillon(500, -PI + 1e-6, PI)) {
      expect(atan2(sin(a), cos(a))).toBeCloseTo(a, 12)
    }
  })
})
```

Compléter l'import : ajouter `atan2`.

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `cd front && npx vitest run ../sim/math.test.ts`
Expected: FAIL, `atan2 is not a function`.

- [ ] **Step 3 : Implémenter dans `sim/math.ts`**

```ts
/**
 * Minimax de fdlibm pour atan sur [0, 0.4375]. La réduction ci-dessous garantit
 * que l'argument y tombe toujours : c'est la condition pour que ces onze
 * coefficients suffisent à tenir l'ulp.
 */
const T0 = 3.33333333333329318027e-1
const T1 = -1.99999999998764832476e-1
const T2 = 1.42857142725034663711e-1
const T3 = -1.11111104054623557880e-1
const T4 = 9.09088713343650656196e-2
const T5 = -7.69187620504482999495e-2
const T6 = 6.66107313738753120669e-2
const T7 = -5.83357013379057348645e-2
const T8 = 4.97687799461593236017e-2
const T9 = -3.65315727442169155270e-2
const T10 = 1.62858201153657823623e-2

/** `tan(π/8)`, exprimé exactement par `sqrt(2) - 1`. */
const TAN_PI_8 = Math.sqrt(2) - 1
const PI_4 = Math.PI / 4

/** atan sur [0, 1], par repli sur [0, tan(π/8)] puis polynôme impair. */
function atanUnite(t: number): number {
  if (t > TAN_PI_8) {
    // atan(t) = π/4 + atan((t-1)/(t+1)), et l'argument replié tient dans
    // [-(√2-1), 0] pour t dans [√2-1, 1].
    return PI_4 + atanPetit((t - 1) / (t + 1))
  }
  return atanPetit(t)
}

function atanPetit(t: number): number {
  const z = t * t
  const w = z * z
  const impair = z * (T0 + w * (T2 + w * (T4 + w * (T6 + w * (T8 + w * T10)))))
  const pair = w * (T1 + w * (T3 + w * (T5 + w * (T7 + w * T9))))
  return t - t * (impair + pair)
}

export function atan2(y: number, x: number): number {
  if (x === 0 && y === 0) {
    // Même convention que `Math.atan2` : le signe de x décide.
    return Object.is(x, -0) ? (Object.is(y, -0) ? -PI : PI) : y
  }
  const ay = Math.abs(y)
  const ax = Math.abs(x)
  // On ne divise jamais le grand par le petit : le rapport reste dans [0, 1],
  // domaine où `atanUnite` est précis.
  const angle = ay <= ax ? atanUnite(ay / ax) : HALF_PI - atanUnite(ax / ay)
  if (x < 0) {
    return y < 0 || Object.is(y, -0) ? -(PI - angle) : PI - angle
  }
  return y < 0 || Object.is(y, -0) ? -angle : angle
}
```

- [ ] **Step 4 : Lancer le test pour le voir passer**

Run: `cd front && npx vitest run ../sim/math.test.ts`
Expected: PASS.

En cas d'échec sur les quadrants uniquement, l'erreur est dans la logique de signes de `atan2` et non dans le polynôme : le test « reste à moins de 2 ulp » passera quand même sur la moitié des cas. Traiter les signes avant de suspecter les coefficients.

- [ ] **Step 5 : Commit**

```bash
git add sim/math.ts sim/math.test.ts
git commit -m "feat(sim): atan2 portable, par repli sur le premier octant"
```

---

### Task 7 : `exp`

Un seul appelant, `ramp` dans `sim/data/difficulty.ts`, avec un argument négatif de magnitude modeste. L'implémentation reste générale, mais le test se concentre sur ce domaine.

**Files:**
- Modify: `sim/math.ts`, `sim/math.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `exp(x: number): number`.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `sim/math.test.ts` :

```ts
describe('exp', () => {
  it('reste à moins de 2 ulp de Math.exp sur le domaine de la courbe de difficulté', () => {
    // `ramp(sec, tc)` appelle exp(-sec/tc) : une partie de trente minutes avec
    // la plus petite constante de temps donne environ -20.
    for (const x of echantillon(2000, -25, 0)) {
      expect(ulps(exp(x), Math.exp(x))).toBeLessThan(2)
    }
  })

  it('reste à moins de 2 ulp sur un domaine plus large', () => {
    for (const x of echantillon(2000, -100, 100)) {
      expect(ulps(exp(x), Math.exp(x))).toBeLessThan(2)
    }
  })

  it('donne les valeurs remarquables', () => {
    expect(exp(0)).toBe(1)
    expect(exp(1)).toBeCloseTo(Math.E, 15)
    expect(exp(-1)).toBeCloseTo(1 / Math.E, 15)
  })

  it('respecte exp(a+b) = exp(a)·exp(b)', () => {
    for (const a of echantillon(500, -10, 10)) {
      const b = rng.range(-10, 10)
      expect(exp(a + b)).toBeCloseTo(exp(a) * exp(b), 10)
    }
  })
})
```

Compléter l'import : ajouter `exp`.

- [ ] **Step 2 : Lancer le test pour le voir échouer**

Run: `cd front && npx vitest run ../sim/math.test.ts`
Expected: FAIL, `exp is not a function`.

- [ ] **Step 3 : Implémenter dans `sim/math.ts`**

```ts
/** ln 2 scindé, même principe que π/2 pour la réduction de sin. */
const LN2_HI = 6.93147180369123816490e-1
const LN2_LO = 1.90821492927058770002e-10
const INV_LN2 = 1.44269504088896338700

/** Minimax de fdlibm pour exp. */
const E1 = 1.66666666666666019037e-1
const E2 = -2.77777777770155933842e-3
const E3 = 6.61375632143793436117e-5
const E4 = -1.65339022054652515390e-6
const E5 = 4.13813679705723846039e-8

const bits = new DataView(new ArrayBuffer(8))

/**
 * 2^k, construit en écrivant directement l'exposant IEEE-754 plutôt qu'avec
 * `Math.pow` — qui est, lui aussi, laissé à l'appréciation du moteur.
 */
function puissanceDeDeux(k: number): number {
  if (k > 1023) return Number.POSITIVE_INFINITY
  if (k < -1022) return 0
  bits.setBigUint64(0, BigInt(k + 1023) << 52n)
  return bits.getFloat64(0)
}

export function exp(x: number): number {
  if (x !== x) return x
  if (x === Number.POSITIVE_INFINITY) return x
  if (x === Number.NEGATIVE_INFINITY) return 0

  const k = Math.round(x * INV_LN2)
  const hi = x - k * LN2_HI
  const lo = k * LN2_LO
  const r = hi - lo

  const t = r * r
  const c = r - t * (E1 + t * (E2 + t * (E3 + t * (E4 + t * E5))))
  const y = 1 - (lo - (r * c) / (2 - c) - hi)

  return y * puissanceDeDeux(k)
}
```

- [ ] **Step 4 : Lancer le test pour le voir passer**

Run: `cd front && npx vitest run ../sim/math.test.ts`
Expected: PASS.

Si le test du domaine large échoue aux extrémités (`x` proche de ±100) alors que celui du domaine de la difficulté passe, l'erreur est dans `puissanceDeDeux` (gestion des bornes d'exposant) et non dans le polynôme.

- [ ] **Step 5 : Commit**

```bash
git add sim/math.ts sim/math.test.ts
git commit -m "feat(sim): exp portable, pour la courbe de difficulté"
```

---

### Task 8 : Fixture de motifs binaires

`math.test.ts` compare à `Math.*` avec une tolérance : il vérifie que l'implémentation est *juste*, pas qu'elle est *identique partout*. La fixture de motifs binaires, elle, ne tolère rien — c'est elle qui, rejouée dans un navigateur à la tâche 11, prouve la portabilité.

**Files:**
- Create: `sim/scripts/gen-golden.ts`, `sim/math.golden.json`, `sim/math.golden.test.ts`
- Modify: `front/package.json`

**Interfaces:**
- Consumes: `sin`, `cos`, `atan2`, `exp`, `hypot`, `wrapAngle` (tâches 4 à 7).
- Produces: `sim/math.golden.json`, de forme `{ "sin": [[entrée, "motif hexa 16 caractères"], …], … }` pour les fonctions à un argument, et `{ "atan2": [[y, x, "motif"], …], "hypot": [[x, y, "motif"], …] }` pour celles à deux.

- [ ] **Step 1 : Ajouter `tsx` et le script de génération à `front/package.json`**

Dans `devDependencies`, ajouter `"tsx": "^4.19.0"`. Dans `scripts`, ajouter :

```json
    "golden": "tsx ../sim/scripts/gen-golden.ts",
```

Puis `cd front && npm install`.

- [ ] **Step 2 : Écrire le générateur**

Créer `sim/scripts/gen-golden.ts` :

```ts
/**
 * Génère `sim/math.golden.json`. À relancer uniquement quand `sim/math.ts`
 * change volontairement — la fixture est justement là pour que rien d'autre ne
 * la fasse bouger.
 *
 * Depuis `front/` : `npm run golden`
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { atan2, cos, exp, hypot, PI, sin, TAU, wrapAngle } from '../math'
import { createRng } from '../rng'

const vue = new DataView(new ArrayBuffer(8))
const motif = (v: number): string => {
  vue.setFloat64(0, v)
  return vue.getBigUint64(0).toString(16).padStart(16, '0')
}

const rng = createRng(0x90d)
const tirage = (n: number, min: number, max: number): number[] =>
  Array.from({ length: n }, () => rng.range(min, max))

/** Valeurs remarquables : axes, bornes de quadrant, très petits, très grands. */
const REMARQUABLES = [
  0, 1, -1, 0.5, -0.5,
  PI, -PI, PI / 2, -PI / 2, PI / 4, -PI / 4, PI / 6, TAU, -TAU,
  1e-8, -1e-8, 1e-300, 1000, -1000,
  Number.MIN_VALUE, Number.EPSILON,
]

const unaire = (f: (x: number) => number, entrees: number[]): Array<[number, string]> =>
  entrees.map((x) => [x, motif(f(x))])

const binaire = (
  f: (a: number, b: number) => number,
  entrees: Array<[number, number]>,
): Array<[number, number, string]> => entrees.map(([a, b]) => [a, b, motif(f(a, b))])

const anglesLarges = [...REMARQUABLES, ...tirage(400, -1000, 1000)]
const couples: Array<[number, number]> = Array.from({ length: 400 }, () => [
  rng.range(-2000, 2000),
  rng.range(-2000, 2000),
])
const couplesRemarquables: Array<[number, number]> = [
  [0, 0], [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 1], [1, -1], [-1, -1], [-1, 1],
  [1, 1e-12], [1e-12, 1], [1e8, 1], [1, 1e8],
]

const fixture = {
  _avertissement:
    'Généré par sim/scripts/gen-golden.ts. Ne pas éditer à la main. Toute modification ' +
    'de ce fichier signifie un changement volontaire de sim/math.ts.',
  sin: unaire(sin, anglesLarges),
  cos: unaire(cos, anglesLarges),
  exp: unaire(exp, [...REMARQUABLES, ...tirage(400, -100, 100)]),
  wrapAngle: unaire(wrapAngle, anglesLarges),
  atan2: binaire(atan2, [...couplesRemarquables, ...couples]),
  hypot: binaire(hypot, [...couplesRemarquables, ...couples]),
}

const chemin = fileURLToPath(new URL('../math.golden.json', import.meta.url))
writeFileSync(chemin, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(`écrit : ${chemin}`)
```

- [ ] **Step 3 : Écrire le test de la fixture**

Créer `sim/math.golden.test.ts`. Il importe le JSON plutôt que de le lire avec `node:fs`, pour pouvoir tourner aussi dans un navigateur à la tâche 11.

```ts
import { describe, expect, it } from 'vitest'

import golden from './math.golden.json'
import { atan2, cos, exp, hypot, sin, wrapAngle } from './math'

const vue = new DataView(new ArrayBuffer(8))
const motif = (v: number): string => {
  vue.setFloat64(0, v)
  return vue.getBigUint64(0).toString(16).padStart(16, '0')
}

const UNAIRES = {
  sin,
  cos,
  exp,
  wrapAngle,
} satisfies Record<string, (x: number) => number>

const BINAIRES = {
  atan2,
  hypot,
} satisfies Record<string, (a: number, b: number) => number>

/**
 * Aucune tolérance : c'est tout l'objet du fichier. `math.test.ts` vérifie que
 * l'implémentation est juste ; celui-ci vérifie qu'elle donne le *même* bit
 * partout. Rejoué dans Chromium, Firefox et WebKit par
 * `vitest.browser.config.ts`, il est la preuve que le serveur pourra rejouer la
 * partie d'un joueur quel que soit son navigateur.
 */
describe('motifs binaires figés', () => {
  for (const [nom, f] of Object.entries(UNAIRES)) {
    it(`${nom} reproduit la fixture au bit près`, () => {
      const cas = golden[nom as keyof typeof UNAIRES] as Array<[number, string]>
      expect(cas.length).toBeGreaterThan(400)
      for (const [x, attendu] of cas) {
        expect(motif(f(x)), `${nom}(${x})`).toBe(attendu)
      }
    })
  }

  for (const [nom, f] of Object.entries(BINAIRES)) {
    it(`${nom} reproduit la fixture au bit près`, () => {
      const cas = golden[nom as keyof typeof BINAIRES] as Array<[number, number, string]>
      expect(cas.length).toBeGreaterThan(400)
      for (const [a, b, attendu] of cas) {
        expect(motif(f(a, b)), `${nom}(${a}, ${b})`).toBe(attendu)
      }
    })
  }
})
```

- [ ] **Step 4 : Générer la fixture**

Run: `cd front && npm run golden`
Expected: `écrit : …/sim/math.golden.json`

- [ ] **Step 5 : Lancer le test**

Run: `cd front && npx vitest run ../sim/math.golden.test.ts`
Expected: PASS, six tests.

- [ ] **Step 6 : Vérifier que la fixture est bien un filet**

Modifier temporairement `sim/math.ts` — par exemple changer le dernier chiffre de `S6` — et relancer le test.
Expected: FAIL. Restaurer ensuite la constante et vérifier que le test repasse.

- [ ] **Step 7 : Commit**

```bash
git add sim/scripts/gen-golden.ts sim/math.golden.json sim/math.golden.test.ts front/package.json front/package-lock.json
git commit -m "test(sim): figer les motifs binaires de l'arithmétique portable"
```

---

### Task 9 : Migration des treize fichiers

Le seul commit du chantier où l'empreinte de déterminisme a le droit de bouger.

**Files:**
- Modify: `sim/systems/seeker.ts`, `waves.ts`, `death.ts`, `ricochet.ts`, `formation.ts`, `bramble.ts`, `player-movement.ts`, `dash-wake.ts`, `homing.ts`, `shard.ts`
- Modify: `sim/powerups/activate.ts`, `sim/data/formations.ts`, `sim/data/difficulty.ts`
- Modify: `sim/determinism.test.ts` (régénération de l'empreinte), et tous les tests figeant des positions

**Interfaces:**
- Consumes: `sin`, `cos`, `atan2`, `exp`, `hypot`, `wrapAngle`, `PI`, `TAU` (tâches 4 à 7).
- Produces: aucune nouvelle interface. `sim/` n'appelle plus aucun transcendant de `Math`.

- [ ] **Step 1 : Remplacer les neuf `Math.hypot`**

Dans `homing.ts` (2), `player-movement.ts` (3), `shard.ts` (2), `formation.ts` (1), `ricochet.ts` (1) : remplacer `Math.hypot(a, b)` par `hypot(a, b)` et ajouter l'import depuis `../math` (ou `./math` pour les fichiers de `sim/` racine).

`Math.hypot` et `sqrt(x² + y²)` ne donnent pas exactement le même résultat — le premier est plus précis. Le déplacement de valeur est assumé, c'est le prix de la portabilité.

- [ ] **Step 2 : Remplacer l'idiome de repli d'angle dans `seeker.ts`**

Ligne ~216, remplacer :

```ts
      const delta = Math.atan2(Math.sin(raw), Math.cos(raw))
```

par :

```ts
      const delta = wrapAngle(raw)
```

Trois appels transcendants disparaissent et le résultat devient exact au lieu d'approché. Adapter le commentaire au-dessus, qui explique le repli dans (-π, π] : il reste juste, mais peut renvoyer à `wrapAngle`.

- [ ] **Step 3 : Borner `Facing.angle` dans `seeker.ts`**

Ligne ~218, l'angle est accumulé sans repli et dériverait hors du domaine où la réduction de `sin`/`cos` reste précise. Remplacer :

```ts
      Facing.angle[eid] = Facing.angle[eid]! + Math.max(-maxTurn, Math.min(maxTurn, delta))
```

par :

```ts
      // Replié à chaque écriture : sans cela l'angle s'accumule sans borne, et
      // la réduction d'argument de `sin`/`cos` perd sa précision sur les grandes
      // valeurs. Les deux autres écritures de `Facing.angle`
      // (`player-movement.ts`, `dash-wake.ts`) passent par `atan2`, qui rend
      // déjà un angle dans (-π, π].
      Facing.angle[eid] = wrapAngle(
        Facing.angle[eid]! + Math.max(-maxTurn, Math.min(maxTurn, delta)),
      )
```

- [ ] **Step 4 : Basculer les appels restants fichier par fichier**

Pour chacun, ajouter l'import depuis `../math` (ou `../../math` selon la profondeur) et remplacer les occurrences. `Math.PI` devient `PI`.

| Fichier | Remplacements |
| --- | --- |
| `sim/systems/seeker.ts` | 3 `atan2`, 1 `sin`, 1 `cos` |
| `sim/systems/waves.ts` | 3 `sin`, 3 `cos` |
| `sim/data/formations.ts` | 2 `sin`, 2 `cos`, 1 `atan2`, et les `Math.PI` |
| `sim/systems/death.ts` | 2 `sin`, 2 `cos` |
| `sim/powerups/activate.ts` | 2 `sin`, 2 `cos` |
| `sim/systems/ricochet.ts` | 1 `sin`, 1 `cos`, 1 `atan2` |
| `sim/systems/formation.ts` | 1 `sin`, 1 `cos` |
| `sim/systems/bramble.ts` | 1 `sin`, 1 `cos` |
| `sim/systems/player-movement.ts` | 1 `atan2` |
| `sim/systems/dash-wake.ts` | 1 `atan2` |
| `sim/data/difficulty.ts` | 1 `exp` |

- [ ] **Step 5 : Vérifier qu'il ne reste aucun transcendant**

```bash
grep -rnE "Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|log|pow|hypot|cbrt)" sim --include="*.ts" \
  | grep -v "\.test\.ts" | grep -v "^sim/math.ts" | grep -v "^sim/scripts/"
```
Expected: aucune sortie.

- [ ] **Step 6 : Lancer la suite et recenser ce qui bouge**

Run: `cd front && npm test`
Expected: `determinism.test.ts` échoue sur l'empreinte figée — c'est attendu. D'autres tests figeant des positions ou des angles peuvent échouer.

Pour chacun, vérifier que l'écart est **numériquement minuscule** (dernières décimales) avant de mettre à jour la valeur attendue. Un écart visible à la troisième décimale n'est pas un déplacement d'ULP : c'est un bug de migration, typiquement un import oublié laissant un `Math.*` en place, ou une inversion d'arguments dans `atan2(y, x)`.

- [ ] **Step 7 : Régénérer l'empreinte de déterminisme**

Relancer `npx vitest run ../sim/determinism.test.ts -t 'référence figée'`, copier la valeur reçue dans `EMPREINTE_REFERENCE`, relancer pour confirmer.

- [ ] **Step 8 : Vérifier la suite entière**

Run: `cd front && npm run lint && npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 9 : Jouer une partie complète**

Run: `cd front && npm run dev`
Jouer jusqu'à la mort, au-delà de la deuxième vague. Vérifier en particulier : les plumes chercheuses tournent normalement, les formations en cercle sont rondes, les explosions sont centrées, la courbe de difficulté ne s'emballe pas. Aucun de ces déplacements ne devrait être perceptible ; s'il l'est, c'est un bug de migration.

- [ ] **Step 10 : Commit**

```bash
git add sim front/src
git status --short
git commit -m "refactor(sim): toute l'arithmétique passe par sim/math.ts

L'empreinte de déterminisme change : c'est attendu et c'est le seul
commit du chantier où elle en a le droit. hypot est désormais
sqrt(x²+y²), les transcendants viennent de polynômes maison, et
Facing.angle est replié à chaque écriture."
```

---

### Task 10 : Verrou dans le test de pureté

**Files:**
- Modify: `sim/purity.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: rien. Tâche de protection.

- [ ] **Step 1 : Ajouter le test qui échoue**

Dans `sim/purity.test.ts`, ajouter aux entrées de `FORBIDDEN`, avant la fermeture du tableau :

```ts
    {
      pattern:
        /Math\s*(\.\s*|\[\s*['"])(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|hypot|cbrt|sinh|cosh|tanh|expm1|log1p|fround)\b/,
      name: 'transcendant de Math',
      use: 'sim/math.ts',
    },
    {
      pattern: /\*\*/,
      name: "l'opérateur d'exponentiation",
      use: 'une multiplication, ou sim/math.ts — `**` est défini comme `Math.pow`, donc approximé par le moteur',
    },
```

Le scan est textuel et non syntaxique — c'est ce que documente déjà l'en-tête du fichier : Biome n'a pas d'équivalent de `no-restricted-properties`, et `Math['sin']` comme la déstructuration n'ont pas de nœud `Math.sin` à intercepter.

- [ ] **Step 2 : Exempter `sim/math.ts`**

`math.ts` appelle légitimement `Math.sqrt`, `Math.floor`, `Math.round` et `Math.abs`, qui ne sont pas dans la liste — mais son commentaire d'en-tête cite les noms interdits, et le scan est textuel. Modifier la fonction `sourceFiles` pour l'exclure :

```ts
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      // `scripts/` n'est pas embarqué dans la simulation : c'est de
      // l'outillage de développement.
      return entry.name === 'scripts' ? [] : sourceFiles(path)
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      return []
    }
    // Seule exemption : le module qui existe précisément pour que personne
    // d'autre n'ait à approcher les transcendants.
    if (entry.name === 'math.ts') {
      return []
    }
    return [path]
  })
}
```

- [ ] **Step 3 : Vérifier que le verrou attrape bien une régression**

Ajouter temporairement `const x = Math.sin(1)` dans `sim/systems/homing.ts`, lancer :

Run: `cd front && npx vitest run ../sim/purity.test.ts`
Expected: FAIL, « transcendant de Math interdit dans src/sim/ — utiliser sim/math.ts à la place », avec `sim/systems/homing.ts` dans la liste.

Retirer la ligne temporaire.

- [ ] **Step 4 : Vérifier que la suite passe**

Run: `cd front && npm test`
Expected: PASS.

Le message d'erreur des tests de pureté mentionne `src/sim/`, qui n'existe plus depuis la tâche 2. Corriger la chaîne en `sim/` dans le `expect` final et dans les titres `it.each`.

- [ ] **Step 5 : Commit**

```bash
git add sim/purity.test.ts
git commit -m "test(sim): interdire les transcendants de Math hors de math.ts"
```

---

### Task 11 : Rejeu inter-moteurs en CI

La preuve empirique. C'est la prémisse entière du leaderboard : si la portabilité casse en silence, le serveur rejettera des joueurs honnêtes sans que personne ne le voie.

**Files:**
- Create: `front/vitest.browser.config.ts`
- Modify: `front/package.json`, `.github/workflows/ci.yml`, `sim/determinism.test.ts`

**Interfaces:**
- Consumes: `sim/math.golden.test.ts` (tâche 8), `sim/determinism.test.ts` (tâches 1 et 9).
- Produces: le script `npm run test:browser` et le job CI `cross-engine`.

- [ ] **Step 1 : Faire produire des kills à la run de référence**

`runSimulation` fait bouger le joueur au hasard sans lui donner de power-up : elle ne tue rien, donc le `hitstopSystem` ajouté à la tâche 3 n'est jamais exercé et `timeScale` reste à 1. Le test inter-moteurs ne couvrirait pas ce chemin.

Dans `sim/determinism.test.ts`, ajouter une seconde run scriptée qui déclenche des kills. La signature réelle est `activatePowerUp(world, kind, stats, x, y)` et le genre offensif s'appelle `'blast'` (`sim/data/powerups.ts`).

Ajouter les imports :

```ts
import { Player, Position } from './components'
import { activatePowerUp } from './powerups/activate'
```

`Position` est déjà importé ; ajouter seulement `activatePowerUp`.

```ts
/**
 * Seconde run de référence : celle-ci tue. Sans kills, le `hitstopSystem` ne
 * s'arme jamais et `timeScale` reste à 1 — le test ne couvrirait pas le chemin
 * gelé, qui est pourtant celui où toute la simulation change de pas de temps.
 */
function runAvecKills(seed: number, steps: number): { empreinte: string; kills: number } {
  resetGlobals()
  const world = createWorld({ seed, width: ARENA.width, height: ARENA.height })
  spawnPlayer(world)
  const stats = createRunStats()
  const inputRng = createRng(seed * 104729 + 7)
  let kills = 0

  for (let i = 0; i < steps; i++) {
    if (i % 20 === 0) {
      world.input.moveX = inputRng.range(-1, 1)
      world.input.moveY = inputRng.range(-1, 1)
    }
    // Une déflagration toutes les deux secondes, sur le joueur, pour garantir
    // des morts — et donc des gels d'image.
    if (i % 120 === 0) {
      const player = world.playerEid
      activatePowerUp(world, 'blast', stats, Position.x[player]!, Position.y[player]!)
    }
    stepWorld(world, stats)
    for (const event of world.events) {
      if (event.type === 'enemyKilled') {
        kills++
      }
    }
  }

  return { empreinte: fingerprint(world), kills }
}
```

Importer aussi `ARENA` depuis `./world`. Ajouter les tests :

```ts
  it('tue réellement, sinon le gel d’image ne serait jamais exercé', () => {
    expect(runAvecKills(4242, 3600).kills).toBeGreaterThan(0)
  })

  it('produit une empreinte figée sur une run avec des kills et des gels', () => {
    expect(runAvecKills(4242, 3600).empreinte).toBe(EMPREINTE_AVEC_KILLS)
  })
```

et la constante `EMPREINTE_AVEC_KILLS`, remplie selon la même procédure que la tâche 1 : valeur `'a-remplir'`, lancer, copier la valeur reçue.

Si le premier test échoue avec `kills === 0`, la déflagration ne touche rien : augmenter la cadence (`i % 60`) ou lancer la run plus longtemps, jusqu'à obtenir des morts. Ne pas figer l'empreinte tant que ce test n'est pas vert — une empreinte sans kill ne prouverait rien sur le chemin gelé.

- [ ] **Step 2 : Vérifier en Node**

Run: `cd front && npx vitest run ../sim/determinism.test.ts`
Expected: PASS, cinq tests.

- [ ] **Step 3 : Installer Playwright et le pilote navigateur de Vitest**

```bash
cd front && npm install -D @vitest/browser@^2.1.8 playwright@^1.49.0
npx playwright install chromium firefox webkit
```

- [ ] **Step 4 : Écrire `front/vitest.browser.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/**
 * Rejoue la simulation dans trois moteurs JavaScript distincts.
 *
 * `math.test.ts` vérifie que l'arithmétique est juste, à une tolérance près.
 * Ces deux fichiers-ci vérifient qu'elle est *identique partout*, au bit près :
 * c'est la condition pour qu'un serveur Node puisse rejouer la partie d'un
 * joueur et recalculer son score sans rejeter un innocent.
 *
 * Volontairement limité à deux fichiers : la suite complète n'a rien à faire
 * dans trois navigateurs, et ce job doit rester court.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['sim/math.golden.test.ts', 'sim/determinism.test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
    },
  },
})
```

- [ ] **Step 5 : Ajouter le script à `front/package.json`**

```json
    "test:browser": "vitest run --config vitest.browser.config.ts",
```

- [ ] **Step 6 : Lancer le rejeu inter-moteurs en local**

Run: `cd front && npm run test:browser`
Expected: PASS dans les trois moteurs.

**Si un moteur échoue**, c'est le résultat le plus important du chantier, pas un incident de configuration. Diagnostiquer avant de contourner :
- Un échec sur `math.golden.test.ts` désigne la fonction et l'entrée exactes dans le message : une opération non exacte a survécu dans `sim/math.ts`.
- Un échec sur `determinism.test.ts` seul, avec `math.golden.test.ts` vert, signifie qu'un transcendant subsiste ailleurs dans `sim/` — relancer le `grep` de la tâche 9, étape 5.

- [ ] **Step 7 : Ajouter le job CI**

Dans `.github/workflows/ci.yml`, après le job `check` :

```yaml
  cross-engine:
    runs-on: ubuntu-latest
    needs: check
    defaults:
      run:
        working-directory: front
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: front/package-lock.json
      - run: npm ci
      - run: npx playwright install --with-deps chromium firefox webkit
      # Prouve que la simulation rejoue au bit près sur trois moteurs. Sans
      # cette garantie, le serveur de scores rejetterait des parties honnêtes.
      - run: npm run test:browser
```

- [ ] **Step 8 : Documenter dans le README**

Dans la section « Development », ajouter une ligne :

```
npm run test:browser  # rejoue la simulation dans Chromium, Firefox et WebKit
```

Et dans « Architecture », après le paragraphe sur `sim/`, préciser que le déterminisme est désormais garanti *entre moteurs* et non seulement sur une machine, que `sim/math.ts` en est la clé, et que `purity.test.ts` interdit d'appeler les transcendants ailleurs.

- [ ] **Step 9 : Vérification finale**

```bash
cd front && npm run lint && npm run typecheck && npm test && npm run test:browser && npm run build
cd .. && docker build -f deploy/Dockerfile --target app -t inkpoint:final .
```
Expected: tout passe.

- [ ] **Step 10 : Commit**

```bash
git add front/vitest.browser.config.ts front/package.json front/package-lock.json \
        .github/workflows/ci.yml sim/determinism.test.ts README.md
git commit -m "ci(sim): prouver le rejeu au bit près dans Chromium, Firefox et WebKit"
```

---

## Notes pour l'exécutant

**L'empreinte de déterminisme est l'invariant central de ce plan.** Elle est posée à la tâche 1, doit rester intacte aux tâches 2 et 3, ne bouge qu'à la tâche 9, et devient une garantie inter-moteurs à la tâche 11. Si elle bouge ailleurs, arrêter et diagnostiquer plutôt que régénérer.

**Les constantes minimax sont recopiées de fdlibm.** Un chiffre faux ne casse pas la compilation, il dégrade silencieusement la précision. Les tests de précision des tâches 5, 6 et 7 sont là pour cela : ne jamais assouplir leur tolérance pour faire passer un test, remonter à la constante.

**Les écarts « minuscules » à la tâche 9 doivent rester minuscules.** Un écart visible à la troisième décimale n'est pas un déplacement d'ULP mais un bug — le plus souvent une inversion d'arguments dans `atan2(y, x)` ou un import oublié.
