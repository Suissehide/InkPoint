# Arène fixe et cadrage — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Détacher l'arène de simulation de la taille de la fenêtre, pour que la difficulté soit identique pour tous les joueurs.

**Architecture:** L'arène devient une constante logique `1600 × 900`. Une fonction pure `computeViewport` calcule le zoom et le centrage ; un conteneur Pixi « viewport » porte cette transformation, découpe ce qui dépasse et applique la vignette au terrain plutôt qu'à la fenêtre. Le HUD, en DOM, est positionné sur le même rectangle.

**Tech Stack:** TypeScript strict, PixiJS v8, bitECS, Vitest, Biome, Tailwind v4.

**Spec :** `docs/superpowers/specs/2026-07-30-arene-fixe-design.md`

## Global Constraints

- Toute la documentation et tous les commentaires de code sont **en français**, comme le reste du dépôt. Les messages de commit suivent les conventional commits (commitlint est actif via husky).
- `src/render/` ne doit jamais écrire dans la simulation. `src/sim/` reste pur et déterministe.
- `src/render/` n'a pas droit à l'opérateur `!` (voir le commentaire de `at()` dans `src/render/stage.ts`) : lever une erreur explicite plutôt que mentir sur un type.
- Commentaires sobres : un résumé court quand il apporte quelque chose, pas de paraphrase du code.
- Vérifications avant chaque commit : `npm run typecheck`, `npm run lint`, `npm test`. Les trois doivent passer.
- **Ne jamais pousser vers origin.** Commits locaux uniquement.
- Un autre agent travaille parfois dans ce dépôt en parallèle : **relire chaque fichier avant de le modifier**, son contenu peut avoir changé depuis l'écriture de ce plan.

---

### Task 1 : `computeViewport`, la fonction pure de cadrage

**Files:**
- Create: `src/render/viewport.ts`
- Test: `src/render/viewport.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `interface Viewport { scale: number; x: number; y: number }` et `computeViewport(windowWidth: number, windowHeight: number, arenaWidth: number, arenaHeight: number): Viewport`. Les tâches 2, 3 et 5 en dépendent.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
// src/render/viewport.test.ts
import { describe, expect, it } from 'vitest'

import { computeViewport } from './viewport'

describe('computeViewport', () => {
  it('remplit exactement une fenêtre au même ratio', () => {
    expect(computeViewport(1600, 900, 1600, 900)).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('réduit sans marge quand la fenêtre est homothétique', () => {
    expect(computeViewport(800, 450, 1600, 900)).toEqual({ scale: 0.5, x: 0, y: 0 })
  })

  it('laisse une marge latérale sur une fenêtre plus large que l’arène', () => {
    expect(computeViewport(2100, 900, 1600, 900)).toEqual({ scale: 1, x: 250, y: 0 })
  })

  it('laisse une marge haute et basse sur une fenêtre plus haute que l’arène', () => {
    expect(computeViewport(1600, 1200, 1600, 900)).toEqual({ scale: 1, x: 0, y: 150 })
  })

  it('centre l’arène sur une fenêtre au ratio quelconque', () => {
    const v = computeViewport(1297, 924, 1600, 900)
    expect(v.scale).toBeCloseTo(0.8106, 4)
    expect(v.x).toBe(0)
    expect(v.y).toBeCloseTo(97.219, 3)
  })

  it('rétrécit sans jamais déborder sur une fenêtre minuscule', () => {
    const v = computeViewport(320, 240, 1600, 900)
    expect(v.scale).toBeLessThan(1)
    expect(1600 * v.scale).toBeLessThanOrEqual(320)
    expect(900 * v.scale).toBeLessThanOrEqual(240)
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/render/viewport.test.ts`
Expected: FAIL — `Failed to resolve import "./viewport"`.

- [ ] **Step 3 : écrire l'implémentation minimale**

