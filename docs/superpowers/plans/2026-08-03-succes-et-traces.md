# Succès et tracés — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 24 succès débloquables en jouant, dont six ouvrent une silhouette alternative pour la pointe du joueur, avec vitrines au menu, bandeau en jeu et récapitulatif de fin de partie.

**Architecture:** Toute la logique vit dans `src/app/achievements/` — une `RunTrace` agrégée à chaque pas depuis les `SimEvent`, et 24 prédicats purs qui la lisent. `src/sim/` n'est touché que pour exporter une requête existante. Les silhouettes sont des polygones définis une seule fois et consommés par Pixi (en jeu) et par SVG (dans les vitrines).

**Tech Stack:** TypeScript strict, bitECS, PixiJS v8, Tailwind, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-03-succes-et-traces-design.md`

## Global Constraints

- **Aucune modification de comportement dans `src/sim/`.** La seule édition permise y est l'ajout du mot-clé `export` devant `activeEnemies` dans `src/sim/systems/collision.ts` (tâche 5). `determinism.test.ts` doit rendre la même empreinte à la fin qu'au début.
- **`src/sim/purity.test.ts`** interdit `Math.random`, l'horloge réelle et le DOM dans `src/sim/`. `src/app/` et `src/render/` n'ont pas cette contrainte.
- **`noUncheckedIndexedAccess` est actif.** L'accès à un tableau bitECS est typé `T | undefined`. L'assertion non-nulle `!` est **réservée à `src/sim/`** ; ailleurs on écrit `?? 0` (voir `playerMotion()` dans `src/app/game.ts:120`).
- **Commits conventionnels** — husky + commitlint les vérifient. Préfixes utilisés ici : `feat(achievements)`, `feat(render)`, `refactor(ui)`, `docs(specs)`.
- **Sessions parallèles sur le même worktree :** ne jamais faire `git add -A` ni `git add .`. Chaque commit liste ses fichiers explicitement, comme dans les étapes ci-dessous.
- **Les commentaires de code sont en français**, et expliquent *pourquoi*, pas *quoi* — c'est la convention de tout le dépôt.
- **Tailwind :** les tailles suivent la rampe `--ui` (`calc(var(--ui)*N)`), jamais des pixels en dur. Les classes utilitaires `ui-2xs`, `ui-xs`, `ui-sm`, `ui-lg`, `ui-2xl` existent déjà dans `src/styles/main.css`.
- **Commandes :** `npm test` (suite complète), `npx vitest run <fichier>` (ciblé), `npm run lint`, `npm run typecheck`.

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
| --- | --- |
| `src/render/views/nibs.ts` | Les sept silhouettes, en polygones. Source unique. |
| `src/app/achievements/trace.ts` | `RunTrace` et son avancement pas à pas. Aucune requête bitECS. |
| `src/app/achievements/proximity.ts` | Distance au plus proche ennemi menaçant. Seul fichier du dossier à faire une requête bitECS. |
| `src/app/achievements/catalog.ts` | Les 24 définitions et leurs seuils. |
| `src/app/achievements/store.ts` | Lecture/écriture `localStorage`, filtrage défensif. |
| `src/app/achievements/tracker.ts` | Orchestration : avance la trace, évalue, persiste. |
| `src/ui/components/ink-frame.ts` | Cadre d'encre irrégulier, extrait de `card.ts`. |
| `src/ui/components/card-grid.ts` | Géométrie de grille partagée, extraite de `menu.ts`. |
| `src/ui/components/achievement-card.ts` | Carte de succès. |
| `src/ui/components/nib-tile.ts` | Tuile de tracé. |
| `src/ui/screens/hud-badge.ts` | File d'attente et rendu du bandeau. |

**Modifiés :**

| Fichier | Changement |
| --- | --- |
| `src/render/views/player.ts` | `drawNib` prend un `SkinId` ; `PlayerView.setSkin` |
| `src/render/stage.ts` | `Stage.setSkin`, propagé au joueur et aux images rémanentes |
| `src/sim/systems/collision.ts` | `activeEnemies` exportée (mot-clé `export` uniquement) |
| `src/app/game.ts` | Branchement du traqueur ; `killCount` et `seenPowerups` supprimés |
| `src/ui/components/card.ts` | Importe `ink-frame` au lieu de le porter |
| `src/ui/screens/menu.ts` | Cinq entrées, deux vitrines de plus |
| `src/ui/screens/hud.ts` | Accueille le bandeau |
| `src/ui/screens/gameover.ts` | Récapitulatif des succès du run |
| `src/i18n/locales/{fr,en}.json` | Clés des succès, des tracés et des écrans |

---

## Task 1: Les sept silhouettes

**Files:**
- Create: `src/render/views/nibs.ts`
- Create: `src/render/views/nibs.test.ts`
- Modify: `src/render/views/player.ts` (`drawNib`, `PlayerView`)
- Modify: `src/render/stage.ts` (`Stage.setSkin`)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type SkinId = 'quill' | 'ball' | 'brush' | 'blot' | 'dropper' | 'pencil' | 'seal'`
  - `const SKIN_IDS: readonly SkinId[]`
  - `const NIBS: Record<SkinId, readonly (readonly [number, number])[]>`
  - `const NIB_MAX_RADIUS: number`
  - `function nibPath(skin: SkinId): string` — attribut `d` d'un `<path>` SVG
  - `function drawNib(gfx: Graphics, color: number, skin?: SkinId): void` (défaut `'quill'`)
  - `PlayerView.setSkin(skin: SkinId): void`
  - `Stage.setSkin(skin: SkinId): void`

- [ ] **Step 1: Write the failing test**

Créer `src/render/views/nibs.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { NIB_MAX_RADIUS, NIBS, nibPath, SKIN_IDS } from './nibs'

describe('nibs', () => {
  it('déclare une silhouette par identifiant', () => {
    for (const id of SKIN_IDS) {
      expect(NIBS[id].length).toBeGreaterThanOrEqual(3)
    }
    expect(Object.keys(NIBS).sort()).toEqual([...SKIN_IDS].sort())
  })

  // La hitbox vit dans `Collider.radius` côté simulation et ne bouge pas :
  // une silhouette plus longue que la plume promettrait une allonge qu'elle
  // n'a pas.
  it('garde chaque silhouette dans le rayon de la plume', () => {
    for (const id of SKIN_IDS) {
      for (const [x, y] of NIBS[id]) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(NIB_MAX_RADIUS)
      }
    }
  })

  it('dérive le rayon maximal de la plume elle-même', () => {
    const longest = Math.max(...NIBS.quill.map(([x, y]) => Math.hypot(x, y)))
    expect(NIB_MAX_RADIUS).toBeCloseTo(longest, 6)
  })

  // Le tracé par défaut ne doit pas bouger d'un pixel : c'est la silhouette
  // que tous les joueurs ont aujourd'hui.
  it('conserve la plume actuelle à l’identique', () => {
    expect(NIBS.quill).toEqual([
      [13, 0],
      [-8, 9],
      [-4, 0],
      [-8, -9],
    ])
  })

  it('rend un chemin SVG fermé', () => {
    expect(nibPath('quill')).toBe('M13 0 L-8 9 L-4 0 L-8 -9 Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/views/nibs.test.ts`
Expected: FAIL — `Failed to resolve import "./nibs"`

- [ ] **Step 3: Write the implementation**

Créer `src/render/views/nibs.ts` :

```ts
/**
 * Les silhouettes de la pointe du joueur. Une seule source, deux
 * consommateurs : `drawNib` la trace dans Pixi, `nibPath` la rend en SVG pour
 * les vitrines du menu. Deux copies du même contour divergeraient au premier
 * ajustement — et le joueur verrait un tracé au menu, un autre en jeu.
 *
 * Repère identique pour toutes : origine au centre de la hitbox, pointe vers
 * +x. Un tracé ne change ni la portée, ni la vitesse, ni la hitbox — celle-ci
 * vit dans `Collider.radius`, côté simulation, qu'aucun tracé ne touche.
 */
export type SkinId = 'quill' | 'ball' | 'brush' | 'blot' | 'dropper' | 'pencil' | 'seal'

export const SKIN_IDS: readonly SkinId[] = [
  'quill',
  'ball',
  'brush',
  'blot',
  'dropper',
  'pencil',
  'seal',
]

type Poly = readonly (readonly [number, number])[]

/**
 * Disque approché par un polygone régulier. Tout est polygonal ici, cercles
 * compris : le filtre `boil` fait trembler le trait à 8 fps, un seize-côtés y
 * est indiscernable d'un vrai cercle, et une seconde primitive obligerait
 * `drawNib` et `nibPath` à savoir la dessiner chacun de son côté.
 */
function circle(radius: number, sides: number): Poly {
  return Array.from({ length: sides }, (_, i): readonly [number, number] => {
    const a = (i / sides) * Math.PI * 2
    return [
      Math.round(Math.cos(a) * radius * 100) / 100,
      Math.round(Math.sin(a) * radius * 100) / 100,
    ]
  })
}

export const NIBS: Record<SkinId, Poly> = {
  /** La plume d'origine, au sommet près : le défaut ne bouge pas. */
  quill: [
    [13, 0],
    [-8, 9],
    [-4, 0],
    [-8, -9],
  ],
  /** La bille : pas d'orientation lisible, et c'est le propos — elle roule. */
  ball: circle(10, 16),
  /** Le pinceau : touffe large, pointe molle. */
  brush: [
    [12, 0],
    [2, 7],
    [-8, 9],
    [-6, 0],
    [-8, -9],
    [2, -7],
  ],
  /** La tache : aucune direction lisible, contour volontairement irrégulier. */
  blot: [
    [11, 2],
    [6, 8],
    [-2, 10],
    [-9, 6],
    [-11, -1],
    [-6, -8],
    [1, -10],
    [8, -7],
  ],
  /** Le compte-gouttes : pointe fine, corps rond. */
  dropper: [
    [13, 0],
    [4, 5],
    [-2, 9],
    [-8, 6],
    [-10, 0],
    [-8, -6],
    [-2, -9],
    [4, -5],
  ],
  /** Le crayon : fût hexagonal, pointe taillée. */
  pencil: [
    [13, 0],
    [6, 5],
    [-9, 5],
    [-11, 2],
    [-11, -2],
    [-9, -5],
    [6, -5],
  ],
  /** Le sceau : losange épais, la seule silhouette à deux axes de symétrie. */
  seal: [
    [12, 0],
    [0, 10],
    [-12, 0],
    [0, -10],
  ],
}

/** Rayon de la plume, dérivé d'elle et jamais recopié : c'est l'étalon des autres. */
export const NIB_MAX_RADIUS = Math.max(...NIBS.quill.map(([x, y]) => Math.hypot(x, y)))

/** Attribut `d` d'un `<path>` SVG, pour les vitrines du menu. */
export function nibPath(skin: SkinId): string {
  const pts = NIBS[skin]
  return `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/views/nibs.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Brancher `drawNib` sur les silhouettes**

Dans `src/render/views/player.ts`, remplacer la fonction `drawNib` (lignes 59-67) par :

```ts
/**
 * La silhouette de la pointe, à l'origine et pointant vers +x.
 * Exportée parce que les images rémanentes de la ruée (`fx/afterimage.ts`) la
 * dessinent aussi : un fantôme qui ne ressemble pas au joueur ne se lit pas
 * comme sa trace, et deux copies du même tracé finissent toujours par diverger.
 */
export function drawNib(gfx: Graphics, color: number, skin: SkinId = 'quill'): void {
  const pts = NIBS[skin]
  const [first = [0, 0], ...rest] = pts
  gfx.moveTo(first[0], first[1])
  for (const [x, y] of rest) {
    gfx.lineTo(x, y)
  }
  gfx.closePath().fill({ color })
}
```

Ajouter l'import en tête du fichier, après l'import de `INK` :

```ts
import { NIBS, type SkinId } from './nibs'
```

- [ ] **Step 6: Ajouter `setSkin` à la vue du joueur**

Dans `src/render/views/player.ts`, ajouter à l'interface `PlayerView`, après `container` :

```ts
  /** Change la silhouette. Appelée entre deux parties, jamais pendant. */
  setSkin(skin: SkinId): void
```

Dans `createPlayerView`, remplacer la ligne `drawNib(body, INK.paper)` par un appel via une variable, et ajouter la méthode à l'objet retourné, juste avant `update` :

```ts
  let skin: SkinId = 'quill'
  drawNib(body, INK.paper, skin)
```

```ts
    setSkin(next: SkinId): void {
      if (next === skin) {
        return
      }
      skin = next
      body.clear()
      drawNib(body, INK.paper, skin)
    },
```

- [ ] **Step 7: Exposer `setSkin` sur le `Stage`**

Dans `src/render/stage.ts` :

1. Ajouter à l'import existant de `./views/player` le type `SkinId` — non : `SkinId` vient de `./views/nibs`. Ajouter la ligne d'import :

```ts
import type { SkinId } from './views/nibs'
```

2. Ajouter à l'interface `Stage`, juste avant `destroy()` :

