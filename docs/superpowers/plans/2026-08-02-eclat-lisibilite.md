# Lisibilité de l'Éclat — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à l'Éclat une apparence reconnaissable en permanence, et rendre visibles son télégraphe de 500 ms et sa charge de 900 ms, qu'aucune ligne de `src/render/` ne dessine aujourd'hui.

**Architecture:** Tout se passe dans `src/render/`. La simulation possède déjà l'information — le composant `Dasher` porte l'état (0 approche, 1 télégraphe, 2 charge) et son minuteur — mais personne ne la lit côté rendu. On ajoute une couleur d'encre à la palette, une facette triangulaire au liseré de l'Éclat, un troisième `Graphics` dans la vue ennemie pour l'anneau et le trait de télégraphe, et une seconde instance d'images rémanentes pour la charge. **Aucun fichier de `src/sim/` n'est modifié.**

**Tech Stack:** TypeScript strict, PixiJS v8 (`Graphics`), bitECS (lecture seule depuis le rendu), Vitest en environnement `node`, Biome, Tailwind v4.

## Global Constraints

- **`src/sim/` n'est pas touché.** Ni les états `Dasher`, ni leurs durées, ni les vitesses. Le problème est qu'on ne les montre pas.
- **Ce qui est affiché est ce qui tue.** Le disque de rayon `Collider.radius` est la hitbox : rien ne doit changer la silhouette extérieure. Ce qui ne tue pas se dessine en pointillé — la convention est déjà posée par le contour d'apparition dans `views/enemy.ts`.
- **Pas de `!` dans `src/render/`.** L'assertion non-nulle est réservée à `src/sim/`. Les accès à un tableau de composant passent par le helper `at()` de `stage.ts`, qui lève plutôt que de mentir sur le type (`noUncheckedIndexedAccess` est actif).
- **`src/render/ink.ts` est le miroir de la palette de `src/styles/main.css`.** Toute couleur ajoutée à l'un doit l'être à l'autre ; le fichier déclare toute divergence comme un bug.
- **Commentaires en français**, comme tout le reste du dépôt.
- **Conventional Commits**, imposés par Husky + commitlint. Scope `render` pour tout ce plan.
- **Aucune clé i18n**, aucun texte affiché.
- Commandes : `npm test` (Vitest), `npm run lint` (`biome check src`), `npm run typecheck` (`tsc --noEmit`). Un fichier seul : `npx vitest run <chemin>`.

**Spec de référence :** `docs/superpowers/specs/2026-08-02-eclat-lisibilite-design.md`

## Structure des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| `src/render/ink.ts` | +`shard: 0xb25ce0` dans `INK` | 1 |
| `src/styles/main.css` | +`--color-shard: #b25ce0` | 1 |
| `src/render/views/enemy.ts` | couleur par espèce, facette, anneau et trait de télégraphe | 1, 2, 3 |
| `src/render/views/enemy.test.ts` | **neuf** — fonctions pures de la vue ennemie | 1, 2, 3 |
| `src/render/stage.ts` | lit `Enemy.type`, `Dasher`, `Velocity` ; hisse la position du joueur ; émet les fantômes d'Éclat | 1, 2, 3, 4 |
| `src/render/fx/afterimage.ts` | généralisé : silhouette et plafond deviennent des paramètres | 4 |
| `src/render/fx/afterimage.test.ts` | **neuf** — plafond, silhouette, fin de vie | 4 |

---

### Task 1 : Une encre pour l'Éclat

