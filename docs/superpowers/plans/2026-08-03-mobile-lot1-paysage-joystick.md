# Mobile lot 1 — paysage jouable : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le jeu jouable au pouce sur téléphone en paysage — arène réduite à 896×504, rotation forcée en portrait, joystick virtuel en bas à gauche, pause tactile.

**Architecture:** Une seule fonction pure (`resolveDisplayQuarters`) décide de la rotation à partir de la classe de pointeur et des dimensions de fenêtre ; `applyLayout` en dérive tout le reste — transformation CSS de `#app`, dimensions passées à Pixi, zoom d'arène, taille de l'interface. Le joystick est une `InputSource` de plus, exactement comme la souris, avec un cœur pur testable et un plafond de vitesse transmis à la simulation par un nouveau champ `InputState.speedCap`.

**Tech Stack:** TypeScript strict, PixiJS v8, bitECS, Vitest, Biome, Tailwind v4, Pointer Events.

**Spec :** `docs/superpowers/specs/2026-08-03-mobile-paysage-joystick-design.md` (lot 1)

**Lot 2, hors de ce plan :** `tilt.ts`, cibles tactiles à 44 px, cartes d'amélioration compactes, vitrines au doigt, textes d'aide tactiles.

## Global Constraints

- Documentation et commentaires **en français**. Commits en Conventional Commits (commitlint est actif via husky).
- `sim/` reste pur et déterministe : pas de `window`, `document`, `performance`, `localStorage`, `Math.random()`, ni d'import de `pixi.js` ou de `front/`. Biome l'applique (`biome.json`, section `sim/**`).
- Toute valeur écrite dans `InputState` est **quantifiée à 1/128** — prérequis du rejeu à l'identique.
- `front/src/render/` n'écrit jamais dans la simulation et n'a pas droit à l'assertion `!`.
- **Vitest tourne en `environment: 'node'` et jsdom n'est pas installé.** Tous les tests de ce plan portent sur des fonctions **pures**. Aucun test ne touche au DOM : le câblage DOM se vérifie à l'œil (voir « Vérification visuelle » à la fin de chaque tâche concernée).
- Vérifications avant chaque commit, depuis `front/` : `npm run typecheck`, `npm run lint`, `npm test`. Biome ordonne les imports : si `npm run lint` s'en plaint, `npm run format` corrige — l'ordre indiqué dans les extraits de ce plan n'est qu'indicatif.
- **Ne jamais pousser vers origin.**
- **Relire chaque fichier avant de le modifier** : d'autres sessions travaillent dans ce dépôt. **Ne jamais `git add -A`** — n'ajouter que les chemins listés dans l'étape de commit.
- Alias d'import : `@` → `front/src`, `@sim` → `sim`.

---

### Task 1 : `orientation.ts`, la brique de rotation