```ts
  /**
   * Silhouette du joueur. Poussée entre deux parties par `app/game.ts` : les
   * images rémanentes la lisent aussi, sans quoi le fantôme de la ruée
   * garderait la plume d'origine.
   */
  setSkin(skin: SkinId): void
```

3. Dans le corps de `createStage`, déclarer la variable au-dessus de `const afterimages = ...` :

```ts
  let skin: SkinId = 'quill'
```

4. Remplacer `drawNib(gfx, INK.paper)` dans la closure de `createAfterimages` par :

```ts
      drawNib(gfx, INK.paper, skin)
```

5. Ajouter la méthode à l'objet retourné, juste avant `destroy()` :

```ts
    setSkin(next: SkinId): void {
      skin = next
      playerView.setSkin(next)
    },
```

- [ ] **Step 8: Vérifier que rien n'a bougé**

Run: `npm test`
Expected: PASS — toute la suite, `determinism.test.ts` compris.

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur.

- [ ] **Step 9: Commit**

```bash
git add src/render/views/nibs.ts src/render/views/nibs.test.ts src/render/views/player.ts src/render/stage.ts
git commit -m "feat(render): sept silhouettes de pointe interchangeables"
```

---

## Task 2: La trace de partie

**Files:**
- Create: `src/app/achievements/trace.ts`
- Create: `src/app/achievements/trace.test.ts`

**Interfaces:**
- Consumes: `SimWorld`, `SimEvent` (`@/sim/world`), `Position` (`@/sim/components`), `PowerUpKind` et `POWERUP_BY_ID` (`@/sim/data/powerups`).
- Produces:
  - `interface RunTrace` (tous les champs listés ci-dessous)
  - `function createTrace(spawnX: number, spawnY: number): RunTrace`
  - `function advanceTrace(trace: RunTrace, world: SimWorld, nearestEnemyPx: number): void`
  - `const BURST_WINDOW_MS = 2000`
  - `const STILL_RADIUS_PX = 40`
  - `const EDGE_MARGIN_PX = 40`
  - `const CLEAN_DISTANCE_PX = 60`

- [ ] **Step 1: Write the failing test**

Créer `src/app/achievements/trace.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { Position } from '@/sim/components'
import { spawnPlayer } from '@/sim/spawn'
import { ARENA, createWorld, type SimWorld } from '@/sim/world'
import { advanceTrace, BURST_WINDOW_MS, createTrace, type RunTrace } from './trace'

/** Un monde nu avec un joueur au centre, comme au début d'une partie. */
function world(): SimWorld {
  const w = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  spawnPlayer(w)
  return w
}

function trace(w: SimWorld): RunTrace {
  const eid = w.playerEid
  return createTrace(Position.x[eid] ?? 0, Position.y[eid] ?? 0)
}

/** Avance d'un pas en plaçant le joueur et en laissant l'ennemi au loin. */
function step(t: RunTrace, w: SimWorld, x: number, y: number, nearest = Number.POSITIVE_INFINITY) {
  Position.x[w.playerEid] = x
  Position.y[w.playerEid] = y
  advanceTrace(t, w, nearest)
  w.events.length = 0
}

describe('advanceTrace', () => {
  it('compte les kills et horodate chacun', () => {
    const w = world()
    const t = trace(w)
    w.time = 1000
    w.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    w.events.push({ type: 'enemyKilled', eid: 2, x: 0, y: 0 })
    step(t, w, 100, 100)

    expect(t.kills).toBe(2)
    expect(t.killTimestamps).toEqual([1000, 1000])
  })

  // Sans élagage, le tableau grandirait avec la durée de la partie et
  // « 100 ennemis en 2 s » deviendrait « 100 ennemis en tout ».
  it('élague les kills sortis de la fenêtre de rafale', () => {
    const w = world()
    const t = trace(w)
    w.time = 1000
    w.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    step(t, w, 100, 100)

    w.time = 1000 + BURST_WINDOW_MS + 1
    w.events.push({ type: 'enemyKilled', eid: 2, x: 0, y: 0 })
    step(t, w, 100, 100)

    expect(t.kills).toBe(2)
    expect(t.killTimestamps).toEqual([1000 + BURST_WINDOW_MS + 1])
  })

  // `scoreSystem` remet `world.combo` à zéro dès que la fenêtre expire : un
  // prédicat qui lirait la valeur courante manquerait le pic.
  it('retient le pic de combo malgré la remise à zéro', () => {
    const w = world()
    const t = trace(w)
    w.combo = 37
    step(t, w, 100, 100)
    w.combo = 0
    step(t, w, 100, 100)

    expect(t.maxCombo).toBe(37)
  })

  it('mémorise les genres de power-up ramassés', () => {
    const w = world()
    const t = trace(w)
    // 1 = `blast` dans POWERUP_BY_ID (l'indice 0 n'est pas attribué).
    w.events.push({ type: 'powerupPicked', kind: 1 })
    step(t, w, 100, 100)

    expect(t.powerupsPicked.has('blast')).toBe(true)
    expect(t.powerupCount).toBe(1)
  })

  it('remet les accumulateurs de vague à zéro au début de la suivante', () => {
    const w = world()
    const t = trace(w)
    w.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    step(t, w, 100, 100)
    expect(t.waveKills).toBe(1)

    w.events.push({ type: 'waveEnded', wave: 1 })
    w.events.push({ type: 'waveStarted', wave: 2 })
    step(t, w, 100, 100)

    expect(t.waveKills).toBe(0)
  })

  it('retient une vague traversée sans un seul kill', () => {
    const w = world()
    const t = trace(w)
    step(t, w, 100, 100)
    w.events.push({ type: 'waveEnded', wave: 1 })
    step(t, w, 100, 100)

    expect(t.hadPacifistWave).toBe(true)
  })

  it('salit la vague dès qu’un ennemi approche', () => {
    const w = world()
    const t = trace(w)
    step(t, w, 100, 100, 59)
    w.events.push({ type: 'waveEnded', wave: 1 })
    step(t, w, 100, 100)

    expect(t.cleanWaveStreak).toBe(0)
  })

  it('enchaîne les vagues propres', () => {
    const w = world()
    const t = trace(w)
    for (const wave of [1, 2]) {
      step(t, w, 100, 100, 400)
      w.events.push({ type: 'waveEnded', wave })
      w.events.push({ type: 'waveStarted', wave: wave + 1 })
      step(t, w, 100, 100, 400)
    }

    expect(t.cleanWaveStreak).toBe(2)
  })

  // L'ancre suit le joueur dès qu'il en sort : « rester immobile » se compte
  // par rapport à l'endroit où l'on s'est posé, pas au point de départ.
  it('accumule l’immobilité et replace l’ancre à la sortie', () => {
    const w = world()
    const t = trace(w)
    w.time = 0
    step(t, w, 100, 100)
    w.time = 500
    step(t, w, 110, 100)
    expect(t.stillMs).toBe(500)

    w.time = 1000
    step(t, w, 400, 400)
    expect(t.stillMs).toBe(0)
    expect(t.stillX).toBe(400)
  })

  it('horodate le contact avec chaque bord', () => {
    const w = world()
    const t = trace(w)
    w.time = 300
    step(t, w, 5, 360)

    expect(t.edgeTouchedAt[0]).toBe(300)
    expect(t.edgeTouchedAt[1]).toBe(Number.NEGATIVE_INFINITY)
  })

  // La boîte part du point d'apparition (le centre) : c'est là que le joueur
  // se tient au premier pas, et la vague 1 n'a pas de `waveStarted` pour la
  // recaler.
  it('suit la boîte englobante de la vague', () => {
    const w = world()
    const t = trace(w)
    step(t, w, 100, 100)
    step(t, w, 300, 500)

    expect(t.waveMinX).toBe(100)
    expect(t.waveMaxX).toBe(640)
    expect(t.waveMinY).toBe(100)
    expect(t.waveMaxY).toBe(500)
  })

  it('note la mort et la dernière position', () => {
    const w = world()
    const t = trace(w)
    w.events.push({ type: 'playerDied', x: 640, y: 360 })
    step(t, w, 640, 360)

    expect(t.died).toBe(true)
    expect(t.x).toBe(640)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/achievements/trace.test.ts`
Expected: FAIL — `Failed to resolve import "./trace"`

- [ ] **Step 3: Write the implementation**

Créer `src/app/achievements/trace.ts` :

```ts
import { Position } from '@/sim/components'
import { POWERUP_BY_ID, type PowerUpKind } from '@/sim/data/powerups'
import type { SimWorld } from '@/sim/world'

/** Fenêtre de « Rafale » : au-delà, un kill ne compte plus dans la série. */
export const BURST_WINDOW_MS = 2000
/** Rayon dans lequel le joueur est considéré immobile (« Nature morte »). */
export const STILL_RADIUS_PX = 40
/** Distance à un bord en deçà de laquelle on le considère touché. */
export const EDGE_MARGIN_PX = 40
/** En deçà, un ennemi a approché et la vague n'est plus immaculée. */
export const CLEAN_DISTANCE_PX = 60

/**
 * Ce qu'une partie a produit, agrégé pas à pas. Les 24 prédicats de
 * `catalog.ts` sont des fonctions pures de cet objet : un test de succès est
 * donc un littéral et une assertion, jamais une séquence d'événements à
 * rejouer.
 *
 * Elle porte exactement ce que les prédicats demandent. Tout champ ajouté ici
 * sans prédicat pour le lire est du poids mort maintenu à 60 Hz.
 */
export interface RunTrace {
  /** `world.time` — gèle en hitstop, comme le HUD. */
  timeMs: number
  score: number
  wave: number
  kills: number
  maxCombo: number
  died: boolean

  powerupsPicked: Set<PowerUpKind>
  powerupCount: number

  /** Horodatages des kills, élagués à `BURST_WINDOW_MS`. */
  killTimestamps: number[]

  waveKills: number
  waveClean: boolean
  cleanWaveStreak: number
  /** Vrai dès qu'une vague entière a été traversée sans un seul kill. */
  hadPacifistWave: boolean
  /** Vrai dès qu'une vague entière a tenu dans un quart d'arène. */
  hadHomebodyWave: boolean
  waveMinX: number
  waveMaxX: number
  waveMinY: number
  waveMaxY: number

  stillX: number
  stillY: number
  stillMs: number

  /** Dernier contact avec chaque bord — gauche, droite, haut, bas. */
  edgeTouchedAt: [number, number, number, number]

  spawnX: number
  spawnY: number
  x: number
  y: number

  /** Pas écoulés — cadence l'échantillonnage de proximité (`tracker.ts`). */
  steps: number
}

export function createTrace(spawnX: number, spawnY: number): RunTrace {
  return {
    timeMs: 0,
    score: 0,
    wave: 1,
    kills: 0,
    maxCombo: 0,
    died: false,
    powerupsPicked: new Set<PowerUpKind>(),
    powerupCount: 0,
    killTimestamps: [],
    waveKills: 0,
    waveClean: true,
    cleanWaveStreak: 0,
    hadPacifistWave: false,
    hadHomebodyWave: false,
    // La vague 1 n'a pas de `waveStarted` : les accumulateurs démarrent ici
    // comme le ferait un début de vague.
    waveMinX: spawnX,
    waveMaxX: spawnX,
    waveMinY: spawnY,
    waveMaxY: spawnY,
    stillX: spawnX,
    stillY: spawnY,
    stillMs: 0,
    // `-Infinity` et non 0 : à zéro, les quatre bords passeraient pour touchés
    // au premier pas et « Tour du propriétaire » serait offert.
    edgeTouchedAt: [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ],
    spawnX,
    spawnY,
    x: spawnX,
    y: spawnY,
    steps: 0,
  }
}

/** Remet à zéro ce qui ne vaut que pour une vague. */
function beginWave(trace: RunTrace, x: number, y: number): void {
  trace.waveKills = 0
  trace.waveClean = true
  trace.waveMinX = x
  trace.waveMaxX = x
  trace.waveMinY = y
  trace.waveMaxY = y
}

/**
 * `nearestEnemyPx` vaut `Infinity` quand la mesure n'a pas été faite à ce pas
 * — elle est échantillonnée, et inutile dès que les deux succès immaculés sont
 * acquis (voir `tracker.ts`). Passer la distance plutôt que de la calculer ici
 * garde ce module libre de toute requête bitECS, donc testable sur un monde nu.
 */
export function advanceTrace(trace: RunTrace, world: SimWorld, nearestEnemyPx: number): void {
  const eid = world.playerEid
  const x = Position.x[eid] ?? 0
  const y = Position.y[eid] ?? 0
  const dtMs = world.time - trace.timeMs

  trace.steps += 1
  trace.timeMs = world.time
  trace.score = world.score
  trace.wave = world.wave
  trace.x = x
  trace.y = y
  if (world.combo > trace.maxCombo) {
    trace.maxCombo = world.combo
  }

  for (const event of world.events) {
    if (event.type === 'enemyKilled') {
      trace.kills += 1
      trace.waveKills += 1
      trace.killTimestamps.push(world.time)
    } else if (event.type === 'powerupPicked') {
      const kind = POWERUP_BY_ID[event.kind]
      if (kind) {
        trace.powerupsPicked.add(kind)
        trace.powerupCount += 1
      }
    } else if (event.type === 'playerDied') {
      trace.died = true
    }
  }

  // Élagage en une passe : les horodatages sont croissants, il suffit de
  // couper la tête.
  const cutoff = world.time - BURST_WINDOW_MS
  let drop = 0
  while (drop < trace.killTimestamps.length && (trace.killTimestamps[drop] ?? 0) < cutoff) {
    drop += 1
  }
  if (drop > 0) {
    trace.killTimestamps.splice(0, drop)
  }

  if (nearestEnemyPx < CLEAN_DISTANCE_PX) {
    trace.waveClean = false
  }

  trace.waveMinX = Math.min(trace.waveMinX, x)
  trace.waveMaxX = Math.max(trace.waveMaxX, x)
  trace.waveMinY = Math.min(trace.waveMinY, y)
  trace.waveMaxY = Math.max(trace.waveMaxY, y)

  if (Math.hypot(x - trace.stillX, y - trace.stillY) <= STILL_RADIUS_PX) {
    trace.stillMs += dtMs
  } else {
    trace.stillX = x
    trace.stillY = y
    trace.stillMs = 0
  }

  const { width, height } = world.arena
  if (x <= EDGE_MARGIN_PX) {
    trace.edgeTouchedAt[0] = world.time
  }
  if (x >= width - EDGE_MARGIN_PX) {
    trace.edgeTouchedAt[1] = world.time
  }
  if (y <= EDGE_MARGIN_PX) {
    trace.edgeTouchedAt[2] = world.time
  }
  if (y >= height - EDGE_MARGIN_PX) {
    trace.edgeTouchedAt[3] = world.time
  }

  // Les bilans de vague se lisent sur `waveEnded`, avant que `waveStarted` ne
  // remette les accumulateurs à zéro — les deux événements arrivent dans le
  // même pas (`waveSystem`).
  for (const event of world.events) {
    if (event.type === 'waveEnded') {
      if (trace.waveKills === 0) {
        trace.hadPacifistWave = true
      }
      if (
        trace.waveMaxX - trace.waveMinX <= width / 2 &&
        trace.waveMaxY - trace.waveMinY <= height / 2
      ) {
        trace.hadHomebodyWave = true
      }
      trace.cleanWaveStreak = trace.waveClean ? trace.cleanWaveStreak + 1 : 0
    } else if (event.type === 'waveStarted') {
      beginWave(trace, x, y)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/achievements/trace.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/achievements/trace.ts src/app/achievements/trace.test.ts
git commit -m "feat(achievements): la trace de partie, agrégée pas à pas"
```