```ts
// src/render/viewport.ts
/** Zoom et décalage de l'arène dans la fenêtre. */
export interface Viewport {
  scale: number
  x: number
  y: number
}

/**
 * Cadre l'arène dans la fenêtre en conservant son ratio : le zoom est le plus
 * petit des deux rapports, ce qui laisse une marge sur l'axe le moins
 * contraignant plutôt que de rogner l'aire de jeu.
 */
export function computeViewport(
  windowWidth: number,
  windowHeight: number,
  arenaWidth: number,
  arenaHeight: number,
): Viewport {
  const scale = Math.min(windowWidth / arenaWidth, windowHeight / arenaHeight)
  return {
    scale,
    x: (windowWidth - arenaWidth * scale) / 2,
    y: (windowHeight - arenaHeight * scale) / 2,
  }
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/render/viewport.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5 : commit**

```bash
git add src/render/viewport.ts src/render/viewport.test.ts
git commit -m "feat(render): add a pure arena-to-window fit computation"
```

---

### Task 2 : conteneur viewport dans la scène, sans changement visible

Le but de cette tâche est un **refactor à comportement identique**. L'arène vaut encore la fenêtre, donc `scale = 1` et le décalage est nul : le jeu doit être visuellement indiscernable d'avant. C'est ce qui permet d'isoler les bugs de plomberie Pixi de ceux du changement de géométrie (tâche 3).

**Files:**
- Modify: `src/render/stage.ts`
- Modify: `src/app/game.ts` (appel de `setViewport` dans le `resize` et au démarrage)

**Interfaces:**
- Consumes: `computeViewport`, `Viewport` (tâche 1).
- Produces: `stage.setViewport(viewport: Viewport): void` sur l'interface `Stage`. Les tâches 3, 4 et 5 en dépendent.

- [ ] **Step 1 : relire `src/render/stage.ts` en entier**

Un autre agent modifie ce dépôt. Lire le fichier avant d'écrire, notamment la construction de `worldLayer`, `particlesLayer`, l'affectation des filtres (`boil` sur `worldLayer`, `grain` et `vignette` sur `app.stage`), et `app.stage.filterArea`.

- [ ] **Step 2 : construire la hiérarchie de conteneurs**

Remplacer la construction actuelle des calques par celle-ci. Cible :

```
app.stage                     filters = [grain]        (plein écran)
└── viewport                  scale + position
    ├── clip                  Graphics, sert de masque
    └── content               mask = clip, filters = [vignette]
        ├── worldLayer        filters = [boil], porte la secousse
        └── particlesLayer
```

```ts
import { Application, Container, Graphics, Rectangle } from 'pixi.js'

// ...

const viewport = new Container()
app.stage.addChild(viewport)

// Découpe l'aire de jeu : les ennemis apparaissent 40 px hors de l'arène
// (sim/systems/waves.ts), il ne faut pas les voir dans la marge.
const clip = new Graphics()
viewport.addChild(clip)

const content = new Container()
content.mask = clip
viewport.addChild(content)

const worldLayer = new Container()
content.addChild(worldLayer)

const particlesLayer = new Container()
content.addChild(particlesLayer)
```

Les particules positionnent leurs `Graphics` en coordonnées monde (`src/render/particles.ts`) : elles **doivent** vivre sous `content`, sinon les éclaboussures se décaleraient du zoom.

- [ ] **Step 3 : déplacer la vignette sur le contenu, garder le grain plein écran**

```ts
worldLayer.filters = [boil]
// La vignette suit le terrain (son assombrissement et la teinte de danger
// doivent épouser l'arène, pas la fenêtre). Le grain reste plein écran : la
// marge est la page, elle a droit à son grain de papier.
content.filters = [vignette]
app.stage.filters = [grain]
app.stage.filterArea = app.screen
```

- [ ] **Step 4 : ajouter `setViewport` et redessiner le masque**

Ajouter à l'interface `Stage` :

```ts
  /** Applique le zoom et le centrage calculés par `computeViewport`. */
  setViewport(viewport: Viewport): void