**Files:**
- Create: `front/src/app/orientation.ts`
- Test: `front/src/app/orientation.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type QuarterTurns = 0 | 1 | 2 | 3`
  - `type DisplayQuarters = 0 | 1`
  - `interface Display { quarters: DisplayQuarters; windowWidth: number; windowHeight: number }`
  - `rotateVector(x: number, y: number, quarters: QuarterTurns): { x: number; y: number }`
  - `resolveDisplayQuarters(opts: { coarsePointer: boolean; windowWidth: number; windowHeight: number }): DisplayQuarters`
  - `screenToApp(clientX: number, clientY: number, display: Display): { x: number; y: number }`

  Les tâches 2, 6 et 7 en dépendent. `QuarterTurns` couvre les quatre quarts parce que le lot 2 (`tilt.ts`) lira `screen.orientation.angle`, qui peut valoir 180 ou 270 ; l'affichage, lui, ne produit jamais que 0 ou 1, d'où le type plus étroit `DisplayQuarters`.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `front/src/app/orientation.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { resolveDisplayQuarters, rotateVector, screenToApp } from './orientation'

describe('rotateVector', () => {
  // Repère écran, `y` vers le bas, quart de tour HORAIRE : « vers la droite »
  // devient « vers le bas ».
  it('laisse le vecteur intact à zéro quart de tour', () => {
    expect(rotateVector(1, 0, 0)).toEqual({ x: 1, y: 0 })
    expect(rotateVector(0, 1, 0)).toEqual({ x: 0, y: 1 })
  })

  it('tourne dans le sens horaire', () => {
    expect(rotateVector(1, 0, 1)).toEqual({ x: 0, y: 1 })
    expect(rotateVector(0, 1, 1)).toEqual({ x: -1, y: 0 })
    expect(rotateVector(1, 0, 2)).toEqual({ x: -1, y: 0 })
    expect(rotateVector(1, 0, 3)).toEqual({ x: 0, y: -1 })
  })

  it('revient au point de départ après quatre quarts appliqués un à un', () => {
    let v = { x: 3, y: -7 }
    for (let i = 0; i < 4; i++) {
      v = rotateVector(v.x, v.y, 1)
    }
    expect(v).toEqual({ x: 3, y: -7 })
  })

  it('compose : un quart puis trois quarts est l’identité', () => {
    const once = rotateVector(5, 2, 1)
    expect(rotateVector(once.x, once.y, 3)).toEqual({ x: 5, y: 2 })
  })
})

describe('resolveDisplayQuarters', () => {
  it('pivote sur un pointeur grossier tenu en portrait', () => {
    expect(
      resolveDisplayQuarters({ coarsePointer: true, windowWidth: 393, windowHeight: 852 }),
    ).toBe(1)
  })

  it('ne pivote pas sur un pointeur grossier déjà en paysage', () => {
    expect(
      resolveDisplayQuarters({ coarsePointer: true, windowWidth: 852, windowHeight: 393 }),
    ).toBe(0)
  })

  // Le garde-fou qui justifie la condition `coarsePointer` : sans elle, une
  // fenêtre de bureau étroite et haute se mettrait à pivoter.
  it('ne pivote jamais sur un pointeur fin, même en fenêtre haute', () => {
    expect(
      resolveDisplayQuarters({ coarsePointer: false, windowWidth: 500, windowHeight: 1200 }),
    ).toBe(0)
  })

  it('ne pivote pas sur une fenêtre exactement carrée', () => {
    expect(
      resolveDisplayQuarters({ coarsePointer: true, windowWidth: 600, windowHeight: 600 }),
    ).toBe(0)
  })
})

describe('screenToApp', () => {
  it('est l’identité sans rotation', () => {
    const display = { quarters: 0, windowWidth: 852, windowHeight: 393 } as const
    expect(screenToApp(100, 50, display)).toEqual({ x: 100, y: 50 })
  })

  // `#app` pivoté d’un quart horaire autour de son coin haut-gauche puis
  // ramené par `translateX(windowWidth)`. Un point (ax, ay) local s’affiche
  // donc en (windowWidth − ay, ax) ; on vérifie ici l’inverse.
  it('inverse la transformation d’un quart de tour', () => {
    const display = { quarters: 1, windowWidth: 393, windowHeight: 852 } as const
    // Coin haut-gauche de `#app` → coin haut-DROIT de l’écran.
    expect(screenToApp(393, 0, display)).toEqual({ x: 0, y: 0 })
    // Un point à 10 px vers la droite dans `#app` descend de 10 px à l’écran.
    expect(screenToApp(393, 10, display)).toEqual({ x: 10, y: 0 })
    // Un point à 10 px vers le bas dans `#app` va 10 px vers la gauche à l’écran.
    expect(screenToApp(383, 0, display)).toEqual({ x: 0, y: 10 })
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Depuis `front/` : `npm test -- orientation`
Attendu : ÉCHEC — `Failed to resolve import "./orientation"`.

- [ ] **Step 3 : écrire l'implémentation**

Créer `front/src/app/orientation.ts` :

```ts
/**
 * Quarts de tour HORAIRES, repère écran (`y` vers le bas).
 * `rotateVector(1, 0, 1)` vaut `{ x: 0, y: 1 }` : « vers la droite » devient
 * « vers le bas ». Les quatre valeurs existent pour le lot 2, où
 * `screen.orientation.angle` peut valoir 180 ou 270.
 */
export type QuarterTurns = 0 | 1 | 2 | 3

/**
 * Ce que l'affichage peut produire, et rien de plus : on ne pivote qu'en
 * portrait, jamais de 180° ni de 270°. Type distinct pour que `screenToApp`,
 * qui ne sait traiter que ces deux cas, ne puisse pas recevoir les autres.
 */
export type DisplayQuarters = 0 | 1

/** L'état d'affichage dont dépend toute conversion écran → arène. */
export interface Display {
  quarters: DisplayQuarters
  windowWidth: number
  windowHeight: number
}

const COS: readonly number[] = [1, 0, -1, 0]
const SIN: readonly number[] = [0, 1, 0, -1]

/**
 * Rotation exacte : table de cosinus/sinus plutôt que `Math.cos` — sur des
 * multiples de 90°, la trigonométrie flottante rend 6,1e-17 au lieu de 0, et
 * un vecteur d'entrée censé être purement horizontal repartirait avec une
 * composante verticale minuscule mais non nulle.
 */
export function rotateVector(x: number, y: number, quarters: QuarterTurns): { x: number; y: number } {
  const c = COS[quarters] ?? 1
  const s = SIN[quarters] ?? 0
  return { x: x * c - y * s, y: x * s + y * c }
}

/**
 * Un quart de tour en portrait, et seulement sur pointeur grossier : sans
 * cette seconde condition, une fenêtre de bureau étroite et haute se mettrait
 * à pivoter. Une fenêtre carrée ne pivote pas — il n'y a rien à y gagner.
 */
export function resolveDisplayQuarters(opts: {
  coarsePointer: boolean
  windowWidth: number
  windowHeight: number
}): DisplayQuarters {
  return opts.coarsePointer && opts.windowHeight > opts.windowWidth ? 1 : 0
}

/**
 * Coordonnées de pointeur (`event.clientX/clientY`, toujours en repère écran)
 * vers le repère local de `#app`.
 *
 * Nécessaire parce que le navigateur ne transforme PAS `clientX`/`clientY` :
 * il transforme le hit-testing — un bouton pivoté se clique au bon endroit —
 * mais les coordonnées restent celles de l'écran. Sans cette conversion, le
 * joystick et la souris viseraient à 90° du doigt.
 *
 * `#app` est pivoté par `translateX(windowWidth) rotate(90deg)` avec origine
 * au coin haut-gauche : un point local (ax, ay) s'affiche en
 * (windowWidth − ay, ax). Ce qui suit en est l'inverse.
 */
export function screenToApp(clientX: number, clientY: number, display: Display): { x: number; y: number } {
  if (display.quarters === 1) {
    return { x: clientY, y: display.windowWidth - clientX }
  }
  return { x: clientX, y: clientY }
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Depuis `front/` : `npm test -- orientation`
Attendu : SUCCÈS, 8 tests.

- [ ] **Step 5 : vérifications complètes et commit**

```bash
cd front && npm run typecheck && npm run lint && npm test
cd .. && git add front/src/app/orientation.ts front/src/app/orientation.test.ts
git commit -m "feat(mobile): la brique de rotation d'affichage"
```

---

### Task 2 : rotation CSS de `#app` et souris sous rotation

**Files:**
- Modify: `front/src/main.ts`
- Modify: `front/src/app/game.ts` (`GameOptions`, `applyLayout` en fin de fichier)
- Modify: `front/src/app/mouse.ts` (`screenToArena`, `MouseSource`, `createMouse`)
- Test: `front/src/app/mouse.test.ts` (ajouter des cas, ne rien supprimer)

**Interfaces:**
- Consumes: `Display`, `DisplayQuarters`, `resolveDisplayQuarters`, `screenToApp` (tâche 1).
- Produces:
  - `screenToArena(clientX: number, clientY: number, viewport: Viewport, display: Display): Point` — signature **élargie d'un quatrième paramètre**.
  - `MouseSource.setDisplay(display: Display): void`.
  - `GameOptions` gagne `appRoot: HTMLElement`.

  La tâche 7 appelle `setDisplay` sur le joystick de la même façon.

- [ ] **Step 1 : écrire le test qui échoue**

Relire `front/src/app/mouse.test.ts`, puis **ajouter** ce bloc (les tests existants de `screenToArena` doivent recevoir le nouveau paramètre : leur passer `{ quarters: 0, windowWidth: 1280, windowHeight: 720 }`).

```ts
import { screenToArena } from './mouse'

describe('screenToArena sous rotation', () => {
  const viewport = { scale: 0.78, x: 76, y: 0, arenaWidth: 896, arenaHeight: 504 }

  it('sans rotation, retranche le décalage puis divise par le zoom', () => {
    const display = { quarters: 0, windowWidth: 852, windowHeight: 393 } as const
    expect(screenToArena(76, 0, viewport, display)).toEqual({ x: 0, y: 0 })
  })

  // Écran tenu en portrait, `#app` pivoté : le coin haut-gauche de l'arène
  // s'affiche en haut à DROITE de l'écran.
  it('sous un quart de tour, ramène le coin haut-droit de l’écran sur l’origine de l’arène', () => {
    const display = { quarters: 1, windowWidth: 393, windowHeight: 852 } as const
    const point = screenToArena(393 - 0, 76, viewport, display)
    expect(point.x).toBeCloseTo(0, 6)
    expect(point.y).toBeCloseTo(0, 6)
  })

  // Le bornage à l'arène est ce qui empêche un doigt posé dans la marge de
  // tirer le point vers un endroit qu'il ne peut pas atteindre.
  it('borne à l’arène un point situé dans la marge', () => {
    const display = { quarters: 0, windowWidth: 852, windowHeight: 393 } as const
    expect(screenToArena(-500, -500, viewport, display)).toEqual({ x: 0, y: 0 })
    expect(screenToArena(99_999, 99_999, viewport, display)).toEqual({ x: 896, y: 504 })
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Depuis `front/` : `npm test -- mouse`
Attendu : ÉCHEC — erreur de type sur le quatrième argument, ou coordonnées fausses sous rotation.

- [ ] **Step 3 : élargir `screenToArena` et `MouseSource`**

Dans `front/src/app/mouse.ts`, remplacer la fonction `screenToArena` par :

```ts
import { type Display, screenToApp } from './orientation'

/**
 * Position écran → coordonnées d'arène, bornée à l'arène (letterbox via
 * `computeViewport`) : sans ça, un curseur posé dans la marge tirerait le
 * point vers un point hors du cadre qu'il ne peut pas atteindre.
 *
 * `display` est passé en plus du viewport parce que `event.clientX/clientY`
 * ne subissent PAS la rotation CSS de `#app` (voir `screenToApp`).
 */
export function screenToArena(
  clientX: number,
  clientY: number,
  viewport: Viewport,
  display: Display,
): Point {
  const local = screenToApp(clientX, clientY, display)
  const x = (local.x - viewport.x) / viewport.scale
  const y = (local.y - viewport.y) / viewport.scale
  return {
    x: Math.min(viewport.arenaWidth, Math.max(0, x)),
    y: Math.min(viewport.arenaHeight, Math.max(0, y)),
  }
}
```

Dans l'interface `MouseSource`, ajouter sous `setViewport` :

```ts
  /** Rebranché par `game.ts` à chaque `applyLayout` : la rotation change avec la fenêtre. */
  setDisplay(display: Display): void
```

Dans `createMouse`, ajouter la variable d'état et la méthode, et faire passer `display` à `screenToArena` :

```ts
  let viewport: Viewport | null = null
  let display: Display = { quarters: 0, windowWidth: 0, windowHeight: 0 }
```

```ts
  const target = (): Point | null => {
    if (!moved || viewport === null) {
      return null
    }
    return screenToArena(clientX, clientY, viewport, display)
  }
```

```ts
    setDisplay(next: Display): void {
      display = next
    },
```

- [ ] **Step 4 : lancer les tests pour vérifier qu'ils passent**

Depuis `front/` : `npm test -- mouse`
Attendu : SUCCÈS, y compris les tests préexistants mis à jour.

- [ ] **Step 5 : passer `#app` à `startGame`**

Dans `front/src/main.ts`, ajouter la récupération de `#app` et la passer :

```ts
const appRoot = document.querySelector<HTMLElement>('#app')
if (!appRoot) {
  throw new Error('#app introuvable')
}
```

puis `startGame({ canvas, uiRoot, appRoot })`.

Dans `front/src/app/game.ts`, élargir `GameOptions` :

```ts
export interface GameOptions {
  canvas: HTMLCanvasElement
  uiRoot: HTMLElement
  /** Le conteneur pivoté en portrait sur pointeur grossier (voir `applyLayout`). */
  appRoot: HTMLElement
}
```

et la signature : `export async function startGame({ canvas, uiRoot, appRoot }: GameOptions): Promise<void> {`.

- [ ] **Step 6 : réécrire `applyLayout`**

Dans `front/src/app/game.ts`, ajouter l'import :

```ts
import { type Display, resolveDisplayQuarters } from './orientation'
```

Ajouter, près des autres constantes en haut du fichier :

```ts
/**
 * Un seul prédicat gouverne tout le mobile : rotation, taille d'arène, taille
 * d'interface, cible de pause et source d'entrée par défaut. Lu une fois — un
 * appareil ne change pas de classe de pointeur en cours de session.
 */
const coarsePointer = window.matchMedia('(pointer: coarse)').matches
```

Remplacer intégralement `applyLayout` (fin du fichier) par :

```ts
  function applyLayout(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    const quarters = resolveDisplayQuarters({ coarsePointer, windowWidth: w, windowHeight: h })
    // Dimensions vues par le jeu APRÈS rotation : c'est sur elles que se
    // calculent le zoom et la résolution du canvas.
    const viewW = quarters === 1 ? h : w
    const viewH = quarters === 1 ? w : h

    // Pilotée en JS et non en CSS : `100vh` sur mobile désigne la fenêtre
    // « large », barre d'URL exclue, et ne coïncide pas avec `innerHeight`.
    // Les deux valeurs doivent être identiques, sinon le canvas et son cadre
    // CSS se désaccordent de quelques pixels.
    if (quarters === 1) {
      appRoot.style.width = `${viewW}px`
      appRoot.style.height = `${viewH}px`
      appRoot.style.transformOrigin = 'top left'
      appRoot.style.transform = `translateX(${w}px) rotate(90deg)`
    } else {
      appRoot.style.width = ''
      appRoot.style.height = ''
      appRoot.style.transformOrigin = ''
      appRoot.style.transform = ''
    }

    // Dimensions inversées ici aussi : sans ça la résolution du canvas ne suit
    // pas la rotation et le rendu est flou en portrait pivoté.
    stage.resize(viewW, viewH)
    const viewport = computeViewport(viewW, viewH, ARENA.width, ARENA.height)
    stage.setViewport(viewport)
    hud.setViewport(viewport)
    const display: Display = { quarters, windowWidth: w, windowHeight: h }
    // Sans ces deux lignes, la conversion écran→arène resterait calée sur
    // l'ancien zoom et sur l'ancienne rotation.
    mouse.setViewport(viewport)
    mouse.setDisplay(display)
  }
```

Remplacer aussi le commentaire au-dessus de l'écouteur `resize`, devenu faux dès la tâche 3 :

```ts
  // Redimensionner ne change que le zoom et la rotation, jamais les
  // dimensions de l'arène : celles-ci sont figées à la création du monde.
  window.addEventListener('resize', applyLayout)
  applyLayout()
```

- [ ] **Step 7 : vérifications complètes**

```bash
cd front && npm run typecheck && npm run lint && npm test
```
Attendu : les trois passent.

- [ ] **Step 8 : vérification visuelle**

Lancer `npm run dev` depuis `front/`. Dans Chrome, ouvrir les outils de développement, activer l'émulation d'appareil, choisir un iPhone (393×852) — l'émulation force `pointer: coarse`.

Attendu : le jeu s'affiche pivoté, occupant tout l'écran portrait, sans barre de défilement ni débordement. En basculant l'émulateur en paysage (852×393), la rotation disparaît et l'arène se cadre normalement. En redimensionnant la fenêtre de bureau en étroit et haut **sans** émulation, aucune rotation.

- [ ] **Step 9 : commit**

```bash
git add front/src/main.ts front/src/app/game.ts front/src/app/mouse.ts front/src/app/mouse.test.ts
git commit -m "feat(mobile): pivoter l'affichage en portrait sur pointeur grossier"
```

---

### Task 3 : l'arène mobile, 896×504

**Files:**
- Modify: `sim/world.ts` (après `ARENA`)
- Modify: `front/src/app/game.ts` (`createRun`, `handleSimEvents`, `applyLayout`)
- Test: `sim/world.test.ts` (ajouter des cas)

**Interfaces:**
- Consumes: `coarsePointer` (tâche 2).
- Produces: `ARENA_MOBILE = { width: 896, height: 504, rangeScale: 0.7 }` et `ARENA` élargi de `rangeScale: 1`, exportés depuis `@sim/world`. La tâche 4 consomme `rangeScale`.

**Pourquoi `rangeScale` est une valeur déclarée et non `height / 720`.** Un facteur dérivé de la hauteur s'appliquerait à *tout* monde construit hors 720 px — et les tests existants en construisent : `sim/systems/player-movement.test.ts` travaille en 800×600, qui hériterait d'un facteur 0,833 sans que personne l'ait demandé. Une arène de test n'est pas une arène mobile. Le facteur est donc une décision de contenu, portée par la constante, pas une conséquence géométrique.

- [ ] **Step 1 : écrire le test qui échoue**

Relire `sim/world.test.ts`, puis y ajouter :

```ts
import { ARENA, ARENA_MOBILE, createWorld } from './world'

describe('ARENA_MOBILE', () => {
  it('garde exactement le ratio 16:9 de l’arène de bureau', () => {
    expect(ARENA_MOBILE.width / ARENA_MOBILE.height).toBeCloseTo(ARENA.width / ARENA.height, 12)
  })

  it('vaut 70 % de l’arène de bureau sur les deux axes', () => {
    expect(ARENA_MOBILE.width).toBe(896)
    expect(ARENA_MOBILE.height).toBe(504)
    expect(ARENA_MOBILE.width / ARENA.width).toBeCloseTo(0.7, 12)
    expect(ARENA_MOBILE.height / ARENA.height).toBeCloseTo(0.7, 12)
  })

  // `rangeScale` est déclaré, pas dérivé (voir l'encadré ci-dessus). Ce test
  // est ce qui empêche les deux de diverger silencieusement.
  it('déclare un rangeScale cohérent avec sa géométrie', () => {
    expect(ARENA.rangeScale).toBe(1)
    expect(ARENA_MOBILE.rangeScale).toBeCloseTo(ARENA_MOBILE.height / ARENA.height, 12)
  })

  it('se transmet au monde créé', () => {
    const world = createWorld({ seed: 1, width: ARENA_MOBILE.width, height: ARENA_MOBILE.height })
    expect(world.arena.width).toBe(896)
    expect(world.arena.height).toBe(504)
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Depuis `front/` : `npm test -- world`
Attendu : ÉCHEC — `ARENA_MOBILE` n'est pas exporté.

- [ ] **Step 3 : déclarer l'arène mobile**

Dans `sim/world.ts`, élargir `ARENA` d'un champ :

```ts
export const ARENA = { width: 1280, height: 720, rangeScale: 1 } as const
```

puis, juste en dessous :

```ts
/**
 * Arène du pointeur grossier : 70 % de `ARENA`, même ratio 16:9.
 *
 * Réduire l'arène EST le zoom. Les rayons d'entités sont en pixels-monde
 * fixes, donc une arène plus petite les fait paraître 1,4× plus gros à
 * l'écran, tout en gardant l'aire de jeu entièrement visible — un téléphone
 * n'a pas de place pour une caméra qui suit.
 *
 * Conséquence assumée : la difficulté n'est plus la même qu'au bureau (spec
 * §3). Les PORTÉES des power-ups sont remises à l'échelle pour compenser
 * (voir `arena.rangeScale`) ; les tailles d'entités, jamais.
 *
 * `rangeScale` est DÉCLARÉ et non calculé depuis la hauteur : un facteur
 * dérivé s'appliquerait à tout monde construit hors 720 px, y compris les
 * arènes de fixture des tests, qui n'ont rien demandé.
 */
export const ARENA_MOBILE = { width: 896, height: 504, rangeScale: 0.7 } as const
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Depuis `front/` : `npm test -- world`
Attendu : SUCCÈS.

- [ ] **Step 5 : brancher `createRun` sur la classe de pointeur**

Dans `front/src/app/game.ts` :

Remplacer l'import `import { ARENA, createWorld, type SimWorld } from '@sim/world'` par :

```ts
import { ARENA, ARENA_MOBILE, createWorld, type SimWorld } from '@sim/world'
```

Déplacer `createRun` **à l'intérieur** de `startGame` n'est pas nécessaire : lui passer l'arène en paramètre suffit et garde la fonction pure de tout état de module.

```ts
/** `rangeScale` n'est pas encore consommé ici : la tâche 4 l'utilise. */
function createRun(arena: { width: number; height: number; rangeScale: number }): Run {
  const seed = Math.floor(Math.random() * 2 ** 31)
  const world = createWorld({ seed, width: arena.width, height: arena.height })
  spawnPlayer(world)
  return { world, stats: createRunStats(), seed }
}
```

Dans `startGame`, juste après la déclaration de `coarsePointer` (tâche 2), ajouter :

```ts
  // Figée pour toute la session : une arène qui rétrécirait en cours de partie
  // téléporterait des ennemis hors du cadre.
  const arena = coarsePointer ? ARENA_MOBILE : ARENA
```

Remplacer les deux appels `createRun()` (déclaration de `run`, et `startRun`) par `createRun(arena)`.

- [ ] **Step 6 : faire lire l'arène du monde aux deux derniers appelants**

Dans `handleSimEvents`, remplacer :

```ts
        deathSequence.start(run.world, event.x, event.y, ARENA.width, ARENA.height)
```

par :

```ts
        deathSequence.start(
          run.world,
          event.x,
          event.y,
          run.world.arena.width,
          run.world.arena.height,
        )
```

Dans `applyLayout`, remplacer `computeViewport(viewW, viewH, ARENA.width, ARENA.height)` par :

```ts
    const viewport = computeViewport(viewW, viewH, arena.width, arena.height)
```

- [ ] **Step 7 : vérifications complètes**

```bash
cd front && npm run typecheck && npm run lint && npm test
```
Attendu : les trois passent. En particulier `sim/determinism.test.ts` : il construit ses mondes explicitement, la taille par défaut ne le concerne pas.

- [ ] **Step 8 : vérification visuelle**

`npm run dev`, émulation iPhone en paysage (852×393).
Attendu : le point du joueur, les ennemis et les pastilles paraissent nettement plus gros qu'en fenêtre de bureau ; l'arène entière reste visible, bandes latérales comprises ; le HUD a grossi dans la même proportion.

- [ ] **Step 9 : commit**

```bash
git add sim/world.ts sim/world.test.ts front/src/app/game.ts
git commit -m "feat(mobile): une arène de 896x504 sur pointeur grossier"
```

---

### Task 4 : les portées des power-ups à l'échelle de l'arène

**Files:**
- Modify: `sim/world.ts` (`SimWorld.arena`, `createWorld`)
- Modify: `sim/upgrades/stats.ts`
- Modify: `sim/powerups/activate.ts` (lignes ~149, ~173, ~239)
- Modify: `sim/systems/seeker.ts` (lignes ~132, ~147)
- Modify: `sim/systems/ricochet.ts` (ligne ~125)
- Modify: `sim/systems/freeze.ts` (ligne ~79)
- Modify: `front/src/app/game.ts` (`createRun`)
- Create: `sim/upgrades/stats.test.ts` (vérifié absent)
- Test: `sim/world.test.ts` (ajouter)

**Interfaces:**
- Consumes: `ARENA_MOBILE.rangeScale` (tâche 3).
- Produces:
  - `SimWorld.arena` gagne `readonly rangeScale: number`.
  - `createWorld` gagne une option `rangeScale?: number`, **défaut `1`**. C'est ce défaut qui garantit qu'aucun monde de fixture existant ne change de comportement.
  - `createRunStats(rangeScale?: number): RunStats` — paramètre optionnel, défaut `1`.

**Ce qui change d'échelle et ce qui n'en change pas.** La règle : le facteur multiplie les **portées** — ce qu'un power-up atteint — et jamais les **tailles** — ce qu'une entité occupe. Mettre les tailles à l'échelle annulerait exactement le zoom obtenu à la tâche 3.

| Valeur | Fichier | Échelle ? | Pourquoi |
|---|---|---|---|
| `blastRadius` | `stats.ts` | **oui** | Portée de la Bombe |
| `freezeRadius` | `stats.ts` | **oui** | Le commentaire de `powerups.ts` la dimensionne en fraction de hauteur |
| `blotterRadius` | `stats.ts` | **oui** | Rayon de capture du Buvard |
| `dashRadius` | `stats.ts` | non | Rayon meurtrier de la Ruée : une hitbox |
| `moveSpeed` | `stats.ts` | non | Décision explicite de la spec §3 |
| `blast.growthRate` | `activate.ts` | **oui** | Avec `blastRadius`, garde la durée d'expansion constante |
| `bramble.orbitRadius` | `activate.ts` | **oui** | Rayon de la couronne : une allonge |
| `bramble.thornRadius` | `activate.ts` | non | Taille d'une épine : une entité |
| `dash.speed` | `activate.ts` | **oui** | Distance parcourue = `speed × durationMs`, et la durée ne change pas |
| `volley.speed` | `seeker.ts` | **oui** | Vitesse de trajet ; `turnRate` inchangé, donc le rayon de virage suit |
| `volley.blastRadius` et `blastGrowth` | `seeker.ts` | **oui** | Les deux ensemble, même invariant de durée que la Bombe |
| `volley.quillRadius` | `seeker.ts` | non | Taille de la plume |
| `splatter.speed` | `ricochet.ts` | **oui** | Vitesse de trajet de la goutte |
| `splatter.radius` | `ricochet.ts` | non | Taille de la goutte |
| `freezeSpreadRadius` | `freeze.ts` | **oui** | Portée de contamination du givre rampant |
| Toutes les durées | partout | non | Sans exception |

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter dans `sim/world.test.ts` :

```ts
describe('arena.rangeScale', () => {
  // Le défaut est ce qui protège toutes les arènes de fixture existantes.
  it('vaut 1 quand l’appelant n’en demande pas', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    expect(world.arena.rangeScale).toBe(1)
  })

  it('reprend le facteur demandé', () => {
    const world = createWorld({
      seed: 1,
      width: ARENA_MOBILE.width,
      height: ARENA_MOBILE.height,
      rangeScale: ARENA_MOBILE.rangeScale,
    })
    expect(world.arena.rangeScale).toBe(0.7)
  })
})
```

Créer `sim/upgrades/stats.test.ts` (ou ajouter au fichier existant) :

```ts
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
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Depuis `front/` : `npm test -- world stats`
Attendu : ÉCHEC — `rangeScale` absent, et `createRunStats` ignore son argument.

- [ ] **Step 3 : porter le facteur sur le monde**

Dans `sim/world.ts`, remplacer la ligne de l'interface :

```ts
  arena: { readonly width: number; readonly height: number }
```

par :

```ts
  arena: {
    readonly width: number
    readonly height: number
    /**
     * Rapport de cette arène à `ARENA`. Multiplie les PORTÉES des power-ups —
     * ce qu'ils atteignent — et jamais les TAILLES d'entités : ce sont ces
     * dernières, laissées fixes, qui produisent le zoom sur petit écran.
     */
    readonly rangeScale: number
  }
```

et remplacer la signature et l'affectation de `world.arena` dans `createWorld` :

```ts
export function createWorld(opts: {
  seed: number
  width: number
  height: number
  /**
   * Défaut 1, et ce défaut compte : une arène de test construite hors
   * 1280×720 n'est pas une arène mobile, et ne doit hériter d'aucune remise à
   * l'échelle qu'elle n'a pas demandée.
   */
  rangeScale?: number
}): SimWorld {
```

```ts
  world.arena = {
    width: opts.width,
    height: opts.height,
    rangeScale: opts.rangeScale ?? 1,
  }
```

- [ ] **Step 4 : mettre les trois portées de `RunStats` à l'échelle**

Dans `sim/upgrades/stats.ts`, remplacer `createRunStats` par :

```ts
/**
 * `rangeScale` vient de `world.arena.rangeScale` : 1 au bureau, 0,7 sur
 * l'arène mobile. Il ne touche qu'aux portées ; les cartes d'amélioration
 * multiplient ensuite par-dessus, donc « Gel élargi » reste ×1,2 de la portée
 * réellement en jeu.
 */
export function createRunStats(rangeScale = 1): RunStats {
  return {
    moveSpeed: 240,
    blastRadius: POWERUP_BASE.blast.maxRadius * rangeScale,
    blastLingerMs: POWERUP_BASE.blast.lingerMs,
    freezeRadius: POWERUP_BASE.freeze.radius * rangeScale,
    freezeDurationMs: POWERUP_BASE.freeze.durationMs,
    brambleDurationMs: POWERUP_BASE.bramble.durationMs,
    blotterRadius: POWERUP_BASE.blotter.radius * rangeScale,
    dashDurationMs: POWERUP_BASE.dash.durationMs,
    dashRadius: POWERUP_BASE.dash.radius,
    volleyCount: POWERUP_BASE.volley.count,
    splatterLifeMs: POWERUP_BASE.splatter.lifeMs,
    rules: new Set<string>(),
  }
}
```

Dans `front/src/app/game.ts`, `createRun` doit transmettre le facteur :

```ts
function createRun(arena: { width: number; height: number; rangeScale: number }): Run {
  const seed = Math.floor(Math.random() * 2 ** 31)
  const world = createWorld({
    seed,
    width: arena.width,
    height: arena.height,
    rangeScale: arena.rangeScale,
  })
  spawnPlayer(world)
  return { world, stats: createRunStats(world.arena.rangeScale), seed }
}
```

- [ ] **Step 5 : mettre à l'échelle les valeurs lues hors de `RunStats`**

Relire chaque fichier avant de le modifier. Dans chacun, `world` est déjà dans la portée de la fonction concernée ; si un helper ne l'a pas, lui ajouter un paramètre `rangeScale: number` plutôt que d'importer quoi que ce soit.

`sim/powerups/activate.ts`, ligne ~149 :

```ts
      // À l'échelle avec `stats.blastRadius` : les deux ensemble laissent la
      // durée d'expansion (`maxRadius / growth`) inchangée.
      const growth = POWERUP_BASE.blast.growthRate * world.arena.rangeScale
```

`sim/powerups/activate.ts`, ligne ~173 :

```ts
      const { count, thornRadius, angularRate } = POWERUP_BASE.bramble
      // Le rayon de couronne est une allonge, il suit l'arène ; le rayon d'une
      // épine est une taille d'entité, il ne bouge pas.
      const orbitRadius = POWERUP_BASE.bramble.orbitRadius * world.arena.rangeScale
```

`sim/powerups/activate.ts`, lignes ~239-240 :

```ts
      // La durée de ruée ne change pas : mettre la vitesse à l'échelle met la
      // DISTANCE parcourue à l'échelle, ce qui est l'intention.
      const dashSpeed = POWERUP_BASE.dash.speed * world.arena.rangeScale
      Dashing.vx[player] = cos(angle) * dashSpeed
      Dashing.vy[player] = sin(angle) * dashSpeed
```

`sim/systems/seeker.ts`, ligne ~132 :

```ts
  // `turnRate` reste inchangé : le rayon de virage vaut `speed / turnRate`, il
  // suit donc l'arène de lui-même.
  Seeker.speed[eid] = POWERUP_BASE.volley.speed * world.arena.rangeScale
```

`sim/systems/seeker.ts`, ligne ~147 et suivantes :

```ts
  const { blastLingerMs } = POWERUP_BASE.volley
  const scale = world.arena.rangeScale
  const blastRadius = POWERUP_BASE.volley.blastRadius * scale
  const blastGrowth = POWERUP_BASE.volley.blastGrowth * scale
```

(les lignes 156-158 qui suivent consomment déjà ces trois noms, elles n'ont pas à changer).

`sim/systems/ricochet.ts`, ligne ~125 :

```ts
    const speed = POWERUP_BASE.splatter.speed * world.arena.rangeScale
```

`sim/systems/freeze.ts`, ligne ~79 :

```ts
        const spreadRadius = RULE_TUNING.freezeSpreadRadius * world.arena.rangeScale
        for (const neighbor of hash.query(fx, fy, spreadRadius, scratch)) {
```

(déclarer `spreadRadius` avant la boucle qui l'englobe, pas dans la boucle interne, si la structure s'y prête.)

- [ ] **Step 6 : lancer tous les tests**

```bash
cd front && npm test
```
Attendu : SUCCÈS complet, **sans qu'aucun test existant ait eu à être retouché** — c'est précisément ce que le défaut `rangeScale = 1` garantit. Si un test de système (`seeker`, `ricochet`, `freeze`, `activate`) se met à échouer, c'est qu'un `rangeScale` a fuité là où personne ne l'a demandé : corriger l'implémentation, pas le test.

`sim/determinism.test.ts` doit passer **sans que son empreinte de référence soit modifiée** : il ne demande aucun `rangeScale`, donc il vaut 1 et aucun produit ne change. **Si l'empreinte diverge, ne pas la régénérer.**

- [ ] **Step 7 : vérifications complètes et commit**

```bash
cd front && npm run typecheck && npm run lint && npm test
cd .. && git add sim/world.ts sim/world.test.ts sim/upgrades/stats.ts sim/upgrades/stats.test.ts sim/powerups/activate.ts sim/systems/seeker.ts sim/systems/ricochet.ts sim/systems/freeze.ts front/src/app/game.ts
git commit -m "feat(sim): mettre les portees des power-ups a l'echelle de l'arene"
```

---

### Task 5 : `speedCap`, le plafond de vitesse analogique

**Files:**
- Modify: `sim/input.ts`
- Modify: `sim/world.ts` (`createWorld`)
- Modify: `sim/systems/player-movement.ts` (calcul de `maxSpeed`)
- Modify: `front/src/app/keyboard.ts` (`writeInto`)
- Modify: `front/src/app/mouse.ts` (`writeInto`)
- Test: `sim/systems/player-movement.test.ts` (ajouter)

**Interfaces:**
- Consumes: rien.
- Produces: `InputState.speedCap: number`. La tâche 6 l'écrit ; toute source d'entrée doit désormais écrire **les trois champs**.

- [ ] **Step 1 : écrire le test qui échoue**

Relire `sim/systems/player-movement.test.ts`. Il fournit déjà deux utilitaires — `world()` (arène 800×600, joueur posé) et `stepN(w, n)` — que les cas ci-dessous réutilisent tels quels. Ajouter `Movement` à la liste importée depuis `'../components'`, puis ajouter :

```ts
describe('speedCap', () => {
  // Garde-fou de non-régression : à 1, le comportement doit être exactement
  // celui d'avant l'ajout du champ — c'est ce qui protège clavier et souris.
  it('à 1, plafonne à la vitesse maximale nominale', () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 600)
    expect(Velocity.x[w.playerEid]).toBeCloseTo(Movement.maxSpeed[w.playerEid] ?? 0, 6)
  })

  it('à 0,5, plafonne à la moitié', () => {
    const w = world()
    w.input.moveX = 1
    w.input.speedCap = 0.5
    stepN(w, 600)
    expect(Velocity.x[w.playerEid]).toBeCloseTo((Movement.maxSpeed[w.playerEid] ?? 0) * 0.5, 6)
  })

  // Le cas qui a écarté `maxSpeed × min(1, inputLen)` : la souris envoie une
  // intensité plancher de 0,01 en croisière, un plafond dérivé de la magnitude
  // aurait figé le point. Ici l'intensité est faible ET le plafond plein.
  it('n’est pas déduit de la magnitude de l’entrée', () => {
    const w = world()
    w.input.moveX = 0.01
    stepN(w, 4000)
    expect(Velocity.x[w.playerEid]).toBeCloseTo(Movement.maxSpeed[w.playerEid] ?? 0, 6)
  })

  it('rabat une vitesse déjà acquise quand le plafond descend', () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 600)
    w.input.speedCap = 0.25
    stepN(w, 1)
    expect(Velocity.x[w.playerEid]).toBeCloseTo((Movement.maxSpeed[w.playerEid] ?? 0) * 0.25, 6)
  })
})
```

Note sur le troisième cas : `stepN` appelle aussi `integrationSystem`, donc le joueur se déplace et finira par heurter un mur de l'arène 800×600. À 0,01 d'intensité l'accélération est très lente ; si le point atteint le bord avant d'atteindre sa vitesse maximale, remplacer `w.input.moveX = 0.01` par une boucle qui inverse le sens tous les 500 pas, ou n'appeler que `playerMovementSystem` dans une boucle locale — la vélocité seule est ce qui est observé ici, pas la position.

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Depuis `front/` : `npm test -- player-movement`
Attendu : ÉCHEC — erreur de type sur `speedCap`, absent de `InputState`.

- [ ] **Step 3 : ajouter le champ**

**Coordination inter-chantiers — à lire avant d'éditer `sim/input.ts`.** Le chantier « replay / leaderboard » (`docs/superpowers/plans/2026-08-03-replay.md`, commit `7abc914`) prévoit d'ajouter dans ce même fichier une liste `INPUT_FIELDS` et un garde-fou au niveau du type, dont le rôle est précisément d'empêcher qu'un champ soit ajouté à `InputState` sans être enregistré dans le format de replay. Il a été écrit en réponse à la spec de ce chantier, et il nomme `speedCap` explicitement.

Deux cas au moment d'implémenter — **relire `sim/input.ts` pour savoir lequel s'applique** :

- **`INPUT_FIELDS` est déjà là :** ajouter `speedCap` à `InputState` **cassera la compilation** avec `error TS2322: Type 'true' is not assignable to type '"speedCap"'`. C'est le garde-fou qui fonctionne, pas un bug. Le corriger en ajoutant `'speedCap'` **à la fin** de `INPUT_FIELDS` — l'ordre de la liste est l'ordre d'enregistrement du format, donc ajouter en fin plutôt qu'au milieu.
- **`INPUT_FIELDS` n'est pas encore là :** ne pas l'inventer, ce n'est pas le sujet de ce lot. Ajouter simplement le champ. Leur garde-fou, quand il arrivera, nommera `speedCap` et leur dira quoi faire.

Le fichier prévoit aussi d'exporter `QUANTUM` depuis `@sim/input`. S'il y est déjà au moment de la tâche 6, importer cette constante dans `joystick.ts` au lieu d'en redéclarer une — c'est la même valeur, et deux définitions du pas de quantification finiraient par diverger.

Dans `sim/input.ts` :

```ts
export interface InputState {
  /** -1 (gauche) à 1 (droite) */
  moveX: number
  /** -1 (haut) à 1 (bas) */
  moveY: number
  /**
   * Plafond de vitesse, en fraction de `Movement.maxSpeed`. Vaut 1 partout
   * sauf pour le joystick et l'inclinaison, seules sources analogiques.
   *
   * Champ distinct de la magnitude de `moveX`/`moveY`, et c'est délibéré :
   * la souris (`app/mouse.ts`) renvoie une intensité plancher de 0,01 en
   * croisière pour garder la commande, donc un plafond déduit de la magnitude
   * figerait le point sur place.
   */
  speedCap: number
}
```

Dans `sim/world.ts`, `createWorld` :

```ts
  world.input = { moveX: 0, moveY: 0, speedCap: 1 }
```

Dans `sim/systems/player-movement.ts`, remplacer :

```ts
    const maxSpeed = Movement.maxSpeed[eid]!
```

par :

```ts
    // Seul usage de `speedCap` dans toute la simulation. Le rabattement passe
    // par le clamp déjà présent plus bas : relâcher le joystick fait donc
    // tomber la vitesse d'un coup plutôt que de décélérer. Réactif ; à revoir
    // par la friction si c'est trop sec sur appareil (spec §5).
    const maxSpeed = Movement.maxSpeed[eid]! * world.input.speedCap
```

- [ ] **Step 4 : faire écrire les trois champs aux sources existantes**

Relire `front/src/app/keyboard.ts`. Dans son `writeInto`, ajouter après l'écriture de `moveX`/`moveY` :

```ts
    // Toute source écrit les TROIS champs : sans ça, un joueur qui passe du
    // joystick au clavier garderait le dernier plafond du joystick.
    input.speedCap = 1
```

Dans `front/src/app/mouse.ts`, `writeInto`, ajouter la même ligne dans **les deux** chemins de sortie (le retour anticipé quand `aim === null`, et le chemin nominal) :

```ts
    writeInto(input: InputState, player: PlayerMotion): void {
      const aim = target()
      // Voir `InputState.speedCap` : la souris n'est pas analogique, son
      // intensité sert à l'accélération, pas au plafond.
      input.speedCap = 1
      if (aim === null) {
        input.moveX = 0
        input.moveY = 0
        return
      }
      const { moveX, moveY } = aimInput(player, aim)
      input.moveX = moveX
      input.moveY = moveY
    },
```

- [ ] **Step 5 : lancer les tests pour vérifier qu'ils passent**

Depuis `front/` : `npm test`
Attendu : SUCCÈS complet. Les tests existants qui construisent un `InputState` littéral devront recevoir `speedCap: 1` — les corriger, sans changer leurs attentes.

`sim/determinism.test.ts` doit passer **sans modification de son empreinte** : `speedCap` vaut 1 dans tous les scénarios existants. Si l'empreinte diverge, c'est un bug d'implémentation, pas une empreinte à régénérer.

- [ ] **Step 6 : vérifications complètes et commit**

```bash
cd front && npm run typecheck && npm run lint && npm test
cd .. && git add sim/input.ts sim/world.ts sim/systems/player-movement.ts sim/systems/player-movement.test.ts front/src/app/keyboard.ts front/src/app/mouse.ts
git commit -m "feat(sim): un plafond de vitesse pour les sources analogiques"
```

**Coordination :** ce commit élargit le format d'entrées rejouables. Le signaler à la session qui construit l'architecture du leaderboard.

---

### Task 6 : le cœur du joystick

**Files:**
- Create: `front/src/app/joystick.ts`
- Test: `front/src/app/joystick.test.ts`

**Interfaces:**
- Consumes: `Display`, `screenToApp` (tâche 1) ; `InputSource`, `PlayerMotion` (`input-source.ts`) ; `InputState.speedCap` (tâche 5).
- Produces:
  - `JOYSTICK_RADIUS: number`, `JOYSTICK_DEAD_ZONE: number`
  - `joystickVector(originX, originY, currentX, currentY, radius): { x: number; y: number; magnitude: number }`
  - `interface JoystickSource extends InputSource { setDisplay(display: Display): void; setViewport(viewport: Viewport): void; origin(): Point | null; release(): void }`
  - `createJoystick(target: HTMLElement): JoystickSource`

  La tâche 7 consomme `origin()` pour dessiner le halo et `createJoystick` pour brancher la source.

**Décision de conception à respecter :** `joystickVector` travaille en coordonnées **locales à `#app`**, jamais en coordonnées écran. La rotation est donc déjà absorbée par `screenToApp` en amont, et la fonction n'a besoin d'aucun paramètre de quart de tour — c'est plus simple que ce qu'annonçait l'ancienne spec de 2026-07-30.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `front/src/app/joystick.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { JOYSTICK_DEAD_ZONE, JOYSTICK_RADIUS, joystickVector } from './joystick'

describe('joystickVector', () => {
  it('rend une entrée nulle quand le doigt n’a pas bougé', () => {
    expect(joystickVector(100, 100, 100, 100, JOYSTICK_RADIUS)).toEqual({ x: 0, y: 0, magnitude: 0 })
  })

  it('rend une entrée nulle dans la zone morte', () => {
    const inside = JOYSTICK_DEAD_ZONE * JOYSTICK_RADIUS * 0.9
    const v = joystickVector(100, 100, 100 + inside, 100, JOYSTICK_RADIUS)
    expect(v).toEqual({ x: 0, y: 0, magnitude: 0 })
  })

  it('rend une direction unitaire dès qu’on sort de la zone morte', () => {
    const v = joystickVector(100, 100, 100 + JOYSTICK_RADIUS / 2, 100, JOYSTICK_RADIUS)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6)
    expect(v.x).toBeCloseTo(1, 6)
    expect(v.y).toBeCloseTo(0, 6)
  })

  // La magnitude est le plafond de vitesse ; la direction reste unitaire pour
  // que l'accélération, elle, soit toujours pleine (voir `InputState.speedCap`).
  it('fait croître la magnitude avec la distance, jusqu’à saturer au rayon', () => {
    const half = joystickVector(0, 0, JOYSTICK_RADIUS / 2, 0, JOYSTICK_RADIUS)
    const full = joystickVector(0, 0, JOYSTICK_RADIUS, 0, JOYSTICK_RADIUS)
    const beyond = joystickVector(0, 0, JOYSTICK_RADIUS * 10, 0, JOYSTICK_RADIUS)
    expect(half.magnitude).toBeGreaterThan(0)
    expect(half.magnitude).toBeLessThan(full.magnitude)
    expect(full.magnitude).toBeCloseTo(1, 6)
    expect(beyond.magnitude).toBeCloseTo(1, 6)
  })

  it('oriente le bas de l’écran vers les y positifs', () => {
    const v = joystickVector(0, 0, 0, JOYSTICK_RADIUS, JOYSTICK_RADIUS)
    expect(v.x).toBeCloseTo(0, 6)
    expect(v.y).toBeCloseTo(1, 6)
  })

  it('normalise une diagonale', () => {
    const d = JOYSTICK_RADIUS / Math.SQRT2
    const v = joystickVector(0, 0, d, d, JOYSTICK_RADIUS)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6)
    expect(v.magnitude).toBeCloseTo(1, 6)
  })

  it('rend une magnitude jamais inférieure à la zone morte une fois armé', () => {
    const justOut = JOYSTICK_DEAD_ZONE * JOYSTICK_RADIUS * 1.01
    const v = joystickVector(0, 0, justOut, 0, JOYSTICK_RADIUS)
    // Garantit qu'aucune magnitude ne quantifie à zéro : un plafond nul
    // figerait le joueur alors qu'il commande bien quelque chose.
    expect(v.magnitude).toBeGreaterThan(1 / 128)
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Depuis `front/` : `npm test -- joystick`
Attendu : ÉCHEC — `Failed to resolve import "./joystick"`.

- [ ] **Step 3 : écrire le cœur pur et la source**

Créer `front/src/app/joystick.ts` :

```ts
import type { Viewport } from '@/render/viewport'
import type { InputState } from '@sim/input'

import type { InputSource, Point } from './input-source'
import { type Display, screenToApp } from './orientation'

/** Rayon de saturation du joystick, en pixels de fenêtre. */
export const JOYSTICK_RADIUS = 56

/**
 * Fraction du rayon sous laquelle rien n'est commandé. Un pouce posé tremble ;
 * sans cette zone, le point dériverait dès qu'on touche l'écran.
 */
export const JOYSTICK_DEAD_ZONE = 0.15

/**
 * Pas de quantification des entrées — prérequis du netcode v3 (spec §3.5).
 * Si le chantier replay a déjà exporté `QUANTUM` depuis `@sim/input`,
 * l'importer de là plutôt que de le redéclarer ici (voir tâche 5, étape 3).
 */
const QUANTUM = 1 / 128

function quantize(value: number): number {
  return Math.round(value / QUANTUM) * QUANTUM
}

/**
 * Direction **unitaire** et magnitude séparées, et c'est le point clé : la
 * direction part dans `moveX`/`moveY`, donc l'accélération est toujours pleine,
 * et la magnitude part dans `speedCap`, donc c'est la VITESSE qui est dosée.
 * Une déflexion à mi-course donne « moins vite », pas « accélère moins » —
 * sans quoi la course finirait quand même à la vitesse maximale.
 *
 * Coordonnées attendues : locales à `#app`, pas écran. La rotation est absorbée
 * en amont par `screenToApp`.
 */
export function joystickVector(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
  radius: number,
): { x: number; y: number; magnitude: number } {
  const dx = currentX - originX
  const dy = currentY - originY
  const distance = Math.hypot(dx, dy)
  if (distance <= JOYSTICK_DEAD_ZONE * radius) {
    return { x: 0, y: 0, magnitude: 0 }
  }
  return {
    x: dx / distance,
    y: dy / distance,
    magnitude: Math.min(1, distance / radius),
  }
}

export interface JoystickSource extends InputSource {
  /** Rebranché par `game.ts` à chaque `applyLayout`. */
  setDisplay(display: Display): void
  setViewport(viewport: Viewport): void
  /** Origine courante en coordonnées locales à `#app`, `null` si aucun doigt n'est posé. Le halo la suit. */
  origin(): Point | null
  /** Relâche la commande sans attendre un `pointerup` — appelé à chaque changement d'état de jeu. */
  release(): void
}

/**
 * Joystick **ancré mais tolérant** : un halo dessiné en bas à gauche montre où
 * poser le pouce, mais tout contact dans le quart inférieur gauche de l'aire de
 * jeu arme le joystick à l'endroit du contact. Dans un jeu d'esquive, exiger de
 * viser une base dessinée coûte trop cher.
 */
export function createJoystick(target: HTMLElement): JoystickSource {
  let display: Display = { quarters: 0, windowWidth: 0, windowHeight: 0 }
  let viewport: Viewport | null = null
  let pointerId: number | null = null
  let originPoint: Point | null = null
  let currentPoint: Point | null = null

  /**
   * Le quart inférieur gauche de l'AIRE DE JEU, pas de la fenêtre : sur un
   * écran plus large que 16:9, la marge latérale n'appartient pas au jeu.
   */
  const inCaptureZone = (local: Point): boolean => {
    if (viewport === null) {
      return false
    }
    const left = viewport.x
    const right = viewport.x + viewport.arenaWidth * viewport.scale
    const bottom = viewport.y + viewport.arenaHeight * viewport.scale
    const top = viewport.y + (viewport.arenaHeight * viewport.scale) / 2
    return local.x >= left && local.x <= (left + right) / 2 && local.y >= top && local.y <= bottom
  }

  const onDown = (event: PointerEvent): void => {
    if (pointerId !== null) {
      // Un seul doigt : pas de multi-touch dans ce lot.
      return
    }
    const local = screenToApp(event.clientX, event.clientY, display)
    if (!inCaptureZone(local)) {
      return
    }
    pointerId = event.pointerId
    originPoint = local
    currentPoint = local
  }

  const onMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return
    }
    currentPoint = screenToApp(event.clientX, event.clientY, display)
  }

  const onUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return
    }
    pointerId = null
    originPoint = null
    currentPoint = null
  }

  target.addEventListener('pointerdown', onDown)
  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  // `pointercancel` n'est pas décoratif : un appel entrant, un geste système
  // ou un défilement l'émettent SANS `pointerup`, et le joystick resterait
  // armé sur sa dernière position — le joueur partirait tout droit dans un mur.
  target.addEventListener('pointercancel', onUp)

  return {
    setDisplay(next: Display): void {
      display = next
    },

    setViewport(next: Viewport): void {
      viewport = next
    },

    origin(): Point | null {
      return originPoint
    },

    release(): void {
      pointerId = null
      originPoint = null
      currentPoint = null
    },

    // Se conforme à `InputSource` sans déclarer son second paramètre, comme
    // `keyboard.ts` : le joystick n'a pas besoin de savoir où est le joueur.
    writeInto(input: InputState): void {
      if (originPoint === null || currentPoint === null) {
        input.moveX = 0
        input.moveY = 0
        // 1 et non 0 : un plafond nul survivrait au relâchement et
        // empêcherait la friction de ramener le point à l'arrêt proprement.
        input.speedCap = 1
        return
      }
      const v = joystickVector(
        originPoint.x,
        originPoint.y,
        currentPoint.x,
        currentPoint.y,
        JOYSTICK_RADIUS,
      )
      input.moveX = quantize(v.x)
      input.moveY = quantize(v.y)
      input.speedCap = v.magnitude === 0 ? 1 : quantize(v.magnitude)
    },

    destroy(): void {
      target.removeEventListener('pointerdown', onDown)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    },
  }
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Depuis `front/` : `npm test -- joystick`
Attendu : SUCCÈS, 7 tests.

- [ ] **Step 5 : vérifications complètes et commit**

```bash
cd front && npm run typecheck && npm run lint && npm test
cd .. && git add front/src/app/joystick.ts front/src/app/joystick.test.ts
git commit -m "feat(mobile): le coeur du joystick virtuel"
```

---

### Task 7 : brancher le joystick — halo, réglage, traductions

**Files:**
- Create: `front/src/ui/screens/joystick-halo.ts`
- Modify: `front/src/app/input-source.ts` (`MovementInput`, `resolveMovementInput`)
- Modify: `front/src/ui/screens/settings.ts` (`movementLabel`, `toggleMovementInput`)
- Modify: `front/src/app/game.ts` (création, choix de source, `applyLayout`, `beginCountdown`)
- Modify: `front/src/i18n/locales/en.json`, `front/src/i18n/locales/fr.json`
- Test: `front/src/app/input-source.test.ts` (ajouter)

**Interfaces:**
- Consumes: `createJoystick`, `JoystickSource`, `JOYSTICK_RADIUS` (tâche 6) ; `Display` (tâche 1).
- Produces:
  - `type MovementInput = 'keyboard' | 'mouse' | 'joystick' | 'tilt'`
  - `resolveMovementInput(coarsePointer: boolean): MovementInput` — **signature élargie d'un paramètre**.
  - `createJoystickHalo(root: HTMLElement): { setOrigin(point: Point | null): void; setVisible(visible: boolean): void; destroy(): void }`

  `'tilt'` est déclaré dès maintenant mais aucune source ne le sert : le lot 2 l'ajoutera. `resolveMovementInput` le rabat sur `'joystick'` en attendant, pour qu'une valeur stockée par une future version ne rende jamais le jeu injouable.

- [ ] **Step 1 : écrire le test qui échoue**

`front/src/app/input-source.test.ts` existe et contient un seul cas, qui appelle `resolveMovementInput()` sans argument : il doit être **réécrit**, pas complété. Le motif de stockage factice est celui de `front/src/app/storage.test.ts` (`vi.stubGlobal` + `fakeLocalStorage`). Remplacer tout le contenu du fichier par :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fakeLocalStorage } from './fake-local-storage'
import { resolveMovementInput } from './input-source'
import { storage } from './storage'

describe('resolveMovementInput', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Sans `localStorage` du tout : `storage` rattrape l'erreur et rend le
  // défaut. C'est le cas d'un premier lancement, ou d'une navigation privée
  // qui refuse le stockage.
  it('choisit la souris par défaut sur pointeur fin', () => {
    expect(resolveMovementInput(false)).toBe('mouse')
  })

  it('choisit le joystick par défaut sur pointeur grossier', () => {
    expect(resolveMovementInput(true)).toBe('joystick')
  })

  it('honore une valeur stockée servie, quel que soit l’appareil', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    storage.set('movementInput', 'keyboard')
    expect(resolveMovementInput(true)).toBe('keyboard')
    expect(resolveMovementInput(false)).toBe('keyboard')
  })

  // Le lot 2 apportera l'inclinaison ; d'ici là, une valeur stockée par une
  // version future ne doit pas rendre le jeu injouable.
  it('rabat « tilt » sur le joystick tant que l’inclinaison n’existe pas', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    storage.set('movementInput', 'tilt')
    expect(resolveMovementInput(true)).toBe('joystick')
  })

  it('rabat une valeur corrompue sur le défaut de l’appareil', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    storage.set('movementInput', 'trackball')
    expect(resolveMovementInput(true)).toBe('joystick')
    expect(resolveMovementInput(false)).toBe('mouse')
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Depuis `front/` : `npm test -- input-source`
Attendu : ÉCHEC — `resolveMovementInput` ne prend pas d'argument et ne connaît pas `'joystick'`.

- [ ] **Step 3 : élargir `MovementInput`**

Dans `front/src/app/input-source.ts`, remplacer la fin du fichier :

```ts
export type MovementInput = 'keyboard' | 'mouse' | 'joystick' | 'tilt'

/**
 * Sources réellement servies aujourd'hui. `'tilt'` est déclaré dans le type
 * pour le lot 2 mais n'a pas encore de source : le rabattre ici évite qu'une
 * valeur stockée par une version future rende le jeu injouable.
 */
const SERVED: readonly MovementInput[] = ['keyboard', 'mouse', 'joystick']

/**
 * Valeur stockée si elle est servie ; sinon le défaut de l'appareil — joystick
 * au doigt, souris ailleurs. Le joystick ne dépend d'aucune permission ni
 * d'aucun capteur, c'est ce qui en fait le bon premier contact sur téléphone.
 */
export function resolveMovementInput(coarsePointer: boolean): MovementInput {
  const stored = storage.get<string>('movementInput', '')
  if ((SERVED as readonly string[]).includes(stored)) {
    return stored as MovementInput
  }
  return coarsePointer ? 'joystick' : 'mouse'
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Depuis `front/` : `npm test -- input-source`
Attendu : SUCCÈS.

- [ ] **Step 5 : ajouter les traductions**

Dans `front/src/i18n/locales/en.json`, à côté de `settings.movementMouse` :

```json
  "settings.movementJoystick": "Joystick",
```

Dans `front/src/i18n/locales/fr.json`, au même endroit :

```json
  "settings.movementJoystick": "Joystick",
```

- [ ] **Step 6 : basculer le réglage par paires**

Dans `front/src/ui/screens/settings.ts` :

Élargir `SettingsDeps` d'un champ, pour que l'écran sache sur quelle paire basculer :

```ts
export interface SettingsDeps {
  /** Branché sur `stage.setEffects` par `game.ts` (spec §6.8). */
  onReducedMotionChange(reduced: boolean): void
  /** Branché sur le choix de source d'entrée de `game.ts`. */
  onMovementInputChange(next: MovementInput): void
  /** Branché sur `audio.setVolume` par `game.ts` (spec §9.3). */
  onSfxVolumeChange(volume: number): void
  /** Décide de la paire proposée : joystick ↔ clavier au doigt, souris ↔ clavier ailleurs. */
  coarsePointer: boolean
}
```

Remplacer `movementLabel` :

```ts
  const movementLabel = (input: MovementInput): string => {
    if (input === 'joystick') {
      return t('settings.movementJoystick')
    }
    return input === 'mouse' ? t('settings.movementMouse') : t('settings.movementKeyboard')
  }
```

Remplacer `toggleMovementInput` :

```ts
  // Le basculement reste binaire ; seule la paire change avec l'appareil. Sur
  // téléphone, proposer « Souris » n'aurait aucun sens, et le clavier reste
  // utile pour une tablette avec clavier branché.
  const toggleMovementInput = (): void => {
    const pointerDevice: MovementInput = deps.coarsePointer ? 'joystick' : 'mouse'
    movementInput = movementInput === 'keyboard' ? pointerDevice : 'keyboard'
    storage.set('movementInput', movementInput)
    deps.onMovementInputChange(movementInput)
    render()
  }
```

Remplacer les deux appels `resolveMovementInput()` du fichier (ligne ~46 et dans `show()`) par `resolveMovementInput(deps.coarsePointer)`.

- [ ] **Step 7 : écrire le halo**

Créer `front/src/ui/screens/joystick-halo.ts` :

```ts
import { JOYSTICK_RADIUS } from '@/app/joystick'
import type { Point } from '@/app/input-source'

export interface JoystickHalo {
  /** `null` : le halo retourne à son ancrage de repos, en bas à gauche. */
  setOrigin(point: Point | null): void
  setVisible(visible: boolean): void
  destroy(): void
}

/** Marge de l'ancrage de repos par rapport au coin bas-gauche de la fenêtre. */
const ANCHOR_MARGIN = 92

/**
 * Repère visuel du joystick. `pointer-events-none` : il ne doit rien
 * intercepter — c'est `#app` qui écoute, sur toute la zone de capture, dont le
 * halo n'est que la partie visible.
 *
 * Monté sur `#ui`, donc à l'intérieur de `#app` : il subit la rotation avec le
 * reste et n'a aucune correction d'axes à faire.
 */
export function createJoystickHalo(root: HTMLElement): JoystickHalo {
  const el = document.createElement('div')
  el.className =
    'pointer-events-none absolute hidden rounded-full border-2 border-paper/30 bg-paper/5'
  el.style.width = `${JOYSTICK_RADIUS * 2}px`
  el.style.height = `${JOYSTICK_RADIUS * 2}px`
  root.appendChild(el)

  const place = (x: number, y: number): void => {
    el.style.left = `${x - JOYSTICK_RADIUS}px`
    el.style.top = `${y - JOYSTICK_RADIUS}px`
  }

  return {
    setOrigin(point: Point | null): void {
      if (point === null) {
        // Ancrage de repos : mesuré sur `root`, donc déjà dans le repère
        // pivoté. `offsetWidth`/`offsetHeight` et non `window.inner*`, qui
        // désignent l'écran non pivoté.
        place(ANCHOR_MARGIN, root.offsetHeight - ANCHOR_MARGIN)
        el.style.opacity = '0.5'
        return
      }
      place(point.x, point.y)
      el.style.opacity = '1'
    },

    setVisible(visible: boolean): void {
      el.classList.toggle('hidden', !visible)
    },

    destroy(): void {
      el.remove()
    },
  }
}
```

- [ ] **Step 8 : brancher le tout dans `game.ts`**

Dans `front/src/app/game.ts` :

Ajouter les imports :

```ts
import { createJoystick } from './joystick'
import { createJoystickHalo } from '@/ui/screens/joystick-halo'
```

Après `const mouse = createMouse()` :

```ts
  // Écoute sur `#app` et non `window` : la zone de capture se raisonne dans
  // le repère pivoté, et `#app` est ce repère.
  const joystick = createJoystick(appRoot)
  const joystickHalo = createJoystickHalo(uiRoot)
```

Remplacer `let movementInput: MovementInput = resolveMovementInput()` par :

```ts
  let movementInput: MovementInput = resolveMovementInput(coarsePointer)
```

Dans l'appel `createSettingsScreen`, ajouter `coarsePointer,` aux dépendances.

Dans `loop.onStep`, remplacer la sélection de source :

```ts
        // Une seule source par pas, jamais deux : la souris ayant toujours une
        // position et le téléphone bougeant sous le pouce, les composer
        // tirerait le point en continu.
        const source =
          movementInput === 'joystick' ? joystick : movementInput === 'mouse' ? mouse : keyboard
        source.writeInto(run.world.input, playerMotion())
```

Dans `loop.onRender`, après `syncCursorVisibility()`, ajouter le pilotage du halo :

```ts
      // Visible uniquement quand le joystick commande vraiment quelque chose.
      const joystickShown = movementInput === 'joystick' && machine.state === 'playing'
      joystickHalo.setVisible(joystickShown)
      if (joystickShown) {
        joystickHalo.setOrigin(joystick.origin())
      }
```

Dans `beginCountdown`, ajouter le relâchement, pour la même raison que `mouse.forgetTarget()` :

```ts
  function beginCountdown(): void {
    mouse.forgetTarget()
    // Le doigt qui vient de toucher « Reprendre » ne doit pas être lu comme
    // une commande dès la reprise.
    joystick.release()
    countdown.start()
    ...
```

Dans `applyLayout`, après les deux lignes de `mouse` :

```ts
    joystick.setViewport(viewport)
    joystick.setDisplay(display)
```

- [ ] **Step 9 : vérifications complètes**

```bash
cd front && npm run typecheck && npm run lint && npm test
```
Attendu : les trois passent. Les tests de parité i18n valident la nouvelle clé dans les deux langues.

- [ ] **Step 10 : vérification visuelle**

`npm run dev`, émulation iPhone en paysage (852×393), lancer une partie.

Attendu : un halo semi-transparent en bas à gauche ; un contact n'importe où dans le quart inférieur gauche de l'aire de jeu y déplace le halo et pilote le point ; une déflexion à mi-course déplace le point visiblement plus lentement qu'une déflexion complète ; lever le doigt arrête le point en douceur ; le halo disparaît en pause et au menu. Dans les Réglages, la ligne « Déplacement » propose Joystick ↔ Clavier. En émulation portrait, tout ce qui précède reste vrai dans le repère pivoté — c'est le test qui prouve que `screenToApp` est correct.

- [ ] **Step 11 : commit**

```bash
git add front/src/app/joystick.ts front/src/app/input-source.ts front/src/app/input-source.test.ts front/src/app/game.ts front/src/ui/screens/joystick-halo.ts front/src/ui/screens/settings.ts front/src/i18n/locales/en.json front/src/i18n/locales/fr.json
git commit -m "feat(mobile): brancher le joystick, son halo et son reglage"
```

---

### Task 8 : `--ui` piloté depuis JavaScript

**Files:**
- Create: `front/src/ui/ui-scale.ts`
- Modify: `front/src/styles/main.css` (bloc `#ui`)
- Modify: `front/src/app/game.ts` (`applyLayout`)
- Test: `front/src/ui/ui-scale.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `uiScalePx(opts: { viewHeight: number; coarsePointer: boolean }): number`.

**Pourquoi cette tâche existe.** La rampe vaut `clamp(18px, 1.4vh + 8px, 30px)`. Sous la rotation CSS de la tâche 2, `vh` désigne toujours le côté **long** de l'écran physique : en portrait pivoté, tout le texte serait dimensionné sur la mauvaise dimension. Le plancher relevé sur pointeur grossier est le second motif — à 18 px, `ui-2xs` (×0,58) fait 10 px sur un téléphone.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `front/src/ui/ui-scale.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { uiScalePx } from './ui-scale'

describe('uiScalePx', () => {
  // Reproduit `clamp(18px, 1.4vh + 8px, 30px)` sur pointeur fin : le rendu au
  // bureau ne doit pas bouger d'un pixel.
  it('reproduit la rampe historique sur pointeur fin', () => {
    expect(uiScalePx({ viewHeight: 1000, coarsePointer: false })).toBeCloseTo(22, 6)
    expect(uiScalePx({ viewHeight: 720, coarsePointer: false })).toBeCloseTo(18.08, 6)
  })

  it('applique le plancher de 18 px sur pointeur fin', () => {
    expect(uiScalePx({ viewHeight: 300, coarsePointer: false })).toBe(18)
  })

  // Le plafond existe pour la 4K : au-delà, agrandir ne rend plus rien plus
  // lisible.
  it('applique le plafond de 30 px', () => {
    expect(uiScalePx({ viewHeight: 4000, coarsePointer: false })).toBe(30)
    expect(uiScalePx({ viewHeight: 4000, coarsePointer: true })).toBe(30)
  })

  // Le vrai motif : un téléphone en paysage fait ~393 px de haut, la rampe y
  // est au plancher, et 18 px donnent un `ui-2xs` de 10 px.
  it('relève le plancher sur pointeur grossier', () => {
    expect(uiScalePx({ viewHeight: 393, coarsePointer: true })).toBe(22)
    expect(uiScalePx({ viewHeight: 393, coarsePointer: false })).toBe(18)
  })

  it('prend la hauteur EFFECTIVE, celle passée en argument', () => {
    // Sous rotation, l'appelant passe `window.innerWidth` : la fonction n'a
    // aucun moyen de lire `vh` et c'est exactement l'intention.
    expect(uiScalePx({ viewHeight: 393, coarsePointer: true })).not.toBe(
      uiScalePx({ viewHeight: 852, coarsePointer: true }),
    )
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Depuis `front/` : `npm test -- ui-scale`
Attendu : ÉCHEC — `Failed to resolve import "./ui-scale"`.

- [ ] **Step 3 : écrire la fonction**

Créer `front/src/ui/ui-scale.ts` :

```ts
/** Plancher au bureau : au-dessus de l'existant, pas à son niveau (cf. `main.css`). */
const FLOOR_FINE = 18
/**
 * Plancher au doigt. Un téléphone en paysage fait ~393 px de haut, donc la
 * rampe y est au plancher quoi qu'il arrive : c'est ce nombre, et lui seul,
 * qui décide de la lisibilité des menus sur mobile. À 18, `ui-2xs` (×0,58)
 * tombe à 10 px.
 */
const FLOOR_COARSE = 22
/** Plafond pour la 4K : passé une certaine taille, agrandir ne rend plus rien plus lisible. */
const CEILING = 30

/**
 * Ce que valait `clamp(18px, 1.4vh + 8px, 30px)`, mais calculé sur la hauteur
 * **effective** de l'aire de jeu plutôt que sur `vh`.
 *
 * La différence n'est pas cosmétique : sous la rotation CSS de `#app`, `vh`
 * désigne le côté long de l'écran physique, donc la rampe se calerait sur la
 * mauvaise dimension et tout le texte serait faux en portrait pivoté.
 */
export function uiScalePx(opts: { viewHeight: number; coarsePointer: boolean }): number {
  const floor = opts.coarsePointer ? FLOOR_COARSE : FLOOR_FINE
  return Math.min(CEILING, Math.max(floor, opts.viewHeight * 0.014 + 8))
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Depuis `front/` : `npm test -- ui-scale`
Attendu : SUCCÈS, 5 tests.

- [ ] **Step 5 : brancher sur `applyLayout` et amender le CSS**

Dans `front/src/app/game.ts`, ajouter l'import `import { uiScalePx } from '@/ui/ui-scale'`, puis à la fin d'`applyLayout` :

```ts
    // Style en ligne : il l'emporte sur la règle de `main.css`, qui ne reste
    // que comme valeur avant l'exécution du script.
    uiRoot.style.setProperty('--ui', `${uiScalePx({ viewHeight: viewH, coarsePointer })}px`)
```

Dans `front/src/styles/main.css`, remplacer le paragraphe de commentaire qui commence par `` `vh` et non `vw` `` par :

```
   `vh` et non `vw` : l'arène est en 16:9 et cadrée par sa dimension la plus
   contrainte ; sur une fenêtre large et basse, c'est la hauteur qui dit la
   taille réellement perçue.

   ATTENTION : cette valeur n'est qu'un défaut avant l'exécution du script.
   `app/game.ts` écrit `--ui` en style en ligne sur `#ui` à chaque
   `applyLayout`, via `ui/ui-scale.ts`. C'est nécessaire parce que `#app` peut
   être pivoté d'un quart de tour sur téléphone : `vh` y désigne alors le côté
   LONG de l'écran, et la rampe se calerait sur la mauvaise dimension. Toute
   modification de la formule ci-dessous doit être reportée dans
   `ui/ui-scale.ts`, et l'inverse.
```

- [ ] **Step 6 : vérifications complètes**

```bash
cd front && npm run typecheck && npm run lint && npm test
```
Attendu : les trois passent.

- [ ] **Step 7 : vérification visuelle**

`npm run dev`. En fenêtre de bureau, comparer les menus à ce qu'ils étaient : **aucun changement visible**. En émulation iPhone paysage puis portrait : les menus, l'écran des réglages et l'écran de fin sont lisibles, et de la même taille dans les deux orientations — c'est ce dernier point qui prouve que la hauteur effective est bien celle qui est utilisée.

- [ ] **Step 8 : commit**

```bash
git add front/src/ui/ui-scale.ts front/src/ui/ui-scale.test.ts front/src/styles/main.css front/src/app/game.ts
git commit -m "fix(mobile): dimensionner l'interface sur la hauteur effective"
```

---

### Task 9 : la cible de pause tactile

**Files:**
- Create: `front/src/ui/screens/touch-pause.ts`
- Modify: `front/src/app/game.ts`
- Modify: `front/src/i18n/locales/en.json`, `front/src/i18n/locales/fr.json`

**Interfaces:**
- Consumes: `Viewport` (`@/render/viewport`).
- Produces: `createTouchPause(root: HTMLElement, onPause: () => void): { setViewport(v: Viewport): void; setVisible(visible: boolean): void; destroy(): void }`.

**Position :** coin **bas-droit** de l'arène. Le HUD occupe déjà les trois zones hautes — score à gauche, temps au centre, record à droite — et le coin bas-droit est la position de repos du pouce droit, symétrique du joystick et hors de sa zone de capture.

- [ ] **Step 1 : ajouter les traductions**

Dans `front/src/i18n/locales/en.json` :

```json
  "hud.pause": "Pause",
```

Dans `front/src/i18n/locales/fr.json` :

```json
  "hud.pause": "Pause",
```

Lancer `npm test -- parity` depuis `front/`.
Attendu : SUCCÈS — la clé existe dans les deux langues.

- [ ] **Step 2 : écrire la cible**

Créer `front/src/ui/screens/touch-pause.ts` :

```ts
import type { Viewport } from '@/render/viewport'
import { onLocaleChange, t } from '@/i18n'

export interface TouchPause {
  setViewport(viewport: Viewport): void
  setVisible(visible: boolean): void
  destroy(): void
}

/** Écart au coin de l'arène, en pixels de fenêtre. */
const INSET = 16
/** Côté de la cible. 48 px : au-dessus du minimum tactile usuel de 44. */
const SIZE = 48

/**
 * Il n'y a pas d'`Échap` sur téléphone. Posée sur `#ui` et non dans le HUD :
 * celui-ci est `pointer-events-none` et mis à l'échelle par un `transform`,
 * qui deviendrait le repère de tout enfant.
 *
 * Coin bas-droit : le HUD tient déjà les trois zones hautes, et c'est là que
 * repose le pouce droit — symétrique du joystick, hors de sa zone de capture.
 */
export function createTouchPause(root: HTMLElement, onPause: () => void): TouchPause {
  const el = document.createElement('button')
  el.type = 'button'
  el.className =
    'pointer-events-auto absolute hidden items-center justify-center rounded-full border border-paper/40 bg-ink-deep/60 text-paper opacity-70'
  el.style.width = `${SIZE}px`
  el.style.height = `${SIZE}px`
  // Le contenu visible est un pictogramme, mais l'étiquette lue par les
  // technologies d'assistance est du texte : elle doit suivre la langue, que
  // les Réglages peuvent changer en cours de session.
  const label = (): void => el.setAttribute('aria-label', t('hud.pause'))
  label()
  onLocaleChange(label)
  el.innerHTML = '<span class="ui-sm tracking-widest">| |</span>'
  el.addEventListener('click', onPause)
  root.appendChild(el)

  return {
    setViewport(viewport: Viewport): void {
      const right = viewport.x + viewport.arenaWidth * viewport.scale
      const bottom = viewport.y + viewport.arenaHeight * viewport.scale
      el.style.left = `${right - SIZE - INSET}px`
      el.style.top = `${bottom - SIZE - INSET}px`
    },

    setVisible(visible: boolean): void {
      el.classList.toggle('hidden', !visible)
      el.classList.toggle('flex', visible)
    },

    destroy(): void {
      el.removeEventListener('click', onPause)
      el.remove()
    },
  }
}
```

- [ ] **Step 3 : brancher dans `game.ts`**

Dans `front/src/app/game.ts`, ajouter l'import `import { createTouchPause } from '@/ui/screens/touch-pause'`.

Extraire d'abord la mise en pause, aujourd'hui écrite en ligne dans l'écouteur `keydown`, pour que les deux appelants partagent le même chemin. Ajouter près de `beginCountdown` :

```ts
  /**
   * Volontairement pas depuis `wavePause` : la machine à états n'a pas de
   * retour de `paused` vers `wavePause`, y entrer perdrait la carte en cours
   * de choix. Depuis `countdown`, en revanche, remettre en pause est le
   * comportement attendu — le joueur n'a pas encore repris la main.
   */
  function requestPause(): void {
    if (machine.state !== 'playing' && machine.state !== 'countdown') {
      return
    }
    countdownScreen.hide()
    machine.send('PAUSE')
    pauseScreen.show()
  }
```

Dans l'écouteur `keydown`, remplacer le bloc final par :

```ts
    if (e.code === 'Escape') {
      requestPause()
    }
```

(supprimer le commentaire qui le précédait : il a suivi la fonction `requestPause`.)

Après la création du halo du joystick :

```ts
  const touchPause = createTouchPause(uiRoot, requestPause)
```

`requestPause` étant une déclaration de fonction, elle est remontée : l'ordre des lignes n'a pas d'importance.

Dans `loop.onRender`, à côté du pilotage du halo :

```ts
      touchPause.setVisible(
        coarsePointer && (machine.state === 'playing' || machine.state === 'countdown'),
      )
```

Dans `applyLayout`, à côté des autres `setViewport` :

```ts
    touchPause.setViewport(viewport)
```

- [ ] **Step 4 : vérifications complètes**

```bash
cd front && npm run typecheck && npm run lint && npm test
```
Attendu : les trois passent.

- [ ] **Step 5 : vérification visuelle**

`npm run dev`, émulation iPhone paysage, lancer une partie.

Attendu : une pastille de pause au coin bas-droit de l'arène ; un tap ouvre l'écran de pause ; elle disparaît en pause, au menu et sur l'écran de fin ; elle ne gêne pas le joystick, qui reste cantonné au quart inférieur gauche. En fenêtre de bureau, elle n'apparaît jamais et `Échap` fonctionne comme avant.

- [ ] **Step 6 : commit**

```bash
git add front/src/ui/screens/touch-pause.ts front/src/app/game.ts front/src/i18n/locales/en.json front/src/i18n/locales/fr.json
git commit -m "feat(mobile): une cible de pause au doigt"
```

---

## Vérification de fin de lot

À faire une fois les neuf tâches terminées, **avant** d'annoncer le lot comme fini.

- [ ] Depuis `front/` : `npm run typecheck && npm run lint && npm test && npm run build`, les quatre passent.
- [ ] `npm run test:browser` passe sur les trois moteurs : c'est lui qui prouve que `speedCap` et `rangeScale` n'ont pas cassé le déterminisme inter-moteurs dont dépend le futur leaderboard.
- [ ] `sim/determinism.test.ts` passe **avec son empreinte de référence d'origine**, jamais régénérée.
- [ ] Mettre à jour le tableau « Controls » de `README.md` : le joystick et la pause tactile sur téléphone.
- [ ] Signaler à la session du leaderboard que `InputState` porte désormais trois champs.

**Ce qui ne peut pas être vérifié ici, et doit l'être par le propriétaire du projet sur téléphone, sur l'URL HTTPS déployée :**

- La sensation du joystick — `JOYSTICK_RADIUS` (56 px) et `JOYSTICK_DEAD_ZONE` (0,15) sont des points de départ.
- La sécheresse du plafond de vitesse au relâchement (spec §5).
- L'atteignabilité de la pause et du joystick au pouce, main tenant l'appareil.
- L'équilibrage de l'arène 896×504 : les portées mises à l'échelle donnent-elles un jeu qui se tient, ou faut-il aussi toucher aux vitesses des ennemis ? La spec §3 laisse la question ouverte, délibérément.

Ne rien annoncer de tout cela comme « vérifié » sur la seule foi des tests unitaires ou de l'émulation Chrome.