---

## Task 3: Le catalogue et ses prédicats

**Files:**
- Create: `src/app/achievements/catalog.ts`
- Create: `src/app/achievements/catalog.test.ts`
- Create: `src/app/achievements/predicates.test.ts`
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `RunTrace` (tâche 2), `SkinId` (tâche 1), `POWERUP_KINDS` (`@/sim/data/powerups`).
- Produces:
  - `type AchievementFamily = 'progression' | 'mastery' | 'oddity'`
  - `interface AchievementDef { id: string; family: AchievementFamily; skin?: SkinId; done(trace: RunTrace): boolean }`
  - `const ACHIEVEMENTS: readonly AchievementDef[]` (24 entrées)
  - `const ACHIEVEMENT_BY_SKIN: Partial<Record<SkinId, AchievementDef>>`

- [ ] **Step 1: Write the failing structural test**

Créer `src/app/achievements/catalog.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import { NIBS, SKIN_IDS } from '@/render/views/nibs'
import { ACHIEVEMENTS } from './catalog'

const locales: Record<string, Record<string, string>> = { fr, en }

describe('catalogue des succès', () => {
  it('compte 24 succès à identifiants uniques', () => {
    expect(ACHIEVEMENTS).toHaveLength(24)
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(24)
  })

  it('porte un nom et une condition dans les deux langues', () => {
    for (const [name, dict] of Object.entries(locales)) {
      for (const a of ACHIEVEMENTS) {
        expect(dict[`achievement.${a.id}.name`], `${name} ${a.id} name`).toBeTruthy()
        expect(dict[`achievement.${a.id}.desc`], `${name} ${a.id} desc`).toBeTruthy()
      }
    }
  })

  it('nomme chaque tracé dans les deux langues', () => {
    for (const [name, dict] of Object.entries(locales)) {
      for (const skin of SKIN_IDS) {
        expect(dict[`skin.${skin}.name`], `${name} ${skin}`).toBeTruthy()
      }
    }
  })

  it('ne référence que des tracés existants', () => {
    for (const a of ACHIEVEMENTS) {
      if (a.skin) {
        expect(NIBS[a.skin]).toBeDefined()
      }
    }
  })

  // La plume est le défaut, donc gratuite ; les six autres doivent être
  // gagnables, et par un seul succès — deux portes vers la même récompense
  // rendraient l'une des deux sans objet.
  it('ouvre chaque tracé sauf la plume par exactement un succès', () => {
    const porteurs = ACHIEVEMENTS.filter((a) => a.skin).map((a) => a.skin)
    expect(porteurs).toHaveLength(6)
    expect(new Set(porteurs).size).toBe(6)
    expect(porteurs).not.toContain('quill')
  })
})
```

- [ ] **Step 2: Write the failing predicate test**

Créer `src/app/achievements/predicates.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { POWERUP_KINDS } from '@/sim/data/powerups'
import { ACHIEVEMENTS } from './catalog'
import { createTrace, type RunTrace } from './trace'

/** Une trace neutre, que chaque cas ne modifie que sur ce qu'il teste. */
function base(patch: Partial<RunTrace> = {}): RunTrace {
  return Object.assign(createTrace(640, 360), patch)
}

function done(id: string, trace: RunTrace): boolean {
  const def = ACHIEVEMENTS.find((a) => a.id === id)
  if (!def) {
    throw new Error(`succès inconnu : ${id}`)
  }
  return def.done(trace)
}

describe('prédicats', () => {
  it('wave-10 s’ouvre à la vague 10', () => {
    expect(done('wave-10', base({ wave: 9 }))).toBe(false)
    expect(done('wave-10', base({ wave: 10 }))).toBe(true)
  })

  it('score-1m s’ouvre au million', () => {
    expect(done('score-1m', base({ score: 999_999 }))).toBe(false)
    expect(done('score-1m', base({ score: 1_000_000 }))).toBe(true)
  })

  it('kills-2000 compte les ennemis de la partie', () => {
    expect(done('kills-2000', base({ kills: 1999 }))).toBe(false)
    expect(done('kills-2000', base({ kills: 2000 }))).toBe(true)
  })

  it('combo-750 lit le pic, pas le combo courant', () => {
    expect(done('combo-750', base({ maxCombo: 749 }))).toBe(false)
    expect(done('combo-750', base({ maxCombo: 750 }))).toBe(true)
  })

  it('burst-100 compte la fenêtre glissante', () => {
    expect(done('burst-100', base({ killTimestamps: new Array(99).fill(0) }))).toBe(false)
    expect(done('burst-100', base({ killTimestamps: new Array(100).fill(0) }))).toBe(true)
  })

  it('clean-wave demande une vague, clean-three en demande trois', () => {
    expect(done('clean-wave', base({ cleanWaveStreak: 0 }))).toBe(false)
    expect(done('clean-wave', base({ cleanWaveStreak: 1 }))).toBe(true)
    expect(done('clean-three', base({ cleanWaveStreak: 2 }))).toBe(false)
    expect(done('clean-three', base({ cleanWaveStreak: 3 }))).toBe(true)
  })

  it('full-kit demande tous les genres, quel qu’en soit le nombre', () => {
    const partiel = new Set(POWERUP_KINDS.slice(0, POWERUP_KINDS.length - 1))
    expect(done('full-kit', base({ powerupsPicked: partiel }))).toBe(false)
    expect(done('full-kit', base({ powerupsPicked: new Set(POWERUP_KINDS) }))).toBe(true)
  })

  it('bare-hands tombe dès le premier power-up ramassé', () => {
    expect(done('bare-hands', base({ wave: 5, powerupCount: 0 }))).toBe(true)
    expect(done('bare-hands', base({ wave: 5, powerupCount: 1 }))).toBe(false)
    expect(done('bare-hands', base({ wave: 4, powerupCount: 0 }))).toBe(false)
  })

  it('no-halo ne regarde que le Halo', () => {
    expect(done('no-halo', base({ wave: 10, powerupsPicked: new Set(['blast']) }))).toBe(true)
    expect(done('no-halo', base({ wave: 10, powerupsPicked: new Set(['halo']) }))).toBe(false)
  })

  // Le score monte de 5 points par seconde tout seul : c'est le kill, pas le
  // point, qui fait la page blanche.
  it('blank-page exige la mort sans un seul kill', () => {
    expect(done('blank-page', base({ died: true, kills: 0 }))).toBe(true)
    expect(done('blank-page', base({ died: false, kills: 0 }))).toBe(false)
    expect(done('blank-page', base({ died: true, kills: 1 }))).toBe(false)
  })

  it('false-start exige une mort avant cinq secondes', () => {
    expect(done('false-start', base({ died: true, timeMs: 4999 }))).toBe(true)
    expect(done('false-start', base({ died: true, timeMs: 5000 }))).toBe(false)
  })

  it('still-life demande quinze secondes ancrées', () => {
    expect(done('still-life', base({ stillMs: 14_999 }))).toBe(false)
    expect(done('still-life', base({ stillMs: 15_000 }))).toBe(true)
  })

  it('pacifist et homebody lisent leur bilan de vague', () => {
    expect(done('pacifist', base({ hadPacifistWave: true }))).toBe(true)
    expect(done('pacifist', base({ hadPacifistWave: false }))).toBe(false)
    expect(done('homebody', base({ hadHomebodyWave: true }))).toBe(true)
  })

  it('grand-tour exige les quatre bords dans la même fenêtre', () => {
    expect(done('grand-tour', base({ edgeTouchedAt: [0, 1000, 2000, 4999] }))).toBe(true)
    expect(done('grand-tour', base({ edgeTouchedAt: [0, 1000, 2000, 5001] }))).toBe(false)
  })

  // Un bord jamais touché vaut `-Infinity` : l'écart est infini, jamais ≤ 5 s.
  it('grand-tour reste fermé tant qu’un bord n’a pas été touché', () => {
    expect(
      done('grand-tour', base({ edgeTouchedAt: [0, 1000, 2000, Number.NEGATIVE_INFINITY] })),
    ).toBe(false)
  })

  it('back-to-inkwell mesure la distance au point d’apparition', () => {
    expect(done('back-to-inkwell', base({ died: true, x: 640, y: 400 }))).toBe(true)
    expect(done('back-to-inkwell', base({ died: true, x: 640, y: 500 }))).toBe(false)
    expect(done('back-to-inkwell', base({ died: false, x: 640, y: 360 }))).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/achievements/catalog.test.ts src/app/achievements/predicates.test.ts`
Expected: FAIL — `Failed to resolve import "./catalog"`

- [ ] **Step 4: Write the implementation**

Créer `src/app/achievements/catalog.ts` :