```

et dans l'objet retourné :

```ts
    setViewport(viewport: Viewport): void {
      viewport_.scale.set(viewport.scale)
      viewport_.position.set(viewport.x, viewport.y)
      clip.clear().rect(0, 0, arenaWidth, arenaHeight).fill(0xffffff)
      content.filterArea = new Rectangle(0, 0, arenaWidth, arenaHeight)
    },
```

`createStage` prend désormais les dimensions de l'arène :

```ts
export async function createStage(
  canvas: HTMLCanvasElement,
  arenaWidth: number,
  arenaHeight: number,
): Promise<Stage>
```

(Renommer la variable locale du conteneur si `viewport` entre en collision avec le paramètre — par exemple `viewportLayer`.)

- [ ] **Step 5 : câbler depuis `game.ts`**

Relire `src/app/game.ts`, puis remplacer l'écouteur `resize` (aujourd'hui autour de la ligne 357) par :

```ts
  function applyLayout(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    stage.resize(w, h)
    const viewport = computeViewport(w, h, run.world.arena.width, run.world.arena.height)
    stage.setViewport(viewport)
  }

  window.addEventListener('resize', (): void => {
    run.world.arena.width = window.innerWidth
    run.world.arena.height = window.innerHeight
    applyLayout()
  })

  applyLayout()
```

La mutation de `world.arena` est **conservée à cette étape** : c'est la tâche 3 qui la supprime. Adapter aussi l'appel `createStage(canvas)` pour passer les dimensions.

- [ ] **Step 6 : vérifier l'absence de régression**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout passe, 227 tests (ou plus si l'autre agent en a ajouté).

Puis vérification visuelle — c'est le cœur de cette tâche :

```bash
npm run dev
```

Ouvrir le jeu **au premier plan** (`requestAnimationFrame` est gelé dans un onglet en arrière-plan, rien ne s'animera sinon), lancer une partie et confirmer : le jeu remplit la fenêtre exactement comme avant, la vignette assombrit les bords, le grain est présent, les éclaboussures d'encre tombent au bon endroit, la secousse fonctionne, et redimensionner la fenêtre ne casse rien.

Si la vignette disparaît ou se comporte mal une fois posée sur un conteneur masqué (risque Pixi identifié dans la spec), repli documenté : la laisser sur `app.stage` avec `grain`, et noter la limitation dans le commentaire — l'assombrissement suivra alors la fenêtre et non l'arène.

- [ ] **Step 7 : commit**

```bash
git add src/render/stage.ts src/app/game.ts
git commit -m "refactor(render): route the scene through a viewport container"
```

---

### Task 3 : basculer sur l'arène fixe

C'est la tâche qui change le jeu. À la fin, la marge apparaît sur les fenêtres qui ne sont pas en 16:9.

**Files:**
- Modify: `src/sim/world.ts` (export de `ARENA`)
- Modify: `src/app/game.ts` (`createRun`, `resize`)

**Interfaces:**
- Consumes: `stage.setViewport` (tâche 2), `computeViewport` (tâche 1).
- Produces: `export const ARENA = { width: 1600, height: 900 }` depuis `src/sim/world.ts`. Les tâches 4 et 5 l'utilisent.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
// à ajouter dans src/sim/world.test.ts
import { ARENA, createWorld } from './world'

describe('ARENA', () => {
  it("décrit une arène fixe en 16:9, indépendante de la fenêtre", () => {
    expect(ARENA).toEqual({ width: 1600, height: 900 })
    expect(ARENA.width / ARENA.height).toBeCloseTo(16 / 9, 5)
  })

  it("place le joueur au centre de l'arène de référence", () => {
    const w = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
    expect(w.arena).toEqual({ width: 1600, height: 900 })
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/sim/world.test.ts`
Expected: FAIL — `ARENA` n'est pas exporté.