**Files:**
- Modify: `src/render/ink.ts:3-10`
- Modify: `src/styles/main.css:12-15`
- Modify: `src/render/views/enemy.ts` (l'interface `EnemyView`, la ligne de couleur `enemy.ts:46`, la clé de cache `enemy.ts:35`)
- Modify: `src/render/stage.ts` (l'appel à `view.update`, l. ~253-261)
- Test: `src/render/views/enemy.test.ts` (créer)

**Interfaces:**
- Consumes: rien.
- Produces: `INK.shard: number` ; `enemyBodyColor(type: EnemyType, frozen: boolean, whiten: number): number` exportée de `views/enemy.ts` ; le champ `type: EnemyType` dans les options de `EnemyView.update`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/render/views/enemy.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { INK } from '../ink'
import { enemyBodyColor } from './enemy'

describe('enemyBodyColor', () => {
  it("donne à l'Éclat une encre à lui", () => {
    expect(enemyBodyColor('shard', false, 0)).toBe(INK.shard)
    expect(enemyBodyColor('shard', false, 0)).not.toBe(enemyBodyColor('point', false, 0))
  })

  it('laisse le Point et le Blot en rouge', () => {
    expect(enemyBodyColor('point', false, 0)).toBe(INK.danger)
    expect(enemyBodyColor('blot', false, 0)).toBe(INK.danger)
  })

  it("fait passer le gel avant l'espèce : un Éclat gelé est bleu comme les autres", () => {
    expect(enemyBodyColor('shard', true, 0)).toBe(INK.frost)
    expect(enemyBodyColor('shard', true, 0)).toBe(enemyBodyColor('point', true, 0))
  })

  it('blanchit complètement à la mort, gelé ou non', () => {
    expect(enemyBodyColor('shard', false, 1)).toBe(INK.paper)
    expect(enemyBodyColor('shard', true, 1)).toBe(INK.paper)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/render/views/enemy.test.ts`
Expected: FAIL — `enemyBodyColor is not a function` et `INK.shard` vaut `undefined`.

- [ ] **Step 3 : Ajouter la couleur à la palette**

Dans `src/render/ink.ts`, ajouter la ligne à l'objet `INK`, après `frost` :

```ts
  frost: 0x8fd8ff,
  /** Encre violette de l'Éclat. Seul créneau de teinte libre entre `danger`
   *  (0°), `blast` (45°) et `frost` (200°), et il reste distinguable du rouge
   *  en deutéranopie — le rouge y vire brun, le violet bleuté. */
  shard: 0xb25ce0,
```

Dans `src/styles/main.css`, après `--color-frost` :

```css
  --color-shard: #b25ce0;
```

- [ ] **Step 4 : Écrire `enemyBodyColor` dans `views/enemy.ts`**

Ajouter l'import de type en haut du fichier, après l'import de `pixi.js` :

```ts
import type { EnemyType } from '@/sim/data/enemies'
```

Puis, avant `createEnemyView`, la table et la fonction :

```ts
/**
 * Couleur d'encre par espèce. Table côté rendu, comme `COLORS` par kind de zone
 * dans `views/hazard.ts` : la simulation n'a pas à connaître les couleurs.
 * Le Point et le Blot se distinguent déjà par leur rayon (7 contre 14) ;
 * l'Éclat, à 6, était indiscernable d'un Point.
 */
const ENEMY_COLOR: Record<EnemyType, number> = {
  point: INK.danger,
  shard: INK.shard,
  blot: INK.danger,
}

/**
 * Le gel l'emporte sur l'espèce : quand un ennemi est immobilisé, c'est
 * l'information utile à cet instant. Une deuxième couleur mortelle ne crée
 * aucune ambiguïté — `frost` en est déjà une, et la grammaire du jeu est
 * « plein = mortel », pas « rouge = mortel ».
 */
export function enemyBodyColor(type: EnemyType, frozen: boolean, whiten: number): number {
  return mixColor(frozen ? INK.frost : ENEMY_COLOR[type], INK.paper, whiten)
}
```

- [ ] **Step 5 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/render/views/enemy.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6 : Brancher la couleur dans la vue**

Dans `src/render/views/enemy.ts`, ajouter `type` aux options de `update` de l'interface `EnemyView`, après `radius` :

```ts
    radius: number
    type: EnemyType
```

Dans la déstructuration de `update`, ajouter `type`. Remplacer la ligne 46 et son commentaire :

```ts
      // Blanchiment pendant le temps d'arrêt de la séquence de mort : le monde
      // est suspendu, les ennemis cessent d'être menaçants.
      const color = enemyBodyColor(type, frozen, whiten)
```

Ajouter l'espèce à la clé de cache — sans elle, une vue recyclée par bitECS pour une entité d'un autre type garderait le dessin du précédent :

```ts
      const key = `${radius.toFixed(1)}|${type}|${materializeProgress.toFixed(2)}|${frozen}|${whiten.toFixed(2)}`
```

- [ ] **Step 7 : Passer l'espèce depuis `stage.ts`**

Dans `src/render/stage.ts`, ajouter l'import après celui de `POWERUP_BY_ID` :

```ts
import { ENEMY_TYPE_BY_ID } from '@/sim/data/enemies'
```

Dans la boucle ennemie, avant l'appel à `view.update`, lire l'espèce. Le `?? 'point'` est imposé par `noUncheckedIndexedAccess`, comme le `?? 'blast'` déjà présent pour `POWERUP_BY_ID` :

```ts
        const type = ENEMY_TYPE_BY_ID[at(Enemy.type, eid)] ?? 'point'
```

Et ajouter `type,` dans l'objet passé à `view.update`, après `radius`.

- [ ] **Step 8 : Vérifier la suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: tout passe.

- [ ] **Step 9 : Commit**

```bash
git add src/render/ink.ts src/styles/main.css src/render/views/enemy.ts src/render/views/enemy.test.ts src/render/stage.ts
git commit -m "feat(render): une encre violette pour l'Éclat, que rien ne distinguait d'un Point"
```

---

### Task 2 : La facette triangulaire

Le liseré intérieur de l'Éclat devient un triangle inscrit, orienté vers sa direction de visée. Cette tâche introduit aussi l'angle de visée, dont la tâche 3 se sert pour le trait de télégraphe.

**Files:**
- Modify: `src/render/views/enemy.ts` (interface, branche solide du dessin, clé de cache)
- Modify: `src/render/stage.ts` (hisser la position interpolée du joueur, calculer l'angle de visée)
- Test: `src/render/views/enemy.test.ts` (compléter)

**Interfaces:**
- Consumes: `enemyBodyColor` et le champ `type` de la tâche 1.
- Produces: `facetPoints(radius: number, angle: number): number[]` exportée de `views/enemy.ts` ; les champs `aim: number` dans les options de `EnemyView.update` ; les locales `playerX`, `playerY`, `enemyX`, `enemyY`, `dashState` dans `sync` de `stage.ts`, dont les tâches 3 et 4 se servent.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `src/render/views/enemy.test.ts` :

```ts
import { facetPoints } from './enemy'

describe('facetPoints', () => {
  it('rend trois sommets, soit six coordonnées', () => {
    expect(facetPoints(6, 0)).toHaveLength(6)
  })

  it('pose le premier sommet sur l’angle demandé', () => {
    const [x, y] = facetPoints(6, 0)
    expect(x).toBeCloseTo(6, 10)
    expect(y).toBeCloseTo(0, 10)
  })

  it('pose tous les sommets sur le cercle du rayon donné', () => {
    const pts = facetPoints(6, 0.7)
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i] ?? 0, pts[i + 1] ?? 0)).toBeCloseTo(6, 10)
    }
  })

  it('espace les sommets de 120°', () => {
    const pts = facetPoints(6, 0)
    const angles = [0, 2, 4].map((i) => Math.atan2(pts[i + 1] ?? 0, pts[i] ?? 0))
    const ecart = ((angles[1] ?? 0) - (angles[0] ?? 0) + Math.PI * 2) % (Math.PI * 2)
    expect(ecart).toBeCloseTo((Math.PI * 2) / 3, 10)
  })

  it('creuse la moitié du rayon en milieu d’arête, ce qui est ce qui rend la facette visible', () => {
    const pts = facetPoints(6, 0)
    const milieu = {
      x: ((pts[0] ?? 0) + (pts[2] ?? 0)) / 2,
      y: ((pts[1] ?? 0) + (pts[3] ?? 0)) / 2,
    }
    expect(Math.hypot(milieu.x, milieu.y)).toBeCloseTo(3, 10)
  })

  it('tourne avec l’angle', () => {
    const [x, y] = facetPoints(6, Math.PI / 2)
    expect(x).toBeCloseTo(0, 10)
    expect(y).toBeCloseTo(6, 10)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/render/views/enemy.test.ts`
Expected: FAIL — `facetPoints is not a function`.

- [ ] **Step 3 : Écrire `facetPoints`**

Dans `src/render/views/enemy.ts`, après `enemyBodyColor` :

```ts
/**
 * Sommets du triangle inscrit qui marque l'Éclat, premier sommet sur `angle`.
 * Trois côtés et pas plus : un polygone à `n` côtés s'écarte du cercle de
 * `r · (1 - cos(π/n))` en milieu d'arête, soit 0,8 px pour un hexagone à r = 6
 * — invisible — contre 3 px pour un triangle, la moitié du rayon.
 */
export function facetPoints(radius: number, angle: number): number[] {
  const pts: number[] = []
  for (let i = 0; i < 3; i++) {
    const a = angle + (i * 2 * Math.PI) / 3
    pts.push(Math.cos(a) * radius, Math.sin(a) * radius)
  }
  return pts
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/render/views/enemy.test.ts`
Expected: PASS — 9 tests au total.

- [ ] **Step 5 : Dessiner la facette**

Dans `src/render/views/enemy.ts`, ajouter `aim` aux options de `update` de l'interface :

```ts
    /** Angle de visée : sens du déplacement en charge, direction du joueur sinon. */
    aim: number
```

L'ajouter à la déstructuration, puis remplacer la branche solide (l'actuel `else` de `materializeProgress < 1`) par :

```ts
      } else {
        body.circle(0, 0, radius).fill({ color })
        // Liseré tracé À L'INTÉRIEUR du rayon de collision : le disque affiché
        // doit rester exactement le disque qui tue. Un contour centré sur
        // `radius` déborderait de la moitié de son épaisseur et annoncerait une
        // zone mortelle plus large que la vraie.
        const edge = 1
        const inner = radius - edge / 2
        if (type === 'shard') {
          // La facette : le remplissage reste le disque, seul le liseré change,
          // donc la silhouette extérieure — la hitbox — ne bouge pas.
          body.poly(facetPoints(inner, aim))
        } else {
          body.circle(0, 0, inner)
        }
        body.stroke({ color: INK.paper, width: edge, alpha: 0.55 })
      }
```

Ajouter l'orientation à la clé de cache. Quantifiée au dixième de radian — à r = 6 cela vaut 0,6 px, en deçà rien ne se verrait et le corps se redessinerait pour rien — et neutralisée hors Éclat, où elle n'entre dans aucun tracé :

```ts
      const facet = type === 'shard' ? Math.round(aim * 10) : 0
      const key = `${radius.toFixed(1)}|${type}|${materializeProgress.toFixed(2)}|${frozen}|${whiten.toFixed(2)}|${facet}`
```

- [ ] **Step 6 : Hisser la position interpolée du joueur dans `stage.ts`**

La visée doit pointer le joueur **interpolé**, pas sa position de simulation : à pleine vitesse, l'écart d'un pas se voit à la pointe du trait. Or `playerX` / `playerY` sont aujourd'hui calculés dans le bloc joueur, après la boucle ennemie.

Dans `src/render/stage.ts`, juste avant `const liveEnemies = new Set<number>()` :

```ts
      // Hissé au-dessus de la boucle ennemie : la visée de l'Éclat pointe le
      // joueur interpolé, pas sa position de simulation.
      const p = world.playerEid
      const playerX = p >= 0 ? lerp(at(PrevPosition.x, p), at(Position.x, p), alpha) : 0
      const playerY = p >= 0 ? lerp(at(PrevPosition.y, p), at(Position.y, p), alpha) : 0
```

Puis, dans le bloc joueur plus bas, supprimer les trois lignes devenues des doublons — `const p = world.playerEid`, `const playerX = ...` et `const playerY = ...` — en laissant `const playerAngle = at(Facing.angle, p)` et le reste inchangés.

- [ ] **Step 7 : Calculer l'angle de visée dans la boucle ennemie**

Ajouter `Dasher` et `Velocity` à l'import de `@/sim/components` (liste alphabétique : `Dasher` avant `Dashing`, `Velocity` en fin).

Dans la boucle ennemie, garder `const materializing` et `const progress` tels quels, puis remplacer **la ligne `const type` posée à la tâche 1 et tout l'appel `view.update`** par le bloc suivant, qui absorbe cette ligne :

```ts
        const enemyX = lerp(at(PrevPosition.x, eid), at(Position.x, eid), alpha)
        const enemyY = lerp(at(PrevPosition.y, eid), at(Position.y, eid), alpha)
        const type = ENEMY_TYPE_BY_ID[at(Enemy.type, eid)] ?? 'point'
        const dashState = hasComponent(world, Dasher, eid) ? at(Dasher.state, eid) : 0
        // En charge, la trajectoire est figée et ne suit plus le joueur : viser
        // le joueur mentirait précisément au moment où ça compte. Pendant le
        // télégraphe la vitesse est nulle par construction, elle ne donne
        // aucune direction — d'où les deux règles plutôt qu'une.
        const aim =
          dashState === 2
            ? Math.atan2(at(Velocity.y, eid), at(Velocity.x, eid))
            : Math.atan2(playerY - enemyY, playerX - enemyX)

        view.update({
          x: enemyX,
          y: enemyY,
          radius: at(Collider.radius, eid),
          type,
          aim,
          materializeProgress: progress,
          frozen: hasComponent(world, Frozen, eid),
          whiten: deathState?.whiten ?? 0,
        })
```

- [ ] **Step 8 : Vérifier la suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: tout passe.

- [ ] **Step 9 : Commit**

```bash
git add src/render/views/enemy.ts src/render/views/enemy.test.ts src/render/stage.ts
git commit -m "feat(render): une facette triangulaire pour l'Éclat, orientée vers sa visée"
```

---

### Task 3 : L'anneau et le trait de télégraphe

Les 500 ms d'immobilité de l'Éclat gagnent deux signaux distincts : un anneau pointillé qui se contracte jusqu'au corps — *quand* — et un trait pointillé vers le joueur — *où*.

**Files:**
- Modify: `src/render/views/enemy.ts` (troisième `Graphics`, ordre de dessin, deux fonctions pures)
- Modify: `src/render/stage.ts` (avancement du télégraphe, distance au joueur)
- Test: `src/render/views/enemy.test.ts` (compléter)

**Interfaces:**
- Consumes: `aim`, `dashState`, `type` des tâches 1 et 2.
- Produces: `TELEGRAPH_RING_START: number`, `telegraphRingRadius(radius: number, progress: number): number`, `telegraphFade(progress: number, from: number, to: number): number`, `dashedCircle(gfx: Graphics, radius: number, segments: number): void` exportées de `views/enemy.ts` ; les champs `dashState: number`, `telegraphProgress: number`, `aimLength: number` dans les options de `EnemyView.update`.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `src/render/views/enemy.test.ts` :

```ts
import { TELEGRAPH_RING_START, telegraphFade, telegraphRingRadius } from './enemy'

describe('telegraphRingRadius', () => {
  it('part à quatre fois le rayon du corps', () => {
    expect(telegraphRingRadius(6, 0)).toBe(6 * TELEGRAPH_RING_START)
  })

  it('touche EXACTEMENT le corps à la fin : c’est le contact qui annonce le tir', () => {
    expect(telegraphRingRadius(6, 1)).toBe(6)
  })

  it('se contracte sans jamais repartir en arrière', () => {
    let precedent = Number.POSITIVE_INFINITY
    for (let k = 0; k <= 1; k += 0.01) {
      const r = telegraphRingRadius(6, k)
      expect(r).toBeLessThanOrEqual(precedent + 1e-9)
      precedent = r
    }
  })

  it('reste borné si l’avancement sort de [0, 1]', () => {
    expect(telegraphRingRadius(6, -1)).toBe(6 * TELEGRAPH_RING_START)
    expect(telegraphRingRadius(6, 2)).toBe(6)
  })
})

describe('telegraphFade', () => {
  it('rend ses bornes aux extrémités', () => {
    expect(telegraphFade(0, 0.5, 0.9)).toBeCloseTo(0.5, 10)
    expect(telegraphFade(1, 0.5, 0.9)).toBeCloseTo(0.9, 10)
  })

  it('ne sort jamais de l’intervalle, même hors de [0, 1]', () => {
    for (let k = -0.5; k <= 1.5; k += 0.05) {
      const a = telegraphFade(k, 0, 0.7)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(0.7)
    }
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/render/views/enemy.test.ts`
Expected: FAIL — `telegraphRingRadius is not a function`.

- [ ] **Step 3 : Écrire les deux fonctions pures**

Dans `src/render/views/enemy.ts`, après `facetPoints` :

```ts
/** Rayon de départ de l'anneau de télégraphe, en multiples du rayon du corps. */
export const TELEGRAPH_RING_START = 4

/**
 * Rayon de l'anneau à l'avancement `progress` ∈ [0, 1] du télégraphe. Il atteint
 * **exactement** le rayon du corps à 1 : c'est le contact avec le disque qui
 * annonce le tir, pas une opacité à interpréter.
 */
export function telegraphRingRadius(radius: number, progress: number): number {
  const k = Math.min(1, Math.max(0, progress))
  return radius * (TELEGRAPH_RING_START - (TELEGRAPH_RING_START - 1) * k)
}

/** Interpolation d'opacité du télégraphe, bornée à ses extrémités. */
export function telegraphFade(progress: number, from: number, to: number): number {
  const k = Math.min(1, Math.max(0, progress))
  return from + (to - from) * k
}

/**
 * Trace le chemin d'un cercle en tirets — `segments` arcs d'un demi-pas chacun.
 * Ne peint pas : l'appelant enchaîne son propre `stroke`. Partagé par le contour
 * d'apparition et l'anneau de télégraphe, qui disent la même chose par la même
 * forme : « ceci ne tue pas ».
 */
export function dashedCircle(gfx: Graphics, radius: number, segments: number): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    gfx.moveTo(Math.cos(a0) * radius, Math.sin(a0) * radius)
    gfx.arc(0, 0, radius, a0, a0 + Math.PI / segments)
  }
}
```

Puis remplacer la boucle du contour d'apparition, qui devient un appel — c'est exactement le même tracé, extrait parce que le télégraphe en a besoin :

```ts
      if (materializeProgress < 1) {
        // Contour pointillé qui respire + anneau de compte à rebours.
        dashedCircle(body, radius, 10)
        body.stroke({ color, width: 1.6, alpha: 0.25 + materializeProgress * 0.5 })
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/render/views/enemy.test.ts`
Expected: PASS — 15 tests au total.

- [ ] **Step 5 : Ajouter le troisième `Graphics` et son dessin**

Dans `src/render/views/enemy.ts`, ajouter les trois champs à l'interface `EnemyView`, après `aim` :

```ts
    /** État `Dasher` : 0 approche, 1 télégraphe, 2 charge. 0 pour les non-Éclats. */
    dashState: number
    /** Avancement du télégraphe sur [0, 1]. Vaut 0 hors de l'état 1. */
    telegraphProgress: number
    /** Distance au joueur : longueur du trait de visée. */
    aimLength: number
```

Créer le calque, dessiné par-dessus le corps :

```ts
  const container = new Container()
  const body = new Graphics()
  const ring = new Graphics()
  const telegraph = new Graphics()
  container.addChild(body, ring, telegraph)
```

Dans `update`, ajouter `dashState`, `telegraphProgress`, `aimLength` à la déstructuration, puis insérer le bloc suivant **juste après** `container.y = y` et **avant** le calcul de la clé de cache :

```ts
      // Redessiné à chaque image, donc AVANT le court-circuit de cache : l'anneau
      // et le trait bougent en continu. Les faire entrer dans la clé du corps
      // l'invaliderait soixante fois par seconde et le cache ne servirait plus.
      telegraph.clear()
      if (dashState === 1) {
        // Pointillé, parce que ça ne tue pas — même convention, et désormais le
        // même tracé, que le contour d'apparition.
        dashedCircle(telegraph, telegraphRingRadius(radius, telegraphProgress), 12)
        telegraph.stroke({
          color: INK.shard,
          width: 1.2,
          alpha: telegraphFade(telegraphProgress, 0.5, 0.9),
        })

        // Le trait de visée, du bord du corps jusqu'au joueur.
        const tiret = 6
        const trou = 5
        for (let d = radius + trou; d < aimLength; d += tiret + trou) {
          const fin = Math.min(d + tiret, aimLength)
          telegraph.moveTo(Math.cos(aim) * d, Math.sin(aim) * d)
          telegraph.lineTo(Math.cos(aim) * fin, Math.sin(aim) * fin)
        }
        telegraph.stroke({
          color: INK.shard,
          width: 1.2,
          alpha: telegraphFade(telegraphProgress, 0, 0.7),
        })
      }
```

- [ ] **Step 6 : Alimenter le télégraphe depuis `stage.ts`**

Ajouter l'import du seuil de durée — `ENEMY_TYPE_BY_ID` vient déjà de ce module :

```ts
import { ENEMY_TYPE_BY_ID, SHARD_TELEGRAPH_MS } from '@/sim/data/enemies'
```

Dans la boucle ennemie, après le calcul de `aim` :

```ts
        const telegraphProgress =
          dashState === 1 ? 1 - at(Dasher.timer, eid) / SHARD_TELEGRAPH_MS : 0
        const aimLength = Math.hypot(playerX - enemyX, playerY - enemyY)
```

Et ajouter les trois champs à l'objet passé à `view.update`, après `aim` :

```ts
          dashState,
          telegraphProgress,
          aimLength,
```

- [ ] **Step 7 : Vérifier la suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: tout passe.

- [ ] **Step 8 : Vérifier à l'écran**

Run: `npm run dev`, jouer jusqu'à la vague 3 (première apparition d'un Éclat).
Expected: quand un Éclat se fige, un anneau violet pointillé se contracte vers lui et un trait pointillé pointe le joueur ; l'anneau touche le corps à l'instant même où la charge part ; bouger pendant l'attente fait suivre le trait ; l'anneau et le trait disparaissent dès le départ de la charge.

- [ ] **Step 9 : Commit**

```bash
git add src/render/views/enemy.ts src/render/views/enemy.test.ts src/render/stage.ts
git commit -m "feat(render): un anneau qui converge et un trait qui vise, pour un télégraphe qu'on ne voyait pas"
```

---

### Task 4 : La rémanence de la charge

`fx/afterimage.ts` appelle `drawNib` en dur et plafonne à 16 fantômes : la silhouette et le plafond deviennent des paramètres, ce qui permet une seconde instance pour les Éclats en charge.

**Files:**
- Modify: `src/render/fx/afterimage.ts`
- Modify: `src/render/stage.ts` (site d'appel du joueur, instance Éclat, émission, mise à jour, destruction)
- Test: `src/render/fx/afterimage.test.ts` (créer)

**Interfaces:**
- Consumes: `enemyX`, `enemyY`, `aim`, `dashState` de la tâche 2 ; `INK.shard` de la tâche 1.
- Produces: `createAfterimages(container: Container, opts: { draw(gfx: Graphics): void; limit: number }): Afterimages` — signature modifiée, le second paramètre est obligatoire.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/render/fx/afterimage.test.ts`. Pixi fonctionne bien sous l'environnement `node` de Vitest tant qu'aucun rendu n'est demandé — `Container` et `Graphics` sont de simples objets de graphe de scène :

```ts
import { Container, type Graphics } from 'pixi.js'
import { describe, expect, it } from 'vitest'

import { afterimageAlpha, createAfterimages } from './afterimage'

function disque(gfx: Graphics): void {
  gfx.circle(0, 0, 6).fill({ color: 0xffffff })
}

describe('afterimageAlpha', () => {
  it('part plein et tombe à zéro pile en fin de vie', () => {
    expect(afterimageAlpha(0, 250)).toBe(1)
    expect(afterimageAlpha(250, 250)).toBe(0)
  })

  it('ne redevient jamais négatif', () => {
    expect(afterimageAlpha(1000, 250)).toBe(0)
  })
})

describe('createAfterimages', () => {
  it('respecte le plafond de fantômes qu’on lui donne', () => {
    const container = new Container()
    const fantomes = createAfterimages(container, { draw: disque, limit: 3 })
    for (let i = 0; i < 10; i++) {
      fantomes.emit(i, 0, 0)
    }
    expect(container.children.length).toBe(3)
    fantomes.destroy()
  })

  it('dessine la silhouette qu’on lui passe, pas une autre', () => {
    const container = new Container()
    let appels = 0
    const fantomes = createAfterimages(container, {
      draw: (gfx) => {
        appels++
        disque(gfx)
      },
      limit: 8,
    })
    fantomes.emit(0, 0, 0)
    fantomes.emit(0, 0, 0)
    expect(appels).toBe(2)
    fantomes.destroy()
  })

  it('efface les fantômes arrivés en fin de vie', () => {
    const container = new Container()
    const fantomes = createAfterimages(container, { draw: disque, limit: 8 })
    fantomes.emit(0, 0, 0)
    fantomes.update(300)
    expect(container.children.length).toBe(0)
    fantomes.destroy()
  })

  it('tout nettoyer ne laisse rien derrière', () => {
    const container = new Container()
    const fantomes = createAfterimages(container, { draw: disque, limit: 8 })
    fantomes.emit(0, 0, 0)
    fantomes.emit(1, 0, 0)
    fantomes.destroy()
    expect(container.children.length).toBe(0)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/render/fx/afterimage.test.ts`
Expected: FAIL — `createAfterimages` n'accepte qu'un argument, les fantômes dessinent une pointe de plume et le plafond reste à 16.

- [ ] **Step 3 : Généraliser `createAfterimages`**

Dans `src/render/fx/afterimage.ts`, supprimer les imports devenus inutiles (`INK` et `drawNib`), supprimer la constante `LIMIT`, et remplacer la signature :

```ts
export interface AfterimageOptions {
  /** Dessine la silhouette du fantôme à l'origine, orientée vers +x. */
  draw(gfx: Graphics): void
  /** Borne dure : une charge longue ne doit pas laisser une file sans fin de fantômes. */
  limit: number
}

/**
 * Copies fantômes derrière ce qui va vite : c'est ce qui fait *sentir* la
 * vitesse, là où les zones montrent la portée. La silhouette est un paramètre —
 * un fantôme qui ne ressemble pas à ce qu'il suit ne se lit pas comme sa trace,
 * et une pointe de plume derrière un Éclat ne voudrait rien dire.
 * Purement cosmétique — `src/render/` n'écrit jamais dans la simulation.
 */
export function createAfterimages(container: Container, opts: AfterimageOptions): Afterimages {
  const ghosts: Ghost[] = []

  return {
    emit(x, y, angle): void {
      if (ghosts.length >= opts.limit) {
        const oldest = ghosts.shift()
        oldest?.gfx.destroy()
      }
      const gfx = new Graphics()
      opts.draw(gfx)
      gfx.x = x
      gfx.y = y
      gfx.rotation = angle
      gfx.alpha = 0.45
      container.addChild(gfx)
      ghosts.push({ gfx, age: 0 })
    },
```

Le reste du fichier — `LIFE_MS`, `afterimageAlpha`, `update`, `destroy` — ne bouge pas. La première ligne, `import { type Container, Graphics } from 'pixi.js'`, reste telle quelle : `Graphics` est instancié, `Container` ne sert que de type.

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/render/fx/afterimage.test.ts`
Expected: PASS — 6 tests. `npm run typecheck` échoue encore : le site d'appel du joueur n'est pas à jour, c'est l'étape suivante.

- [ ] **Step 5 : Mettre à jour le site d'appel du joueur**

Dans `src/render/stage.ts`, ajouter l'import de `drawNib` à celui de `views/player` :

```ts
import { createPlayerView, drawNib } from './views/player'
```

Et remplacer la création de l'instance joueur — comportement rigoureusement identique à aujourd'hui :

```ts
  const afterimages = createAfterimages(worldLayer, {
    draw: (gfx) => {
      drawNib(gfx, INK.paper)
    },
    limit: 16,
  })
```

- [ ] **Step 6 : Ajouter l'instance des Éclats**

Toujours dans `src/render/stage.ts`, ajouter l'import du rayon :

```ts
import { ENEMIES, ENEMY_TYPE_BY_ID, SHARD_TELEGRAPH_MS } from '@/sim/data/enemies'
```

Ajouter la constante à côté de `AFTERIMAGE_EMIT_INTERVAL_MS` :

```ts
/** Trois Éclats chargeant ensemble remplissent déjà les 16 fantômes du joueur. */
const SHARD_GHOST_LIMIT = 48
```

Puis, juste après `let afterimageElapsedMs = 0` :

```ts
  const shardGhosts = createAfterimages(worldLayer, {
    draw: (gfx) => {
      gfx.circle(0, 0, ENEMIES.shard.radius).fill({ color: INK.shard })
    },
    limit: SHARD_GHOST_LIMIT,
  })
  let shardGhostElapsedMs = 0
```

- [ ] **Step 7 : Émettre les fantômes des Éclats en charge**

Dans `sync`, juste avant `const liveEnemies = new Set<number>()` — donc avant la boucle, pour que le battement avance une fois par image et non une fois par ennemi :

```ts
      // Battement partagé par tous les Éclats en charge : le décalage de phase
      // entre deux chargeurs n'est pas une information, et un compteur par
      // entité demanderait à la mort un nettoyage que ce battement évite.
      // Gardé par `effectsEnabled` (mouvement réduit) comme les fantômes du joueur.
      let emitShardGhosts = false
      if (effectsEnabled) {
        shardGhostElapsedMs += frameDtMs
        if (shardGhostElapsedMs >= AFTERIMAGE_EMIT_INTERVAL_MS) {
          shardGhostElapsedMs -= AFTERIMAGE_EMIT_INTERVAL_MS
          emitShardGhosts = true
        }
      } else {
        shardGhostElapsedMs = 0
      }
```

Dans la boucle ennemie, après l'appel à `view.update` :

```ts
        if (emitShardGhosts && dashState === 2) {
          shardGhosts.emit(enemyX, enemyY, aim)
        }
```

Enfin, à côté de `afterimages.update(frameDtMs)` :

```ts
      shardGhosts.update(frameDtMs)
```

et à côté de `afterimages.destroy()` :

```ts
      shardGhosts.destroy()
```

- [ ] **Step 8 : Vérifier la suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: tout passe.

- [ ] **Step 9 : Vérifier à l'écran**

Run: `npm run dev`
Expected: pendant la charge d'un Éclat, une traînée de disques violets s'estompe derrière lui ; la ruée du joueur laisse exactement la même traînée qu'avant ce plan.

- [ ] **Step 10 : Commit**

```bash
git add src/render/fx/afterimage.ts src/render/fx/afterimage.test.ts src/render/stage.ts
git commit -m "feat(render): une traînée derrière l'Éclat qui charge, en généralisant celle de la ruée"
```

---

### Task 5 : Vérification manuelle complète

Aucune ligne de code. La spec §7 liste neuf points ; les tâches 3 et 4 en ont couvert quatre à l'écran, celle-ci passe la liste entière, y compris les cas que les tâches précédentes n'atteignent pas.

**Files:** aucun.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien.

- [ ] **Step 1 : Lancer la vérification finale automatisée**

Run: `npm test && npm run lint && npm run build`
Expected: tests verts, Biome propre, build réussi.

- [ ] **Step 2 : Parcourir les neuf points de la spec**

Run: `npm run dev`

1. Un Éclat se repère du premier coup d'œil au milieu de Points, sans comparer les tailles.
2. Quand il se fige, l'anneau se contracte visiblement et le trait pointe le joueur.
3. L'anneau touche le corps à l'instant même où la charge part — pas avant, pas après.
4. Bouger pendant le télégraphe fait suivre le trait, et la charge part dans la dernière direction affichée.
5. Pendant la charge, la traînée de fantômes rend la vitesse sensible.
6. Un Éclat gelé (power-up Gel) est bleu comme les autres, et garde sa facette triangulaire.
7. Un Éclat en cours d'apparition est un contour pointillé ordinaire, sans facette ni télégraphe.
8. Réglages → Mouvement réduit activé : l'anneau et le trait **restent** — ce sont des informations de jeu — les images rémanentes disparaissent, celles du joueur comme celles des Éclats.
9. Plusieurs Éclats chargeant en même temps ne saturent pas l'écran de fantômes.

- [ ] **Step 3 : Consigner ce qui a été vu**

Si un point échoue, ne pas le corriger à la volée : ouvrir le constat, identifier la tâche concernée et y revenir. Si les neuf passent, le dire explicitement dans le rapport de fin — sans quoi rien ne distingue « vérifié » de « pas regardé ».

- [ ] **Step 4 : Commit final si des retouches ont été nécessaires**

```bash
git add -- src/render
git commit -m "fix(render): <ce qui a été corrigé après vérification à l'écran>"
```

Sinon, rien à committer : les quatre tâches précédentes ont chacune commité leur part.

---

## Notes pour l'exécutant

**Le dépôt est partagé avec des sessions parallèles.** Ne jamais faire `git add -A` ni `git add .` : une autre session travaille aujourd'hui sur `views/hazard.ts` et un futur `fx/frost-star.ts` (spec `2026-08-02-gel-instantane-etoile-givre-design.md`). Les chemins listés dans chaque `git add` de ce plan sont exhaustifs — s'en tenir à eux. Le seul fichier commun aux deux chantiers est `stage.ts`, dans des zones différentes : leur câblage de `applyJuice`, notre boucle ennemie de `sync`. Si un conflit survient malgré tout, ne pas arbitrer seul.

**Ne jamais pousser vers `origin`** sans demande explicite.