```ts
import type { SkinId } from '@/render/views/nibs'
import { POWERUP_KINDS } from '@/sim/data/powerups'
import type { RunTrace } from './trace'

export type AchievementFamily = 'progression' | 'mastery' | 'oddity'

export interface AchievementDef {
  id: string
  family: AchievementFamily
  /** Le tracé que ce succès ouvre, quand il en ouvre un. */
  skin?: SkinId
  /** Vrai dès que la condition est remplie. Fonction pure de la trace. */
  done(trace: RunTrace): boolean
}

/**
 * Les seuils, nommés et groupés : ils vont bouger. Ceux de combo et de rafale
 * sont dérivés d'un seul repère de jeu réel — des parties à 500 000 points
 * pour 2 000 tués, un record à 1 300 000 — et non d'une mesure du combo
 * courant en fin de partie. Les réviser ne doit toucher que ce bloc.
 */
const WAVE = { first: 5, book: 10, volume: 20, complete: 30 } as const
const SCORE = { good: 100_000, large: 500_000, million: 1_000_000 } as const
const KILLS = { blotter: 500, tide: 2_000 } as const
const COMBO = { roll: 250, chain: 750 } as const
const BURST_KILLS = 100
const CLEAN_WAVES = 3
const BARE_HANDS_WAVE = 5
const NO_HALO_WAVE = 10
const FALSE_START_MS = 5_000
const STILL_LIFE_MS = 15_000
const GRAND_TOUR_MS = 5_000
const INKWELL_PX = 50

/**
 * Les succès sont des données : en ajouter un ne touche aucun système, comme
 * les cartes d'amélioration (`sim/data/upgrades.ts`). Les clés i18n sont
 * dérivées de l'identifiant : `achievement.<id>.name` et `.desc`.
 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // ── Progression ───────────────────────────────────────────────────────────
  { id: 'wave-5', family: 'progression', done: (t) => t.wave >= WAVE.first },
  { id: 'wave-10', family: 'progression', skin: 'ball', done: (t) => t.wave >= WAVE.book },
  { id: 'wave-20', family: 'progression', done: (t) => t.wave >= WAVE.volume },
  { id: 'wave-30', family: 'progression', skin: 'seal', done: (t) => t.wave >= WAVE.complete },
  { id: 'score-100k', family: 'progression', done: (t) => t.score >= SCORE.good },
  { id: 'score-500k', family: 'progression', done: (t) => t.score >= SCORE.large },
  { id: 'score-1m', family: 'progression', done: (t) => t.score >= SCORE.million },
  { id: 'kills-500', family: 'progression', done: (t) => t.kills >= KILLS.blotter },
  { id: 'kills-2000', family: 'progression', done: (t) => t.kills >= KILLS.tide },

  // ── Maîtrise ──────────────────────────────────────────────────────────────
  { id: 'combo-250', family: 'mastery', done: (t) => t.maxCombo >= COMBO.roll },
  { id: 'combo-750', family: 'mastery', done: (t) => t.maxCombo >= COMBO.chain },
  { id: 'clean-wave', family: 'mastery', done: (t) => t.cleanWaveStreak >= 1 },
  {
    id: 'clean-three',
    family: 'mastery',
    skin: 'brush',
    done: (t) => t.cleanWaveStreak >= CLEAN_WAVES,
  },
  { id: 'burst-100', family: 'mastery', done: (t) => t.killTimestamps.length >= BURST_KILLS },
  // Comparé à la longueur de la liste et jamais à 8 : ajouter un neuvième
  // genre de power-up doit resserrer ce succès tout seul.
  {
    id: 'full-kit',
    family: 'mastery',
    done: (t) => t.powerupsPicked.size >= POWERUP_KINDS.length,
  },
  {
    id: 'bare-hands',
    family: 'mastery',
    done: (t) => t.wave >= BARE_HANDS_WAVE && t.powerupCount === 0,
  },
  {
    id: 'no-halo',
    family: 'mastery',
    done: (t) => t.wave >= NO_HALO_WAVE && !t.powerupsPicked.has('halo'),
  },

  // ── Loufoques ─────────────────────────────────────────────────────────────
  { id: 'blank-page', family: 'oddity', skin: 'blot', done: (t) => t.died && t.kills === 0 },
  { id: 'false-start', family: 'oddity', done: (t) => t.died && t.timeMs < FALSE_START_MS },
  {
    id: 'still-life',
    family: 'oddity',
    skin: 'dropper',
    done: (t) => t.stillMs >= STILL_LIFE_MS,
  },
  { id: 'pacifist', family: 'oddity', skin: 'pencil', done: (t) => t.hadPacifistWave },
  {
    id: 'grand-tour',
    family: 'oddity',
    // Un bord jamais touché vaut `-Infinity` : l'écart reste infini, donc le
    // succès fermé, sans avoir à tester chaque bord séparément.
    done: (t) => Math.max(...t.edgeTouchedAt) - Math.min(...t.edgeTouchedAt) <= GRAND_TOUR_MS,
  },
  { id: 'homebody', family: 'oddity', done: (t) => t.hadHomebodyWave },
  {
    id: 'back-to-inkwell',
    family: 'oddity',
    done: (t) => t.died && Math.hypot(t.x - t.spawnX, t.y - t.spawnY) <= INKWELL_PX,
  },
]

/** Le succès qui ouvre un tracé donné — la vitrine des tracés l'affiche. */
export const ACHIEVEMENT_BY_SKIN: Partial<Record<SkinId, AchievementDef>> = Object.fromEntries(
  ACHIEVEMENTS.filter((a) => a.skin).map((a) => [a.skin, a]),
)
```

- [ ] **Step 5: Ajouter les clés françaises**

Dans `src/i18n/locales/fr.json`, ajouter avant la première clé `upgrade.*` :

```json
  "menu.achievements": "Succès",
  "menu.skins": "Tracés",
  "achievements.title": "Succès",
  "achievements.progress": "{done} / {total}",
  "achievements.locked": "VERROUILLÉ",
  "achievements.reward": "Ouvre : {skin}",
  "family.progression": "PROGRESSION",
  "family.mastery": "MAÎTRISE",
  "family.oddity": "LOUFOQUE",
  "skins.title": "Tracés",
  "skins.equipped": "ÉQUIPÉ",
  "skins.lockedBy": "{achievement}",
  "skins.hint": "← → pour choisir · Espace pour équiper · Échap — retour",
  "gameover.unlocked": "DÉBLOQUÉ",
  "skin.quill.name": "La Plume",
  "skin.ball.name": "La Bille",
  "skin.brush.name": "Le Pinceau",
  "skin.blot.name": "La Tache",
  "skin.dropper.name": "Le Compte-gouttes",
  "skin.pencil.name": "Le Crayon",
  "skin.seal.name": "Le Sceau",
  "achievement.wave-5.name": "Cinquième page",
  "achievement.wave-5.desc": "Atteindre la vague 5",
  "achievement.wave-10.name": "Le carnet",
  "achievement.wave-10.desc": "Atteindre la vague 10",
  "achievement.wave-20.name": "Le volume",
  "achievement.wave-20.desc": "Atteindre la vague 20",
  "achievement.wave-30.name": "L'œuvre complète",
  "achievement.wave-30.desc": "Atteindre la vague 30",
  "achievement.score-100k.name": "Belle plume",
  "achievement.score-100k.desc": "100 000 points en une partie",
  "achievement.score-500k.name": "Grand format",
  "achievement.score-500k.desc": "500 000 points en une partie",
  "achievement.score-1m.name": "Le million",
  "achievement.score-1m.desc": "1 000 000 points en une partie",
  "achievement.kills-500.name": "Buvard",
  "achievement.kills-500.desc": "500 ennemis en une partie",
  "achievement.kills-2000.name": "Marée noire",
  "achievement.kills-2000.desc": "2 000 ennemis en une partie",
  "achievement.combo-250.name": "Roulement",
  "achievement.combo-250.desc": "Un combo de 250 sans rupture",
  "achievement.combo-750.name": "Chaîne d'encre",
  "achievement.combo-750.desc": "Un combo de 750 sans rupture",
  "achievement.clean-wave.name": "Page immaculée",
  "achievement.clean-wave.desc": "Une vague entière sans qu'un ennemi approche",
  "achievement.clean-three.name": "Cahier immaculé",
  "achievement.clean-three.desc": "Trois vagues d'affilée sans qu'un ennemi approche",
  "achievement.burst-100.name": "Rafale",
  "achievement.burst-100.desc": "100 ennemis en moins de deux secondes",
  "achievement.full-kit.name": "Toute la trousse",
  "achievement.full-kit.desc": "Ramasser les huit genres de power-up en une partie",
  "achievement.bare-hands.name": "Mains nues",
  "achievement.bare-hands.desc": "Atteindre la vague 5 sans ramasser un seul power-up",
  "achievement.no-halo.name": "Sans filet",
  "achievement.no-halo.desc": "Atteindre la vague 10 sans jamais ramasser de Halo",
  "achievement.blank-page.name": "Page blanche",
  "achievement.blank-page.desc": "Mourir sans avoir tué un seul ennemi",
  "achievement.false-start.name": "Faux départ",
  "achievement.false-start.desc": "Mourir dans les cinq premières secondes",
  "achievement.still-life.name": "Nature morte",
  "achievement.still-life.desc": "Rester quinze secondes sans t'éloigner",
  "achievement.pacifist.name": "Pacifiste",
  "achievement.pacifist.desc": "Traverser une vague entière sans tuer un ennemi",
  "achievement.grand-tour.name": "Tour du propriétaire",
  "achievement.grand-tour.desc": "Toucher les quatre bords en moins de cinq secondes",
  "achievement.homebody.name": "Casanier",
  "achievement.homebody.desc": "Une vague entière sans parcourir plus d'un quart de l'arène",
  "achievement.back-to-inkwell.name": "Retour à l'encrier",
  "achievement.back-to-inkwell.desc": "Mourir à moins de 50 px de ton point de départ",
```

- [ ] **Step 6: Ajouter les clés anglaises**

Dans `src/i18n/locales/en.json`, au même endroit :

```json
  "menu.achievements": "Achievements",
  "menu.skins": "Nibs",
  "achievements.title": "Achievements",
  "achievements.progress": "{done} / {total}",
  "achievements.locked": "LOCKED",
  "achievements.reward": "Unlocks: {skin}",
  "family.progression": "PROGRESSION",
  "family.mastery": "MASTERY",
  "family.oddity": "ODDITY",
  "skins.title": "Nibs",
  "skins.equipped": "EQUIPPED",
  "skins.lockedBy": "{achievement}",
  "skins.hint": "← → to choose · Space to equip · Esc — back",
  "gameover.unlocked": "UNLOCKED",
  "skin.quill.name": "The Quill",
  "skin.ball.name": "The Ballpoint",
  "skin.brush.name": "The Brush",
  "skin.blot.name": "The Blot",
  "skin.dropper.name": "The Dropper",
  "skin.pencil.name": "The Pencil",
  "skin.seal.name": "The Seal",
  "achievement.wave-5.name": "Fifth page",
  "achievement.wave-5.desc": "Reach wave 5",
  "achievement.wave-10.name": "The notebook",
  "achievement.wave-10.desc": "Reach wave 10",
  "achievement.wave-20.name": "The volume",
  "achievement.wave-20.desc": "Reach wave 20",
  "achievement.wave-30.name": "The complete works",
  "achievement.wave-30.desc": "Reach wave 30",
  "achievement.score-100k.name": "Fine nib",
  "achievement.score-100k.desc": "100,000 points in a single run",
  "achievement.score-500k.name": "Large format",
  "achievement.score-500k.desc": "500,000 points in a single run",
  "achievement.score-1m.name": "The million",
  "achievement.score-1m.desc": "1,000,000 points in a single run",
  "achievement.kills-500.name": "Blotter",
  "achievement.kills-500.desc": "500 enemies in a single run",
  "achievement.kills-2000.name": "Oil spill",
  "achievement.kills-2000.desc": "2,000 enemies in a single run",
  "achievement.combo-250.name": "Roll",
  "achievement.combo-250.desc": "A 250 combo without a break",
  "achievement.combo-750.name": "Ink chain",
  "achievement.combo-750.desc": "A 750 combo without a break",
  "achievement.clean-wave.name": "Spotless page",
  "achievement.clean-wave.desc": "A whole wave without an enemy coming close",
  "achievement.clean-three.name": "Spotless notebook",
  "achievement.clean-three.desc": "Three waves in a row without an enemy coming close",
  "achievement.burst-100.name": "Burst",
  "achievement.burst-100.desc": "100 enemies in under two seconds",
  "achievement.full-kit.name": "The whole kit",
  "achievement.full-kit.desc": "Pick up all eight power-up kinds in one run",
  "achievement.bare-hands.name": "Bare hands",
  "achievement.bare-hands.desc": "Reach wave 5 without picking up a single power-up",
  "achievement.no-halo.name": "No safety net",
  "achievement.no-halo.desc": "Reach wave 10 without ever picking up a Halo",
  "achievement.blank-page.name": "Blank page",
  "achievement.blank-page.desc": "Die without killing a single enemy",
  "achievement.false-start.name": "False start",
  "achievement.false-start.desc": "Die within the first five seconds",
  "achievement.still-life.name": "Still life",
  "achievement.still-life.desc": "Stay fifteen seconds without straying",
  "achievement.pacifist.name": "Pacifist",
  "achievement.pacifist.desc": "Cross a whole wave without killing an enemy",
  "achievement.grand-tour.name": "Grand tour",
  "achievement.grand-tour.desc": "Touch all four edges in under five seconds",
  "achievement.homebody.name": "Homebody",
  "achievement.homebody.desc": "A whole wave without covering more than a quarter of the arena",
  "achievement.back-to-inkwell.name": "Back to the inkwell",
  "achievement.back-to-inkwell.desc": "Die within 50 px of your starting point",
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/app/achievements/ src/i18n/`
Expected: PASS — `parity.test.ts` compris, qui vérifie que les deux locales portent les mêmes clés.

- [ ] **Step 8: Commit**

```bash
git add src/app/achievements/catalog.ts src/app/achievements/catalog.test.ts src/app/achievements/predicates.test.ts src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(achievements): les 24 succès et leurs prédicats"
```

---

## Task 4: Le store

**Files:**
- Create: `src/app/achievements/store.ts`
- Create: `src/app/achievements/store.test.ts`

**Interfaces:**
- Consumes: `storage` (`@/app/storage`), `ACHIEVEMENTS` et `ACHIEVEMENT_BY_SKIN` (tâche 3), `SkinId` et `SKIN_IDS` (tâche 1).
- Produces:
  - `function readUnlocked(): Set<string>`
  - `function unlock(id: string): void`
  - `function unlockedSkins(unlocked: ReadonlySet<string>): SkinId[]`
  - `function readSkin(unlocked: ReadonlySet<string>): SkinId`
  - `function equipSkin(skin: SkinId): void`

- [ ] **Step 1: Write the failing test**