- [ ] **Step 3 : exporter la constante**

Dans `src/sim/world.ts`, à côté de `FIXED_DT` :

```ts
/**
 * Arène logique, identique pour tous les joueurs quelle que soit la fenêtre :
 * la difficulté ne doit pas dépendre de la taille de l'écran. `createWorld`
 * reste paramétrable — les tests passent leurs propres dimensions.
 */
export const ARENA = { width: 1600, height: 900 } as const
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/sim/world.test.ts`
Expected: PASS.

- [ ] **Step 5 : utiliser l'arène fixe dans le jeu**

Dans `src/app/game.ts` :

```ts
import { ARENA, createWorld, FIXED_DT, type SimWorld } from '@/sim/world'

function createRun(): Run {
  const seed = Math.floor(Math.random() * 2 ** 31)
  const world = createWorld({ seed, width: ARENA.width, height: ARENA.height })
  spawnPlayer(world)
  return { world, stats: createRunStats(), seed }
}
```

et l'écouteur `resize` ne touche plus jamais l'arène :

```ts
  function applyLayout(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    stage.resize(w, h)
    stage.setViewport(computeViewport(w, h, ARENA.width, ARENA.height))
  }

  // L'arène ne change plus jamais de taille : redimensionner la fenêtre ne
  // modifie que le zoom, plus la difficulté.
  window.addEventListener('resize', applyLayout)
  applyLayout()
```

Passer `ARENA.width, ARENA.height` à `createStage`.

- [ ] **Step 6 : vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout passe.

Vérification visuelle (`npm run dev`, onglet au premier plan), en redimensionnant la fenêtre :
- fenêtre large et basse → marge à gauche et à droite ;
- fenêtre haute et étroite → marge en haut et en bas ;
- **aucun ennemi visible dans la marge** — c'est le masque de la tâche 2 qui le garantit ; si un ennemi apparaît dans la marge, le masque est mal posé ;
- le joueur se bloque contre un mur situé au bord de l'aire de jeu, pas au bord de la fenêtre ;
- redimensionner **pendant** une partie ne déplace ni les ennemis ni le joueur : seul le zoom change.

- [ ] **Step 7 : commit**

```bash
git add src/sim/world.ts src/sim/world.test.ts src/app/game.ts
git commit -m "feat(sim): pin the arena to a fixed 1600x900 logical size"
```

---

### Task 4 : cadre d'encre autour de l'aire de jeu

**Files:**
- Create: `src/render/frame.ts`
- Modify: `src/render/stage.ts`

**Interfaces:**
- Consumes: la hiérarchie de conteneurs de la tâche 2.
- Produces: `createFrame(width: number, height: number): Container`.

- [ ] **Step 1 : créer le cadre**

```ts
// src/render/frame.ts
import { Container, Graphics } from 'pixi.js'

import { INK } from './ink'

/**
 * Trait d'encre sur le pourtour de l'aire de jeu. Il rend le mur visible : le
 * joueur s'y bloque, mais rien ne le signalait jusqu'ici.
 */
export function createFrame(width: number, height: number): Container {
  const container = new Container()
  const gfx = new Graphics()
  gfx.rect(0.5, 0.5, width - 1, height - 1).stroke({ color: INK.paper, width: 1.5, alpha: 0.18 })
  container.addChild(gfx)
  return container
}
```

Vérifier le nom exact de la teinte claire dans `src/render/ink.ts` avant d'écrire `INK.paper` ; utiliser celle qui correspond au papier.

- [ ] **Step 2 : l'ajouter au-dessus des entités**

Dans `src/render/stage.ts`, après la création de `particlesLayer` :

```ts
// Au-dessus des entités et des particules : le mur se lit comme une bordure
// dessinée, pas comme un objet du jeu.
content.addChild(createFrame(arenaWidth, arenaHeight))
```

- [ ] **Step 3 : vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout passe.

Visuellement : un trait fin délimite l'aire de jeu, il se met à l'échelle avec elle, et il est distinct de la marge.

- [ ] **Step 4 : commit**

```bash
git add src/render/frame.ts src/render/stage.ts
git commit -m "feat(render): draw an ink frame around the play field"
```

---

### Task 5 : caler le HUD sur l'arène

**Files:**
- Modify: `src/ui/screens/hud.ts`
- Modify: `src/app/game.ts`

**Interfaces:**
- Consumes: `Viewport` (tâche 1), `ARENA` (tâche 3).
- Produces: `hud.setViewport(viewport: Viewport): void` sur l'interface `Hud`.

- [ ] **Step 1 : relire `src/ui/screens/hud.ts` en entier**

Ce fichier a évolué (bloc combo, durée de run, `punch`, `setVisible`). Ne pas se fier à une version mémorisée.

- [ ] **Step 2 : ajouter `setViewport`**

Le conteneur du HUD est aujourd'hui en `absolute inset-0`. Il faut abandonner `inset-0` pour un rectangle explicite :

```ts
  el.className = 'pointer-events-none absolute select-none text-paper'
```

Ajouter à l'interface `Hud` :

```ts
  /** Cale le HUD sur le rectangle de l'arène et suit son zoom. */
  setViewport(viewport: Viewport): void
```

et dans l'objet retourné :

```ts
    setViewport(viewport: Viewport): void {
      el.style.left = `${viewport.x}px`
      el.style.top = `${viewport.y}px`
      el.style.width = `${ARENA.width}px`
      el.style.height = `${ARENA.height}px`
      el.style.transformOrigin = 'top left'
      el.style.transform = `scale(${viewport.scale})`
    },
```

Les positions internes (`left-6 top-5`, `bottom-7 left-1/2`, etc.) deviennent relatives à ce rectangle de 1600×900 : elles n'ont pas besoin d'être touchées, l'échelle s'applique globalement.

- [ ] **Step 3 : appeler depuis `applyLayout`**

```ts
  function applyLayout(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    stage.resize(w, h)
    const viewport = computeViewport(w, h, ARENA.width, ARENA.height)
    stage.setViewport(viewport)
    hud.setViewport(viewport)
  }
```

- [ ] **Step 4 : vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout passe.

Visuellement, en partie et en redimensionnant : le score reste dans le coin de l'**arène** et non de la fenêtre, la jauge de vague est centrée sur l'arène, les chiffres grossissent et rétrécissent avec le terrain, et rien du HUD ne déborde dans la marge. Vérifier aussi que le HUD reste masqué au menu (`setVisible`, déjà en place).

- [ ] **Step 5 : commit**

```bash
git add src/ui/screens/hud.ts src/app/game.ts
git commit -m "feat(ui): anchor the hud to the arena rectangle"
```

---

## Vérification finale du lot

- [ ] `npm run typecheck && npm run lint && npm test` — tout vert.
- [ ] `npm run build` — la compilation de production passe.
- [ ] Parcours manuel complet, onglet au premier plan : menu → partie → carte de fin de vague → pause → game over → retour au menu, dans une fenêtre 16:9, puis une fenêtre large et basse, puis une fenêtre haute et étroite. À chaque fois : même aire de jeu, seule la marge change.
- [ ] Redimensionnement en pleine partie : le zoom suit, la difficulté ne bouge pas.

## Ce que ce lot ne fait pas

- Aucun réquilibrage des vagues. L'arène de référence est ~23 % plus large que la fenêtre typique d'avant, à nombre d'ennemis constant : le jeu est un peu plus permissif. À mesurer en jouant.
- Les meilleurs scores existants sont conservés, bien qu'obtenus sur des arènes de tailles variables.
- Le mobile : voir `docs/superpowers/plans/2026-07-30-mobile-inclinaison.md`, à exécuter après ce lot.