Créer `src/app/achievements/store.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { equipSkin, readSkin, readUnlocked, unlock, unlockedSkins } from './store'

describe('store des succès', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('part vide et sur la plume', () => {
    expect(readUnlocked().size).toBe(0)
    expect(readSkin(new Set())).toBe('quill')
  })

  it('persiste un déblocage', () => {
    unlock('wave-10')
    expect(readUnlocked().has('wave-10')).toBe(true)
  })

  it('n’écrit pas deux fois le même succès', () => {
    unlock('wave-10')
    unlock('wave-10')
    expect(localStorage.getItem('inkpoint.achievements')).toBe('["wave-10"]')
  })

  // Un succès renommé ou retiré plus tard ne doit pas ressortir de la
  // sauvegarde comme s'il existait encore.
  it('ignore un identifiant absent du catalogue', () => {
    localStorage.setItem('inkpoint.achievements', '["wave-10","succes-fantome"]')
    const unlocked = readUnlocked()
    expect(unlocked.has('wave-10')).toBe(true)
    expect(unlocked.has('succes-fantome')).toBe(false)
  })

  it('ouvre la plume et rien d’autre par défaut', () => {
    expect(unlockedSkins(new Set())).toEqual(['quill'])
    expect(unlockedSkins(new Set(['wave-10']))).toEqual(['quill', 'ball'])
  })

  it('équipe un tracé gagné', () => {
    equipSkin('ball')
    expect(readSkin(new Set(['wave-10']))).toBe('ball')
  })

  // Sinon, effacer ses succès sans effacer son tracé laisserait une silhouette
  // que le joueur n'a pas gagnée.
  it('retombe sur la plume si le tracé équipé n’est pas gagné', () => {
    equipSkin('ball')
    expect(readSkin(new Set())).toBe('quill')
  })

  it('retombe sur la plume sur une valeur inconnue', () => {
    localStorage.setItem('inkpoint.skin', '"stylo-bille-4-couleurs"')
    expect(readSkin(new Set(['wave-10']))).toBe('quill')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/achievements/store.test.ts`
Expected: FAIL — `Failed to resolve import "./store"`

- [ ] **Step 3: Write the implementation**

Créer `src/app/achievements/store.ts` :

```ts
import { storage } from '@/app/storage'
import { type SkinId, SKIN_IDS } from '@/render/views/nibs'
import { ACHIEVEMENTS, ACHIEVEMENT_BY_SKIN } from './catalog'

const KEY_UNLOCKED = 'achievements'
const KEY_SKIN = 'skin'
/** Le tracé d'origine : gratuit, et le repli de tous les cas douteux. */
const DEFAULT_SKIN: SkinId = 'quill'

const KNOWN_IDS = new Set(ACHIEVEMENTS.map((a) => a.id))

/**
 * Les succès acquis, filtrés par le catalogue courant : renommer ou retirer un
 * succès ne doit pas faire ressortir un identifiant mort d'une vieille
 * sauvegarde, ni casser l'écran de vitrine qui itère dessus.
 */
export function readUnlocked(): Set<string> {
  const raw = storage.get<unknown>(KEY_UNLOCKED, [])
  if (!Array.isArray(raw)) {
    return new Set()
  }
  return new Set(raw.filter((id): id is string => typeof id === 'string' && KNOWN_IDS.has(id)))
}

/** Écrit immédiatement : un onglet fermé en pleine partie ne doit rien coûter. */
export function unlock(id: string): void {
  const unlocked = readUnlocked()
  if (unlocked.has(id)) {
    return
  }
  unlocked.add(id)
  storage.set(KEY_UNLOCKED, [...unlocked])
}

/** La plume d'abord, puis les tracés gagnés, dans l'ordre de `SKIN_IDS`. */
export function unlockedSkins(unlocked: ReadonlySet<string>): SkinId[] {
  return SKIN_IDS.filter((skin) => {
    const source = ACHIEVEMENT_BY_SKIN[skin]
    return source === undefined || unlocked.has(source.id)
  })
}

/**
 * Le tracé équipé, validé contre ce que le joueur a réellement gagné : les
 * deux clés vivent séparément dans `localStorage`, et effacer l'une sans
 * l'autre laisserait sinon une silhouette non méritée.
 */
export function readSkin(unlocked: ReadonlySet<string>): SkinId {
  const raw = storage.get<unknown>(KEY_SKIN, DEFAULT_SKIN)
  const available = unlockedSkins(unlocked)
  const found = available.find((skin) => skin === raw)
  return found ?? DEFAULT_SKIN
}

export function equipSkin(skin: SkinId): void {
  storage.set(KEY_SKIN, skin)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/achievements/store.test.ts`
Expected: PASS (8 tests)

Si `localStorage` n'existe pas dans l'environnement de test, vérifier que `vitest.config.ts` déclare `environment: 'jsdom'` — `src/app/storage.test.ts` s'appuie déjà dessus, donc ce doit être le cas.

- [ ] **Step 5: Commit**

```bash
git add src/app/achievements/store.ts src/app/achievements/store.test.ts
git commit -m "feat(achievements): persistance des succès et du tracé équipé"
```

---

## Task 5: Le traqueur

**Files:**
- Create: `src/app/achievements/proximity.ts`
- Create: `src/app/achievements/tracker.ts`
- Create: `src/app/achievements/tracker.test.ts`
- Modify: `src/sim/systems/collision.ts:34` (ajout du mot-clé `export`)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces:
  - `function nearestActiveEnemyDistance(world: SimWorld): number` (`Infinity` si aucun)
  - `interface Tracker { step(world: SimWorld): AchievementDef[]; reset(spawnX: number, spawnY: number): void; readonly trace: RunTrace; readonly needsProximity: boolean }`
  - `function createTracker(): Tracker`
  - `const PROXIMITY_EVERY = 4`

**Note sur les succès de mort.** `playerDied` arrive dans `world.events` du pas courant, et
`onStep` traite ce pas normalement — `advanceTrace` y pose `died`, l'évaluation qui suit
ouvre `blank-page`, `false-start` et `back-to-inkwell` dans la foulée. Il n'y a donc **pas**
d'évaluation finale séparée : elle serait toujours vide. Ce qui les distingue, c'est
l'affichage — le bandeau (tâche 10) se tait quand `trace.died` est vrai, donc ils
n'apparaissent qu'au récapitulatif, exactement comme la spec le prévoit.

- [ ] **Step 1: Exporter la requête des ennemis menaçants**

Dans `src/sim/systems/collision.ts`, ligne 34, ajouter `export` devant `const activeEnemies` et compléter le commentaire qui la précède :

```ts
// `Not(Materializing)` : « pointillé = inoffensif, plein = mortel » doit être
// vrai sans exception, sinon les embuscades deviennent des pièges injustes.
// `Not(Frozen)` est indispensable, pas défensif : la mort est différée
// (`freezeSystem` marque `Doomed` mais ne supprime qu'en fin de pas) — sans
// cette exclusion, un ennemi gelé traversé par le joueur tuerait ce dernier.
// `Not(Doomed)` de même : un ennemi tué par une bombe reste présent jusqu'à
// la fin du pas, sans quoi une bombe au contact tuerait le joueur en retour.
//
// Exportée pour `app/achievements/proximity.ts` : les succès immaculés se
// mesurent sur exactement la population qui peut tuer. Redéclarer la même
// requête là-bas les ferait diverger au premier ajustement de celle-ci.
export const activeEnemies = defineQuery([
```

- [ ] **Step 2: Write the failing test**

Créer `src/app/achievements/tracker.test.ts` :

```ts
import { beforeEach, describe, expect, it } from 'vitest'

import { addComponent, addEntity } from 'bitecs'
import { Collider, Enemy, Materializing, Position } from '@/sim/components'
import { spawnPlayer } from '@/sim/spawn'
import { ARENA, createWorld, type SimWorld } from '@/sim/world'
import { nearestActiveEnemyDistance } from './proximity'
import { createTracker } from './tracker'

function world(): SimWorld {
  const w = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  spawnPlayer(w)
  return w
}

function addEnemy(w: SimWorld, x: number, y: number, materializing = false): number {
  const eid = addEntity(w)
  addComponent(w, Enemy, eid)
  addComponent(w, Position, eid)
  addComponent(w, Collider, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Collider.radius[eid] = 8
  if (materializing) {
    addComponent(w, Materializing, eid)
    Materializing.remaining[eid] = 500
    Materializing.total[eid] = 500
  }
  return eid
}

describe('nearestActiveEnemyDistance', () => {
  it('rend l’infini quand l’arène est vide', () => {
    expect(nearestActiveEnemyDistance(world())).toBe(Number.POSITIVE_INFINITY)
  })

  it('mesure depuis le joueur', () => {
    const w = world()
    addEnemy(w, 640 + 100, 360)
    expect(nearestActiveEnemyDistance(w)).toBeCloseTo(100, 6)
  })

  // Pointillé = inoffensif : un ennemi qui n'a pas fini d'apparaître ne salit
  // pas une vague immaculée, exactement comme il ne peut pas tuer.
  it('ignore un ennemi en cours de matérialisation', () => {
    const w = world()
    addEnemy(w, 640 + 10, 360, true)
    expect(nearestActiveEnemyDistance(w)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('tracker', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('ouvre un succès une seule fois', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)

    w.wave = 5
    const premier = tracker.step(w).map((a) => a.id)
    const second = tracker.step(w).map((a) => a.id)

    expect(premier).toContain('wave-5')
    expect(second).not.toContain('wave-5')
  })

  it('persiste immédiatement ce qu’il ouvre', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)
    w.wave = 5
    tracker.step(w)

    expect(localStorage.getItem('inkpoint.achievements')).toContain('wave-5')
  })

  it('rend plusieurs succès ouverts au même pas', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)
    w.wave = 10

    const ids = tracker.step(w).map((a) => a.id)
    expect(ids).toContain('wave-5')
    expect(ids).toContain('wave-10')
  })

  // `playerDied` arrive dans les événements du pas courant : les succès de
  // mort s'ouvrent là, pas dans une passe finale séparée.
  it('ouvre les succès de mort dans le pas qui porte playerDied', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)
    w.events.push({ type: 'playerDied', x: 640, y: 360 })

    const ids = tracker.step(w).map((a) => a.id)
    expect(ids).toContain('blank-page')
    expect(ids).toContain('back-to-inkwell')
  })

  it('expose la trace en cours pour le tirage des cartes', () => {
    const w = world()
    const tracker = createTracker()
    tracker.reset(640, 360)
    w.events.push({ type: 'powerupPicked', kind: 1 })
    tracker.step(w)

    expect(tracker.trace.powerupsPicked.has('blast')).toBe(true)
  })

  it('ne réévalue pas un succès acquis dans une partie précédente', () => {
    const w = world()
    const premier = createTracker()
    premier.reset(640, 360)
    w.wave = 5
    premier.step(w)

    const suivant = createTracker()
    suivant.reset(640, 360)
    expect(suivant.step(w).map((a) => a.id)).not.toContain('wave-5')
  })

  it('cesse de mesurer la proximité une fois les deux immaculés acquis', () => {
    localStorage.setItem('inkpoint.achievements', '["clean-wave","clean-three"]')
    const tracker = createTracker()
    tracker.reset(640, 360)
    expect(tracker.needsProximity).toBe(false)
  })

  it('mesure la proximité tant qu’un immaculé reste à gagner', () => {
    const tracker = createTracker()
    tracker.reset(640, 360)
    expect(tracker.needsProximity).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/app/achievements/tracker.test.ts`
Expected: FAIL — `Failed to resolve import "./proximity"`

- [ ] **Step 4: Write `proximity.ts`**

```ts
import { Position } from '@/sim/components'
import { activeEnemies } from '@/sim/systems/collision'
import type { SimWorld } from '@/sim/world'

/**
 * Distance du joueur à l'ennemi le plus proche **capable de le tuer** —
 * `activeEnemies` exclut le pointillé, le gelé et le condamné, exactement
 * comme la collision. `Infinity` quand il n'y en a aucun.
 *
 * Seul fichier de `achievements/` à faire une requête bitECS : le reste du
 * dossier se teste sur des littéraux.
 */
export function nearestActiveEnemyDistance(world: SimWorld): number {
  const player = world.playerEid
  if (player < 0) {
    return Number.POSITIVE_INFINITY
  }
  const px = Position.x[player] ?? 0
  const py = Position.y[player] ?? 0

  let best = Number.POSITIVE_INFINITY
  for (const eid of activeEnemies(world)) {
    const dx = (Position.x[eid] ?? 0) - px
    const dy = (Position.y[eid] ?? 0) - py
    const d2 = dx * dx + dy * dy
    if (d2 < best) {
      best = d2
    }
  }
  // Une seule racine, à la fin : la comparaison se fait sur les carrés.
  return best === Number.POSITIVE_INFINITY ? best : Math.sqrt(best)
}
```

- [ ] **Step 5: Write `tracker.ts`**

```ts
import type { SimWorld } from '@/sim/world'
import { type AchievementDef, ACHIEVEMENTS } from './catalog'
import { nearestActiveEnemyDistance } from './proximity'
import { readUnlocked, unlock } from './store'
import { advanceTrace, createTrace, type RunTrace } from './trace'

/**
 * Cadence de la mesure de proximité, en pas. À 15 Hz, l'écart entre le joueur
 * (240 px/s) et un ennemi (150 px/s au plus) ne peut se réduire que de 26 px
 * entre deux mesures, contre un seuil de 60 px : une approche doit durer moins
 * de 66 ms pour passer entre les mailles, ce qui suppose une trajectoire
 * tangente au bord exact du disque. Limite assumée, et généreuse — au pire un
 * joueur garde un immaculé qu'il a frôlé.
 */
export const PROXIMITY_EVERY = 4

/** Les deux seuls succès qui dépendent de la mesure de proximité. */
const PROXIMITY_IDS = ['clean-wave', 'clean-three']

export interface Tracker {
  /**
   * Avance la trace et évalue. Rend les succès ouverts à ce pas — y compris
   * ceux de mort : `playerDied` arrive dans les événements du pas courant, il
   * n'y a pas de passe finale à faire après.
   */
  step(world: SimWorld): AchievementDef[]
  reset(spawnX: number, spawnY: number): void
  /** La trace de la partie en cours — `game.ts` y lit les genres rencontrés. */
  readonly trace: RunTrace
  /** Vrai tant que `clean-wave` ou `clean-three` reste à acquérir. */
  readonly needsProximity: boolean
}

export function createTracker(): Tracker {
  let trace: RunTrace = createTrace(0, 0)
  /** Ce qui reste à gagner. Un succès acquis n'est plus évalué. */
  let pending: AchievementDef[] = []

  /** Fonction locale plutôt que `this` : `step` s'en sert, et un objet
   *  littéral rendu par `createTracker` ne garantit pas son `this` à l'appel. */
  const needsProximity = (): boolean => pending.some((def) => PROXIMITY_IDS.includes(def.id))

  const evaluate = (): AchievementDef[] => {
    const opened: AchievementDef[] = []
    for (const def of pending) {
      if (def.done(trace)) {
        opened.push(def)
      }
    }
    if (opened.length > 0) {
      pending = pending.filter((def) => !opened.includes(def))
      for (const def of opened) {
        // Écrit tout de suite, pas à la fin de la partie : un onglet fermé en
        // pleine partie ne doit rien coûter au joueur.
        unlock(def.id)
      }
    }
    return opened
  }

  return {
    get needsProximity(): boolean {
      return needsProximity()
    },

    get trace(): RunTrace {
      return trace
    },

    reset(spawnX: number, spawnY: number): void {
      trace = createTrace(spawnX, spawnY)
      const unlocked = readUnlocked()
      pending = ACHIEVEMENTS.filter((def) => !unlocked.has(def.id))
    },

    step(world: SimWorld): AchievementDef[] {
      const measure = needsProximity() && trace.steps % PROXIMITY_EVERY === 0
      advanceTrace(
        trace,
        world,
        measure ? nearestActiveEnemyDistance(world) : Number.POSITIVE_INFINITY,
      )
      return evaluate()
    },
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/achievements/tracker.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 7: Vérifier que la simulation n’a pas bougé**

Run: `npm test`
Expected: PASS — `determinism.test.ts` et `purity.test.ts` compris.

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add src/app/achievements/proximity.ts src/app/achievements/tracker.ts src/app/achievements/tracker.test.ts src/sim/systems/collision.ts
git commit -m "feat(achievements): le traqueur, et la mesure de proximité"
```

---

## Task 6: Branchement dans le jeu

**Files:**
- Modify: `src/app/game.ts`

**Interfaces:**
- Consumes: `createTracker` (tâche 5), `readSkin`/`readUnlocked` (tâche 4), `Stage.setSkin` (tâche 1).
- Produces: `run.unlocked: AchievementDef[]` accumulé pendant la partie, consommé par les tâches 10 et 11.

À la fin de cette tâche, les succès se débloquent réellement en jouant — vérifiable dans
`localStorage`, sans une ligne d'interface.

- [ ] **Step 1: Importer et instancier le traqueur**

Dans `src/app/game.ts`, ajouter aux imports :

```ts
import type { AchievementDef } from './achievements/catalog'
import { readSkin, readUnlocked } from './achievements/store'
import { createTracker } from './achievements/tracker'
```

Dans `startGame`, juste après `const juice = createJuiceState()` :

```ts
  const tracker = createTracker()
  /** Les succès ouverts pendant la partie en cours — bandeau et écran de fin. */
  let unlockedThisRun: AchievementDef[] = []
```

- [ ] **Step 2: Supprimer les deux compteurs redondants**

Dans `startGame`, supprimer les déclarations :

```ts
  let seenPowerups = new Set<PowerUpKind>()
  let killCount = 0
```

Dans `startRun()`, supprimer les deux lignes correspondantes (`seenPowerups = new Set()` et
`killCount = 0`) et ajouter à la place :

```ts
    const eid = run.world.playerEid
    tracker.reset(Position.x[eid] ?? 0, Position.y[eid] ?? 0)
    unlockedThisRun = []
    stage.setSkin(readSkin(readUnlocked()))
```

L'import de `PowerUpKind` reste nécessaire ? Non : `POWERUP_BY_ID` et `PowerUpKind` ne
servaient qu'à `seenPowerups`. Supprimer la ligne d'import
`import { POWERUP_BY_ID, type PowerUpKind } from '@/sim/data/powerups'` si plus rien ne
l'utilise — `npm run lint` le signalera sinon.

- [ ] **Step 3: Alléger `handleSimEvents`**

Remplacer le corps de `handleSimEvents` par :

```ts
  function handleSimEvents(): void {
    for (const event of run.world.events) {
      if (event.type === 'waveEnded') {
        onWaveEnded(event.wave)
      } else if (event.type === 'playerDied') {
        machine.send('DIED')
        deathSequence.start(run.world, event.x, event.y, ARENA.width, ARENA.height)
      }
    }
  }
```

Les branches `enemyKilled` et `powerupPicked` disparaissent : la trace tient les deux
compteurs, et deux sources pour un même nombre finissent toujours par diverger d'un
événement.

- [ ] **Step 4: Avancer le traqueur à chaque pas, AVANT `handleSimEvents`**

Dans `loop.onStep`, l'ordre est contraint et se commente :

```ts
        // Avant `handleSimEvents` : celle-ci tire les cartes d'amélioration à
        // la fin d'une vague, et le tirage lit `trace.powerupsPicked`. Une
        // pastille ramassée au pas exact où la vague tombe — `pickupSystem`
        // s'exécute avant `waveSystem` — doit compter pour ce tirage-là.
        unlockedThisRun.push(...tracker.step(run.world))
        handleSimEvents()
```

Et l'appel nu à `handleSimEvents()` qui suivait disparaît : il est désormais dans ce bloc.

- [ ] **Step 5: Réparer les deux lecteurs des compteurs supprimés**

Dans `onWaveEnded`, la ligne du tirage devient :

```ts
    const cards = drawUpgrades(rng, {
      wave,
      ownedIds,
      mythicTaken,
      seenPowerups: tracker.trace.powerupsPicked,
    })
```

`Tracker.trace` est déjà exposée par la tâche 5 : rien à ajouter côté traqueur.

Dans `onEnterGameOver`, `kills: killCount` devient `kills: tracker.trace.kills`.

- [ ] **Step 6: Poser le tracé équipé au démarrage**

Juste après `menuScreen.show()` (avant `syncArenaVisibility()`) :

```ts
  stage.setSkin(readSkin(readUnlocked()))
```

- [ ] **Step 7: Vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Expected: aucune erreur, toute la suite verte.

Run: `npm run dev`, jouer 10 secondes, mourir sans tuer d'ennemi, puis en console :
`localStorage.getItem('inkpoint.achievements')`
Expected: contient `blank-page` et `false-start` ou `back-to-inkwell` selon la partie.

- [ ] **Step 8: Commit**

```bash
git add src/app/game.ts src/app/achievements/tracker.ts
git commit -m "feat(achievements): brancher le traqueur sur la boucle de jeu"
```

---

## Task 7: Nettoyages d'interface préparatoires

**Files:**
- Create: `src/ui/components/ink-frame.ts`
- Create: `src/ui/components/card-grid.ts`
- Modify: `src/ui/components/card.ts`
- Modify: `src/ui/screens/menu.ts`
- Modify: `src/ui/components/card.test.ts`

Aucun changement visuel : cette tâche déplace du code pour que les trois grilles à venir
ne recopient pas la même géométrie. Les tests existants doivent passer **sans être
modifiés**, à l'exception du chemin d'import de `frameJitter`.

**Interfaces:**
- Produces:
  - `function frameJitter(id: string, index: number): number` (déplacée)
  - `function inkFrame(id: string, inset: number, seedOffset: number): string` (déplacée, désormais exportée)
  - `const CARD_GRID_CLASS: string`

- [ ] **Step 1: Créer `ink-frame.ts`**

Déplacer `JITTER_PX`, `frameJitter` et `inkFrame` de `src/ui/components/card.ts` vers
`src/ui/components/ink-frame.ts`, sans en changer une ligne, en exportant `inkFrame` :

```ts
/** Déviation maximale d'un sommet du cadre, en pixels. */
const JITTER_PX = 2.5

/**
 * Déviation d'un sommet du cadre, dérivée de l'identifiant de la carte et
 * jamais d'un tirage : `render()` est rappelé à chaque déplacement dans le
 * menu, et un cadre retiré au hasard scintillerait à chaque changement de
 * sélection.
 */
export function frameJitter(id: string, index: number): number {
  let h = index * 2654435761
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0
  }
  return ((h % 1000) / 999) * 2 * JITTER_PX - JITTER_PX
}

/**
 * Quadrilatère légèrement irrégulier : un trait de plume, pas un filet.
 * Partagé par les trois familles de cartes — améliorations, succès, tracés :
 * recopié, il divergerait au premier ajustement de `JITTER_PX`.
 */
export function inkFrame(id: string, inset: number, seedOffset: number): string {
  const j = (n: number): number => frameJitter(id, n + seedOffset)
  const w = 100
  const h = 140
  const pts = [
    [inset + j(0), inset + j(1)],
    [w - inset + j(2), inset + j(3)],
    [w - inset + j(4), h - inset + j(5)],
    [inset + j(6), h - inset + j(7)],
  ]
  return `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`
}
```

Dans `src/ui/components/card.ts`, supprimer ces trois blocs et ajouter :

```ts
import { inkFrame } from './ink-frame'
```

- [ ] **Step 2: Rediriger le test existant**

Dans `src/ui/components/card.test.ts`, remplacer l'import de `frameJitter` depuis `./card`
par `./ink-frame`. Ne toucher à rien d'autre : les assertions doivent passer telles quelles,
c'est ce qui prouve que le déplacement est neutre.

- [ ] **Step 3: Créer `card-grid.ts`**

```ts
/**
 * Géométrie commune aux grilles de cartes — améliorations, succès, tracés.
 *
 * Les pistes sont calées sur la taille de `renderCard` (largeur `9,5 × --ui`,
 * hauteur déduite de son `aspect-[5/7]`, soit `13,3 × --ui`), jamais laissées
 * libres :
 * — `auto-rows` : sans hauteur de rangée explicite, les rangées implicites se
 *   calculaient sur le seul contenu texte des cartes, plus court que la carte
 *   elle-même, et chaque rangée chevauchait la suivante ;
 * — `grid-cols` en `repeat(auto-fill, …)` plutôt que `grid-cols-4` : à quatre
 *   colonnes imposées, une fenêtre étroite réduit chaque piste sous la largeur
 *   de la carte, qui déborde alors sur sa voisine.
 * Le plafond de `42 × --ui` tient quatre cartes et leurs trois écarts sur une
 * ligne — sans lui, un grand écran en alignerait neuf, bord à bord. Le
 * conteneur est en `border-box` et porte lui-même `p-[calc(var(--ui)*0.4)]` :
 * la largeur de contenu réelle est donc `42 − 0,8 = 41,2 × --ui`, contre
 * `4 × 9,5 + 3 × 0,8 = 40,4 × --ui` requis pour quatre pistes — 0,8 unité de
 * marge, pas plus. Les 80vw gardent une marge de chaque côté quand l'écran est
 * plus étroit.
 *
 * Ces valeurs sont solidaires de `renderCard` : les changer sans le suivre
 * casse les trois grilles en silence.
 */
export const CARD_GRID_CLASS =
  'grid max-h-[70vh] max-w-[min(80vw,calc(var(--ui)*42))] auto-rows-[calc(var(--ui)*13.3)] grid-cols-[repeat(auto-fill,calc(var(--ui)*9.5))] content-start justify-center gap-[calc(var(--ui)*0.8)] overflow-y-auto p-[calc(var(--ui)*0.4)]'
```

- [ ] **Step 4: Employer le helper dans le menu**

Dans `src/ui/screens/menu.ts`, remplacer le commentaire de quinze lignes et la longue chaîne
de classes de `renderUpgrades` par :

```ts
  const renderUpgrades = (): string => `
    <h2 class="ui-2xl tracking-wide">${t('menu.upgrades')}</h2>
    <div class="${CARD_GRID_CLASS}">
      ${UPGRADES.map((card) => renderCard(card, false)).join('')}
    </div>
    <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
    <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
  `
```

et ajouter l'import :

```ts
import { CARD_GRID_CLASS } from '../components/card-grid'
```

- [ ] **Step 5: Vérifier que rien n’a bougé**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

Run: `npm run dev`, ouvrir « Améliorations » au menu.
Expected: la grille est **identique** à avant — même largeur, mêmes rangées, même défilement.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/ink-frame.ts src/ui/components/card-grid.ts src/ui/components/card.ts src/ui/components/card.test.ts src/ui/screens/menu.ts
git commit -m "refactor(ui): extraire le cadre d'encre et la géométrie de grille"
```

---

## Task 8: La vitrine des succès

**Files:**
- Create: `src/ui/components/achievement-card.ts`
- Create: `src/ui/components/achievement-card.test.ts`
- Modify: `src/ui/screens/menu.ts`

**Interfaces:**
- Consumes: `ACHIEVEMENTS` (tâche 3), `readUnlocked` (tâche 4), `inkFrame` et `CARD_GRID_CLASS` (tâche 7), `nibPath` (tâche 1).
- Produces: `function renderAchievementCard(def: AchievementDef, unlocked: boolean): string`

- [ ] **Step 1: Write the failing test**

Créer `src/ui/components/achievement-card.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { ACHIEVEMENTS } from '@/app/achievements/catalog'
import { setLocale } from '@/i18n'
import { renderAchievementCard } from './achievement-card'

function def(id: string) {
  const found = ACHIEVEMENTS.find((a) => a.id === id)
  if (!found) {
    throw new Error(`succès inconnu : ${id}`)
  }
  return found
}

describe('renderAchievementCard', () => {
  it('affiche le nom et la condition', () => {
    setLocale('fr')
    const html = renderAchievementCard(def('wave-10'), true)
    expect(html).toContain('Le carnet')
    expect(html).toContain('Atteindre la vague 10')
  })

  // La condition est l'invitation à jouer : la cacher derrière un point
  // d'interrogation ne dit rien à personne.
  it('montre la condition même verrouillé', () => {
    setLocale('fr')
    const html = renderAchievementCard(def('blank-page'), false)
    expect(html).toContain('Mourir sans avoir tué un seul ennemi')
    expect(html).toContain('VERROUILLÉ')
  })

  it('annonce le tracé ouvert', () => {
    setLocale('fr')
    expect(renderAchievementCard(def('wave-10'), true)).toContain('La Bille')
  })

  it('n’annonce rien pour un succès honorifique', () => {
    setLocale('fr')
    expect(renderAchievementCard(def('wave-5'), true)).not.toContain('Ouvre')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/components/achievement-card.test.ts`
Expected: FAIL — `Failed to resolve import "./achievement-card"`

- [ ] **Step 3: Write the implementation**

Créer `src/ui/components/achievement-card.ts` :

```ts
import type { AchievementDef } from '@/app/achievements/catalog'
import { t } from '@/i18n'
import { nibPath } from '@/render/views/nibs'
import { inkFrame } from './ink-frame'

/**
 * Composant frère de `renderCard`, pas une extension : celle-ci est typée
 * `UpgradeDef` et sa lecture de rareté n'a pas d'équivalent ici. Les deux
 * partagent la géométrie (`card-grid.ts`) et le cadre (`ink-frame.ts`), pas la
 * structure.
 *
 * Un succès verrouillé garde son titre et sa condition, en creux : rien n'est
 * caché, la condition est ce qui donne envie d'y retourner.
 */
export function renderAchievementCard(def: AchievementDef, unlocked: boolean): string {
  const frame = inkFrame(def.id, 4, 0)
  const stroke = unlocked ? 'stroke-paper/55' : 'stroke-paper/25'
  const glyph = def.skin
    ? `<svg viewBox="-16 -16 32 32" width="1.85em" height="1.85em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg>`
    : ''
  const reward = def.skin
    ? `<span class="ui-2xs tracking-[0.15em] opacity-60">${t('achievements.reward', { skin: t(`skin.${def.skin}.name`) })}</span>`
    : ''
  const state = unlocked
    ? `<span class="ui-2xs tracking-[0.2em] opacity-60">${t(`family.${def.family}`)}</span>`
    : `<span class="ui-2xs tracking-[0.2em] opacity-45">${t('achievements.locked')}</span>`

  return `
    <div class="relative aspect-[5/7] w-[calc(var(--ui)*9.5)] overflow-hidden rounded text-paper ${unlocked ? '' : 'opacity-45'}">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
        <path d="${frame}" fill="none" class="${stroke}" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="flex h-full flex-col items-center justify-center gap-[calc(var(--ui)*0.4)] px-[calc(var(--ui)*0.8)] text-center">
        ${glyph}
        <h3 class="ui-sm leading-tight">${t(`achievement.${def.id}.name`)}</h3>
        <p class="ui-xs leading-snug opacity-75">${t(`achievement.${def.id}.desc`)}</p>
        ${reward}
        ${state}
      </div>
    </div>
  `
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/components/achievement-card.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Ajouter l’entrée et la vue au menu**

Dans `src/ui/screens/menu.ts` :

1. Élargir le type et la liste :

```ts
type Entry = 'play' | 'achievements' | 'skins' | 'upgrades' | 'settings'
const ENTRIES: readonly Entry[] = ['play', 'achievements', 'skins', 'upgrades', 'settings']
const ENTRY_LABEL_KEY: Record<Entry, string> = {
  play: 'menu.play',
  achievements: 'menu.achievements',
  skins: 'menu.skins',
  upgrades: 'menu.upgrades',
  settings: 'menu.settings',
}
```

2. Élargir l'état de vue :

```ts
  let view: 'main' | 'upgrades' | 'achievements' = 'main'
```

3. Ajouter le rendu, après `renderUpgrades` :

```ts
  const renderAchievements = (): string => {
    const unlocked = readUnlocked()
    return `
      <h2 class="ui-2xl tracking-wide">${t('achievements.title')}</h2>
      <div class="ui-xs tracking-[0.2em] opacity-50">${t('achievements.progress', {
        done: unlocked.size,
        total: ACHIEVEMENTS.length,
      })}</div>
      <div class="${CARD_GRID_CLASS}">
        ${ACHIEVEMENTS.map((def) => renderAchievementCard(def, unlocked.has(def.id))).join('')}
      </div>
      <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
    `
  }
```

4. Router dans `activate` et `render` :

```ts
    } else if (entry === 'achievements') {
      view = 'achievements'
      render()
    }
```

```ts
  const render = (): void => {
    if (view === 'main') {
      el.innerHTML = renderMain()
    } else if (view === 'upgrades') {
      el.innerHTML = renderUpgrades()
    } else {
      el.innerHTML = renderAchievements()
    }
    bindItemActivation(el, nav, activate)
    el.querySelector<HTMLElement>('[data-menu-back]')?.addEventListener('click', leaveUpgrades)
  }
```

5. Renommer `leaveUpgrades` en `leaveSubview` (même corps) et mettre à jour ses deux
   appels, dont celui de `handleKey`, dont la condition devient :

```ts
      if (view !== 'main') {
```

6. Ajouter les imports :

```ts
import { ACHIEVEMENTS } from '@/app/achievements/catalog'
import { readUnlocked } from '@/app/achievements/store'
import { renderAchievementCard } from '../components/achievement-card'
```

- [ ] **Step 6: Vérifier à l’œil**

Run: `npm run dev`
Expected: cinq entrées au menu ; « Succès » ouvre une grille de 24 cartes avec le compteur
`0 / 24` ; `Échap` revient ; la grille défile sans déborder sur une fenêtre étroite.

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/achievement-card.ts src/ui/components/achievement-card.test.ts src/ui/screens/menu.ts
git commit -m "feat(achievements): la vitrine des succès au menu"
```

---

## Task 9: La vitrine des tracés

**Files:**
- Create: `src/ui/components/nib-tile.ts`
- Create: `src/ui/components/nib-tile.test.ts`
- Modify: `src/ui/screens/menu.ts`

**Interfaces:**
- Consumes: `SKIN_IDS`/`nibPath` (tâche 1), `ACHIEVEMENT_BY_SKIN` (tâche 3), `readUnlocked`/`unlockedSkins`/`readSkin`/`equipSkin` (tâche 4).
- Produces: `function renderNibTile(skin: SkinId, state: { unlocked: boolean; equipped: boolean; selected: boolean }): string`

- [ ] **Step 1: Write the failing test**

Créer `src/ui/components/nib-tile.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { setLocale } from '@/i18n'
import { renderNibTile } from './nib-tile'

const state = { unlocked: true, equipped: false, selected: false }

describe('renderNibTile', () => {
  it('nomme le tracé et dessine sa silhouette', () => {
    setLocale('fr')
    const html = renderNibTile('ball', state)
    expect(html).toContain('La Bille')
    expect(html).toContain('<path')
  })

  it('marque le tracé équipé', () => {
    setLocale('fr')
    expect(renderNibTile('quill', { ...state, equipped: true })).toContain('ÉQUIPÉ')
  })

  // Un tracé fermé doit dire par quoi il s'ouvre : sans cela, la vitrine
  // n'est qu'une liste de choses qu'on n'a pas.
  it('nomme le succès qui ouvre un tracé verrouillé', () => {
    setLocale('fr')
    expect(renderNibTile('ball', { ...state, unlocked: false })).toContain('Le carnet')
  })

  it('n’exige aucun succès pour la plume', () => {
    setLocale('fr')
    expect(renderNibTile('quill', state)).not.toContain('VERROUILLÉ')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/components/nib-tile.test.ts`
Expected: FAIL — `Failed to resolve import "./nib-tile"`

- [ ] **Step 3: Write the implementation**

Créer `src/ui/components/nib-tile.ts` :

```ts
import { ACHIEVEMENT_BY_SKIN } from '@/app/achievements/catalog'
import { t } from '@/i18n'
import { nibPath, type SkinId } from '@/render/views/nibs'
import { inkFrame } from './ink-frame'

export interface NibTileState {
  unlocked: boolean
  equipped: boolean
  selected: boolean
}

/**
 * La silhouette est rendue par `nibPath`, la même liste de sommets que Pixi
 * trace en jeu : la vitrine ne peut pas montrer autre chose que ce qu'on
 * jouera.
 */
export function renderNibTile(skin: SkinId, state: NibTileState): string {
  const source = ACHIEVEMENT_BY_SKIN[skin]
  const footer = state.equipped
    ? `<span class="ui-2xs tracking-[0.2em] opacity-70">${t('skins.equipped')}</span>`
    : state.unlocked
      ? ''
      : `<span class="ui-2xs tracking-[0.15em] opacity-55">${source ? t(`achievement.${source.id}.name`) : ''}</span>`

  return `
    <div class="relative aspect-[5/7] w-[calc(var(--ui)*9.5)] overflow-hidden rounded text-paper transition-transform ${state.selected ? 'scale-105' : 'scale-95'} ${state.unlocked ? '' : 'opacity-40'}">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
        <path d="${inkFrame(skin, 4, 0)}" fill="none" class="${state.selected ? 'stroke-paper/75' : 'stroke-paper/40'}" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="flex h-full flex-col items-center justify-center gap-[calc(var(--ui)*0.5)] px-[calc(var(--ui)*0.6)] text-center">
        <svg viewBox="-16 -16 32 32" width="3em" height="3em" aria-hidden="true"><path d="${nibPath(skin)}" fill="currentColor" /></svg>
        <h3 class="ui-sm leading-tight">${t(`skin.${skin}.name`)}</h3>
        ${footer}
      </div>
    </div>
  `
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/components/nib-tile.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Ajouter la vue au menu**

Dans `src/ui/screens/menu.ts` :

1. Élargir l'état de vue et ajouter une navigation propre à la vitrine — celle du menu
   compte cinq entrées, elle ne peut pas servir ici :

```ts
  let view: 'main' | 'upgrades' | 'achievements' | 'skins' = 'main'
  const skinNav = createMenuNav(SKIN_IDS.length)
```

2. Ajouter le rendu :

```ts
  const renderSkins = (): string => {
    const unlocked = readUnlocked()
    const available = new Set(unlockedSkins(unlocked))
    const equipped = readSkin(unlocked)
    return `
      <h2 class="ui-2xl tracking-wide">${t('skins.title')}</h2>
      <div class="${CARD_GRID_CLASS}">
        ${SKIN_IDS.map((skin, i) =>
          renderNibTile(skin, {
            unlocked: available.has(skin),
            equipped: skin === equipped,
            selected: i === skinNav.index,
          }),
        ).join('')}
      </div>
      <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('skins.hint')}</div>
    `
  }
```

3. Router dans `activate` (`entry === 'skins'` → `view = 'skins'`, `skinNav.reset()`,
   `render()`) et dans `render` (`view === 'skins'` → `renderSkins()`).

4. Gérer les touches de la vitrine, en tête de `handleKey`, avant le bloc `view !== 'main'` :

```ts
      if (view === 'skins') {
        if (NAV_LEFT_CODES.includes(code)) {
          skinNav.move(-1)
          render()
          return true
        }
        if (NAV_RIGHT_CODES.includes(code)) {
          skinNav.move(1)
          render()
          return true
        }
        if (code === 'Space' || code === 'Enter') {
          equipSelectedSkin()
          return true
        }
        if (code === 'Escape') {
          leaveSubview()
          return true
        }
        return false
      }
```

5. Ajouter l'action d'équipement, au-dessus de `render` :

```ts
  /** N'équipe que ce qui est gagné : la tuile verrouillée ne fait rien. */
  const equipSelectedSkin = (): void => {
    const unlocked = readUnlocked()
    const skin = SKIN_IDS[skinNav.index]
    if (!skin || !unlockedSkins(unlocked).includes(skin)) {
      return
    }
    equipSkin(skin)
    actions.onSkinChange(skin)
    render()
  }
```

6. Ajouter `onSkinChange(skin: SkinId): void` à `MenuActions`, et dans `src/app/game.ts`,
   au `createMenuScreen` :

```ts
    onSkinChange(skin): void {
      stage.setSkin(skin)
    },
```

7. Compléter les imports du menu :

```ts
import { equipSkin, readSkin, readUnlocked, unlockedSkins } from '@/app/achievements/store'
import { type SkinId, SKIN_IDS } from '@/render/views/nibs'
import { renderNibTile } from '../components/nib-tile'
```

et ajouter `NAV_LEFT_CODES`, `NAV_RIGHT_CODES` à l'import existant de `../menu-nav`.

- [ ] **Step 6: Vérifier à l’œil**

Run: `npm run dev`
Expected: « Tracés » montre sept tuiles, la Plume seule ouverte et marquée « ÉQUIPÉ » ; les
six autres en creux avec le nom du succès qui les ouvre ; `←`/`→` déplacent la sélection ;
`Espace` sur une tuile verrouillée ne fait rien.

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/nib-tile.ts src/ui/components/nib-tile.test.ts src/ui/screens/menu.ts src/app/game.ts
git commit -m "feat(achievements): la vitrine des tracés et leur équipement"
```

---

## Task 10: Le bandeau en jeu

**Files:**
- Create: `src/ui/screens/hud-badge.ts`
- Create: `src/ui/screens/hud-badge.test.ts`
- Modify: `src/ui/screens/hud.ts`
- Modify: `src/app/game.ts`

**Interfaces:**
- Consumes: `AchievementDef` (tâche 3), `nibPath` (tâche 1).
- Produces:
  - `interface BadgeView { readonly element: HTMLElement; push(def: AchievementDef): void; update(dtMs: number): void; clear(): void }`
  - `function createBadgeView(): BadgeView`
  - `const BADGE_MS = 2500`
  - `Hud.announce(def: AchievementDef): void`

- [ ] **Step 1: Write the failing test**

Créer `src/ui/screens/hud-badge.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { ACHIEVEMENTS } from '@/app/achievements/catalog'
import { setLocale } from '@/i18n'
import { BADGE_MS, createBadgeView } from './hud-badge'

function def(id: string) {
  const found = ACHIEVEMENTS.find((a) => a.id === id)
  if (!found) {
    throw new Error(`succès inconnu : ${id}`)
  }
  return found
}

describe('bandeau de succès', () => {
  it('reste vide tant que rien n’est ouvert', () => {
    expect(createBadgeView().element.classList.contains('hidden')).toBe(true)
  })

  it('affiche le titre du succès poussé', () => {
    setLocale('fr')
    const badge = createBadgeView()
    badge.push(def('wave-10'))
    badge.update(0)
    expect(badge.element.textContent).toContain('Le carnet')
    expect(badge.element.classList.contains('hidden')).toBe(false)
  })

  // Deux succès ouverts au même pas doivent défiler, pas se superposer.
  it('enchaîne la file un succès à la fois', () => {
    setLocale('fr')
    const badge = createBadgeView()
    badge.push(def('wave-5'))
    badge.push(def('wave-10'))
    badge.update(0)
    expect(badge.element.textContent).toContain('Cinquième page')

    badge.update(BADGE_MS)
    expect(badge.element.textContent).toContain('Le carnet')

    badge.update(BADGE_MS)
    expect(badge.element.classList.contains('hidden')).toBe(true)
  })

  it('se vide entre deux parties', () => {
    const badge = createBadgeView()
    badge.push(def('wave-5'))
    badge.clear()
    badge.update(0)
    expect(badge.element.classList.contains('hidden')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/screens/hud-badge.test.ts`
Expected: FAIL — `Failed to resolve import "./hud-badge"`

- [ ] **Step 3: Write the implementation**

Créer `src/ui/screens/hud-badge.ts` :

```ts
import type { AchievementDef } from '@/app/achievements/catalog'
import { t } from '@/i18n'
import { nibPath } from '@/render/views/nibs'

/** Durée d'affichage d'un succès, en ms d'horloge réelle. */
export const BADGE_MS = 2500

export interface BadgeView {
  readonly element: HTMLElement
  /** Met un succès en file. Deux succès du même pas défilent l'un après l'autre. */
  push(def: AchievementDef): void
  /** `dtMs` en temps réel : le bandeau ne doit pas geler avec un hitstop. */
  update(dtMs: number): void
  clear(): void
}

/**
 * Le bandeau des succès, en haut de l'arène. Il suit les règles du HUD :
 * `pointer-events-none`, opacité contenue, et une transition que
 * `.reduced-motion` coupe (`main.css`). Dans un jeu où une demi-seconde
 * d'attention coûte la partie, un bandeau qui bouge trop est un piège.
 */
export function createBadgeView(): BadgeView {
  const element = document.createElement('div')
  element.className =
    'pointer-events-none absolute left-1/2 top-4 hidden -translate-x-1/2 items-center gap-[0.6em] rounded border border-paper/25 bg-ink-deep/70 px-[1em] py-[0.35em] text-paper opacity-90 transition-opacity'

  const queue: AchievementDef[] = []
  let current: AchievementDef | null = null
  let remaining = 0

  const show = (def: AchievementDef | null): void => {
    current = def
    if (!def) {
      element.classList.add('hidden')
      element.classList.remove('flex')
      element.innerHTML = ''
      return
    }
    const glyph = def.skin
      ? `<svg viewBox="-16 -16 32 32" width="1.4em" height="1.4em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg>`
      : '<svg viewBox="-16 -16 32 32" width="1.4em" height="1.4em" aria-hidden="true"><circle cx="0" cy="0" r="7" fill="currentColor" /></svg>'
    element.innerHTML = `${glyph}<span class="ui-xs tracking-[0.15em]">${t(`achievement.${def.id}.name`)}</span>`
    element.classList.remove('hidden')
    element.classList.add('flex')
  }

  return {
    element,

    push(def: AchievementDef): void {
      queue.push(def)
    },

    update(dtMs: number): void {
      if (current) {
        remaining -= dtMs
        if (remaining > 0) {
          return
        }
      }
      const next = queue.shift() ?? null
      if (next) {
        remaining = BADGE_MS
        show(next)
      } else if (current) {
        show(null)
      }
    },

    clear(): void {
      queue.length = 0
      remaining = 0
      show(null)
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/screens/hud-badge.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Monter le bandeau dans le HUD**

Dans `src/ui/screens/hud.ts` :

1. Ajouter à l'interface `Hud`, avant `destroy()` :

```ts
  /** Met un succès en file dans le bandeau. */
  announce(def: AchievementDef): void
  /** Fait avancer le bandeau sur l'horloge réelle. */
  tick(dtMs: number): void
  /** Vide la file entre deux parties. */
  clearAnnouncements(): void
```

2. Dans `createHud`, après la construction de `el` et de ses blocs :

```ts
  const badge = createBadgeView()
  el.appendChild(badge.element)
```

3. Ajouter les trois méthodes à l'objet retourné :

```ts
    announce(def: AchievementDef): void {
      badge.push(def)
    },
    tick(dtMs: number): void {
      badge.update(dtMs)
    },
    clearAnnouncements(): void {
      badge.clear()
    },
```

4. Ajouter les imports :

```ts
import type { AchievementDef } from '@/app/achievements/catalog'
import { createBadgeView } from './hud-badge'
```

- [ ] **Step 6: Alimenter le bandeau depuis la boucle**

Dans `src/app/game.ts` :

1. Dans `loop.onStep`, remplacer la ligne ajoutée en tâche 6 par :

```ts
        const opened = tracker.step(run.world)
        unlockedThisRun.push(...opened)
        for (const def of opened) {
          // Rien au bandeau quand le pas courant est celui de la mort : les
          // trois succès qui ne se décident que là — Page blanche, Faux départ,
          // Retour à l'encrier — n'ont pas de bandeau, et c'est voulu, le
          // récapitulatif de fin les annonce. On lit `trace.died` et non l'état
          // de la machine : `tracker.step` passe AVANT `handleSimEvents` (voir
          // tâche 6), donc la machine est encore en `playing` à cet instant.
          if (!tracker.trace.died) {
            hud.announce(def)
          }
        }
```

2. Dans `frame`, juste avant `loop.advance(dt)` :

```ts
    // Sur l'horloge réelle et hors de tout état : le bandeau doit finir de
    // défiler même si la simulation s'est arrêtée à la mort du joueur.
    hud.tick(dt)
```

3. Dans `startRun()`, ajouter :

```ts
    hud.clearAnnouncements()
```

- [ ] **Step 7: Vérifier à l’œil**

Run: `npm run dev`, jouer jusqu'à la vague 5.
Expected: le bandeau « Cinquième page » apparaît en haut, tient environ 2,5 s, disparaît ;
il ne masque ni le score ni la vague ; avec `prefers-reduced-motion` actif, il apparaît sans
transition.

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens/hud-badge.ts src/ui/screens/hud-badge.test.ts src/ui/screens/hud.ts src/app/game.ts
git commit -m "feat(achievements): le bandeau d'annonce en jeu"
```

---

## Task 11: Le récapitulatif de fin de partie

**Files:**
- Modify: `src/ui/screens/gameover.ts`
- Modify: `src/app/game.ts`

**Interfaces:**
- Consumes: `AchievementDef` (tâche 3), `unlockedThisRun` (tâche 6), `nibPath` (tâche 1).
- Produces: `GameOverStats.unlocked: readonly AchievementDef[]`

- [ ] **Step 1: Étendre les statistiques de fin**

Dans `src/ui/screens/gameover.ts`, ajouter à `GameOverStats` :

```ts
  /**
   * Les succès ouverts pendant la partie. La liste est complète : elle reliste
   * ce que le bandeau a déjà montré. Un joueur qui meurt trois secondes après
   * un déblocage ne doit pas avoir à se souvenir de ce qu'il a vu passer.
   */
  unlocked: readonly AchievementDef[]
```

et à l'état initial du module :

```ts
  let stats: GameOverStats = { score: 0, wave: 1, kills: 0, durationMs: 0, best: 0, unlocked: [] }
```

- [ ] **Step 2: Rendre la liste**

Dans `render()`, insérer entre le bloc `gameover.best` et le premier `data-action` :

```ts
      ${
        stats.unlocked.length === 0
          ? ''
          : `<div class="mt-[0.6em] flex flex-col items-center gap-[0.3em]">
        ${stats.unlocked
          .map((def) => {
            const glyph = def.skin
              ? `<svg viewBox="-16 -16 32 32" width="1.2em" height="1.2em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg>`
              : ''
            const reward = def.skin
              ? `<span class="ui-2xs opacity-60">${t('achievements.reward', { skin: t(`skin.${def.skin}.name`) })}</span>`
              : ''
            return `<div class="flex items-center gap-[0.5em]">
              ${glyph}
              <span class="ui-xs tracking-[0.12em]">${t(`achievement.${def.id}.name`)}</span>
              <span class="ui-2xs tracking-[0.2em] opacity-45">${t('gameover.unlocked')}</span>
              ${reward}
            </div>`
          })
          .join('')}
      </div>`
      }
```

et ajouter les imports :

```ts
import type { AchievementDef } from '@/app/achievements/catalog'
import { nibPath } from '@/render/views/nibs'
```

- [ ] **Step 3: Passer la liste depuis le jeu**

Dans `src/app/game.ts`, `onEnterGameOver`, ajouter le champ à l'objet passé à
`gameOverScreen.show` :

```ts
        unlocked: unlockedThisRun,
```

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

Run: `npm run dev`, mourir en moins de cinq secondes sans tuer d'ennemi.
Expected: l'écran de fin liste « Page blanche → La Tache », « Faux départ » et « Retour à
l'encrier », aucun n'ayant été annoncé par le bandeau puisqu'ils se décident à la mort.
La vitrine « Tracés » montre désormais la Tache ouverte, et l'équiper change la silhouette
en jeu — images rémanentes de la ruée comprises.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/gameover.ts src/app/game.ts
git commit -m "feat(achievements): le récapitulatif de fin de partie"
```

---

## Vérification finale

- [ ] `npm test` — toute la suite, `determinism.test.ts` et `purity.test.ts` compris
- [ ] `npm run typecheck && npm run lint`
- [ ] `npm run build`
- [ ] Une partie complète en français puis en anglais : aucune clé i18n brute à l'écran
- [ ] Les sept silhouettes se distinguent **en jeu**, sous le `boil`, en mouvement
- [ ] Le menu à cinq entrées tient sur une fenêtre basse (800 × 600)
