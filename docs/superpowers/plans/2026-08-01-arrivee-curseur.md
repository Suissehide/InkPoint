# L'arrivée du curseur — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le point se pose sur le curseur au lieu de le dépasser puis d'osciller autour.

**Architecture:** Deux tâches. La première enrichit le contrat d'entrée pour que les sources qui visent une cible connaissent la vélocité et la friction du joueur — **sans aucun changement de comportement**. La seconde ajoute la règle de freinage à `aimInput` et la prouve par un test de convergence sur la vraie boucle de mouvement. La simulation ne change pas de comportement : elle cède seulement une constante déjà présente.

**Tech Stack:** TypeScript strict, bitECS, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-01-arrivee-curseur-design.md`

## Global Constraints

- **Langue.** Commentaires, noms de tests et messages de commit en **français**.
- **Commits.** Conventional Commits, imposés par husky + commitlint. Portées : `app`, `sim`.
- **Ne jamais `git add -A`.** Stage explicite des fichiers listés.
- **Ne jamais pousser** vers `origin`.
- **Le comportement de `src/sim/` ne change pas.** La simulation continue de recevoir un vecteur de direction et de l'intégrer ; elle n'apprend pas la notion d'« arrivé ». La seule modification qu'elle subit est l'extraction d'une constante déjà présente en valeur littérale (`PLAYER_FRICTION`, tâche 1), pour que la source souris puisse la lire.
- **`src/app/` lit la simulation et ne lui écrit jamais.**
- **La sortie d'`aimInput` reste quantifiée au 1/128** — prérequis du netcode v3.
- `noUncheckedIndexedAccess` est actif.
- **Vérification après chaque tâche :** `npm test && npm run lint && npm run typecheck`.
- **Base au démarrage :** 438 tests verts.

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
| --- | --- | --- |
| `src/sim/spawn.ts` | `PLAYER_FRICTION` extraite et exportée | 1 |
| `src/app/input-source.ts` | Le contrat d'entrée : `PlayerMotion` remplace `Point` | 1 |
| `src/app/game.ts` | Lit vélocité et friction en plus de la position | 1 |
| `src/app/mouse.ts` | La règle de freinage dans `aimInput` | 1, 2 |
| `src/app/mouse.test.ts` | Tests unitaires d'`aimInput` | 1, 2 |
| `src/app/arrival.test.ts` | **Créé.** Test de convergence sur la vraie boucle | 2 |

---

### Task 1: Donner la vélocité et la friction aux sources d'entrée

Le freinage a besoin de la vitesse du point et de sa décélération passive. Aujourd'hui `InputSource.writeInto(input, player)` ne reçoit qu'un `Point`.

**Cette tâche ne change aucun comportement.** C'est une extension de contrat : `aimInput` reçoit deux champs de plus et les ignore encore. Les six tests existants doivent continuer d'affirmer exactement la même chose, avec une vélocité nulle.

**Files:**
- Modify: `src/sim/spawn.ts`
- Modify: `src/app/input-source.ts`
- Modify: `src/app/mouse.ts`
- Modify: `src/app/game.ts`
- Test: `src/app/mouse.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  ```ts
  // spawn.ts
  export const PLAYER_FRICTION: number

  // input-source.ts
  export interface PlayerMotion extends Point {
    vx: number
    vy: number
    /** Décélération passive, en px/s². */
    friction: number
  }
  export interface InputSource {
    writeInto(input: InputState, player: PlayerMotion): void
    destroy(): void
  }

  // mouse.ts
  export function aimInput(player: PlayerMotion, target: Point): { moveX: number; moveY: number }
  ```

- [ ] **Step 0: Extraire la friction du joueur en constante**

Dans `src/sim/spawn.ts`, juste sous `PLAYER_SPEED` :

```ts
/**
 * Décélération passive du joueur, en px/s² : il s'arrête en 0,09 s depuis sa
 * vitesse maximale. Exportée parce que la source souris en a besoin pour
 * savoir quand couper la poussée — voir `aimInput` (`src/app/mouse.ts`).
 */
export const PLAYER_FRICTION = PLAYER_SPEED / 0.09
```

et remplacer `Movement.friction[eid] = PLAYER_SPEED / 0.09` par `Movement.friction[eid] = PLAYER_FRICTION`. Ne touche pas à la friction des ennemis, qui vaut 0.

C'est une extraction pure : la valeur ne change pas.

- [ ] **Step 1: Étendre le contrat**

Dans `src/app/input-source.ts`, ajouter après `Point` :

```ts
/**
 * L'état de mouvement du joueur, tel qu'une source d'entrée peut en avoir
 * besoin. Le clavier l'ignore ; les sources qui visent une cible s'en servent
 * pour freiner à l'approche plutôt que de la dépasser.
 */
export interface PlayerMotion extends Point {
  vx: number
  vy: number
  /** Décélération passive, en px/s² — jamais négative. */
  friction: number
}
```

puis remplacer le type du second paramètre de `writeInto` :

```ts
export interface InputSource {
  writeInto(input: InputState, player: PlayerMotion): void
  destroy(): void
}
```

Le commentaire au-dessus de `InputSource` dit « `player` sert aux sources qui visent une cible ; le clavier l'ignore en ne le déclarant pas ». Il reste vrai — `PlayerMotion` étend `Point`, donc le clavier continue de ne rien déclarer.

- [ ] **Step 2: Adapter la signature d'`aimInput`**

Dans `src/app/mouse.ts`, `aimInput` prend un `PlayerMotion` au lieu d'un `Point`. **Le corps ne change pas encore** : les nouveaux champs sont là et inutilisés.

```ts
export function aimInput(player: PlayerMotion, target: Point): { moveX: number; moveY: number } {
```

Importer `PlayerMotion` depuis `./input-source`, aux côtés de `InputSource` et `Point`.

- [ ] **Step 3: Lire la vélocité et la friction dans `game.ts`**

`game.ts` a une fonction `playerPoint(): Point` qui lit `Position`. Elle devient `playerMotion(): PlayerMotion` :

```ts
  /**
   * `?? 0` satisfait `noUncheckedIndexedAccess` sans assertion non-nulle
   * (interdite hors de `src/sim/`) ; jamais atteint en pratique.
   */
  function playerMotion(): PlayerMotion {
    const eid = run.world.playerEid
    return {
      x: Position.x[eid] ?? 0,
      y: Position.y[eid] ?? 0,
      vx: Velocity.x[eid] ?? 0,
      vy: Velocity.y[eid] ?? 0,
      friction: Movement.friction[eid] ?? 0,
    }
  }
```

Compléter l'import de `@/sim/components` avec `Velocity` et `Movement`, et celui de `./input-source` avec `PlayerMotion`. Mettre à jour les appels de `playerPoint()`.

`npm run typecheck` signale tout site oublié.

- [ ] **Step 4: Adapter les six tests existants**

`src/app/mouse.test.ts` contient six tests appelant `aimInput({ x, y }, { x, y })`. Ils doivent **continuer d'affirmer la même chose** : passe-leur une vélocité nulle et la friction du joueur. Une vélocité nulle donne une vitesse d'approche nulle, donc une distance d'arrêt nulle — le comportement reste par construction celui d'avant.

Ajoute en tête du `describe('aimInput', …)` un helper, pour ne pas répéter les champs :

```ts
/**
 * Joueur immobile : vitesse d'approche nulle, donc distance d'arrêt nulle.
 * Les cas historiques d'`aimInput` restent ainsi inchangés — c'est le
 * freinage qui est nouveau, pas la visée.
 */
function immobile(x: number, y: number): PlayerMotion {
  return { x, y, vx: 0, vy: 0, friction: PLAYER_FRICTION }
}
```

et remplace chaque `aimInput({ x: 0, y: 0 }, …)` par `aimInput(immobile(0, 0), …)`, en gardant **les mêmes assertions**. N'en supprime ni n'en désactive aucun : chacun garde une propriété qui reste vraie.

`PLAYER_FRICTION` est importée depuis `@/sim/spawn`, où le Step 0 vient de l'extraire.

- [ ] **Step 5: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS, **438 tests, le même nombre qu'au départ**. Aucun test n'est ajouté ni retiré par cette tâche : elle ne change aucun comportement, et c'est la preuve qu'elle n'en change pas.

- [ ] **Step 6: Commit**

```bash
git add src/app/input-source.ts src/app/mouse.ts src/app/game.ts src/app/mouse.test.ts
git commit -m "refactor(app): donner la vélocité et la friction aux sources d'entrée"
```

---

### Task 2: Freiner à l'approche au lieu de dépasser

`aimInput` pousse vers la cible jusqu'à `DEAD_ZONE` (3 px), alors qu'il faut **10,8 px** pour s'arrêter à pleine vitesse (`v² / (2·friction)`, friction = `240 / 0,09`). Le point dépasse donc d'environ 8 px, puis la commande se rallume en sens inverse : l'oscillation.

La règle : couper la poussée dès que la distance restante passe sous la distance d'arrêt. La friction fait exactement le travail.

**Files:**
- Modify: `src/app/mouse.ts`
- Test: `src/app/mouse.test.ts`
- Create: `src/app/arrival.test.ts`

**Interfaces:**
- Consumes: `PlayerMotion`, la signature d'`aimInput` et `PLAYER_FRICTION` (tâche 1).
- Produces: rien de nouveau à l'extérieur.

- [ ] **Step 1: Écrire le test de convergence, celui qui prouve tout**

Crée `src/app/arrival.test.ts`. Il fait tourner la **vraie** boucle — `playerMovementSystem` puis `integrationSystem` — avec `aimInput` rappelée à chaque pas, exactement comme le jeu.

```ts
import { describe, expect, it } from 'vitest'

import { Movement, Position, Velocity } from '@/sim/components'
import { spawnPlayer } from '@/sim/spawn'
import { integrationSystem } from '@/sim/systems/integration'
import { playerMovementSystem } from '@/sim/systems/player-movement'
import { ARENA, createWorld } from '@/sim/world'
import { aimInput } from './mouse'
import type { PlayerMotion } from './input-source'

/** Tolérance de dépassement, en pixels. Voir le commentaire de `runToTarget`. */
const OVERSHOOT_TOLERANCE = 1

/**
 * Rejoue une approche complète et rend de quoi juger les trois propriétés :
 * le point arrive, ne dépasse pas, s'immobilise.
 *
 * Le dépassement se mesure sur l'axe d'approche (+x) : `target.x - position.x`
 * part positif et ne doit jamais devenir négatif. C'est la définition même du
 * dépassement, et le cœur du défaut corrigé.
 *
 * La tolérance d'un pixel absorbe la quantification de l'entrée au 1/128 et le
 * pas fixe de 16,67 ms — le point ne peut pas s'arrêter entre deux images.
 */
function runToTarget(startDistance: number, startSpeed: number) {
  const world = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  const player = spawnPlayer(world)
  const target = { x: ARENA.width / 2, y: ARENA.height / 2 }

  Position.x[player] = target.x - startDistance
  Position.y[player] = target.y
  Velocity.x[player] = startSpeed
  Velocity.y[player] = 0

  let worstSigned = Number.POSITIVE_INFINITY

  for (let step = 0; step < 600; step++) {
    const motion: PlayerMotion = {
      x: Position.x[player] ?? 0,
      y: Position.y[player] ?? 0,
      vx: Velocity.x[player] ?? 0,
      vy: Velocity.y[player] ?? 0,
      friction: Movement.friction[player] ?? 0,
    }
    const { moveX, moveY } = aimInput(motion, target)
    world.input.moveX = moveX
    world.input.moveY = moveY
    playerMovementSystem(world)
    integrationSystem(world)
    worstSigned = Math.min(worstSigned, target.x - (Position.x[player] ?? 0))
  }

  const finalDistance = Math.hypot(
    target.x - (Position.x[player] ?? 0),
    target.y - (Position.y[player] ?? 0),
  )
  const finalSpeed = Math.hypot(Velocity.x[player] ?? 0, Velocity.y[player] ?? 0)
  return { worstSigned, finalDistance, finalSpeed }
}

// Distance de départ, vitesse de départ. Le cas (15, 240) est le plus dur :
// 15 px à pleine vitesse, quand il en faut 10,8 pour s'arrêter.
const APPROACHES: [number, number][] = [
  [400, 240],
  [200, 240],
  [50, 240],
  [15, 240],
  [300, 0],
  [11, 100],
]

describe("l'arrivée sur le curseur", () => {
  for (const [distance, speed] of APPROACHES) {
    it(`ne dépasse jamais la cible depuis ${distance} px à ${speed} px/s`, () => {
      const { worstSigned } = runToTarget(distance, speed)
      expect(worstSigned).toBeGreaterThan(-OVERSHOOT_TOLERANCE)
    })

    it(`se pose sur la cible depuis ${distance} px à ${speed} px/s`, () => {
      const { finalDistance, finalSpeed } = runToTarget(distance, speed)
      expect(finalDistance).toBeLessThan(5)
      expect(finalSpeed).toBeLessThan(5)
    })
  }
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/app/arrival.test.ts`
Expected: **FAIL** sur les assertions de dépassement — le point traverse la cible, `worstSigned` devient nettement négatif.

**Consigne la sortie exacte dans ton rapport.** Un test de convergence qui passerait avant le correctif ne prouverait rien ; c'est son échec initial qui lui donne sa valeur. Si toutes les assertions passent d'emblée, ne poursuis pas : signale-le, quelque chose ne va pas dans le montage du test.

- [ ] **Step 3: Écrire les tests unitaires de la règle**

Ajoute dans `src/app/mouse.test.ts`, à la suite des tests existants d'`aimInput` :

```ts
  it('coupe la poussée quand la distance restante suffit tout juste à freiner', () => {
    // 240 px/s de vitesse d'approche : la friction a besoin de
    // 240² / (2 × PLAYER_FRICTION) ≈ 10,8 px. À 10 px, il est trop tard pour
    // pousser encore.
    const player = { x: 0, y: 0, vx: 240, vy: 0, friction: PLAYER_FRICTION }
    expect(aimInput(player, { x: 10, y: 0 })).toEqual({ moveX: 0, moveY: 0 })
  })

  it('pousse encore quand la distance restante dépasse la distance d’arrêt', () => {
    const player = { x: 0, y: 0, vx: 240, vy: 0, friction: PLAYER_FRICTION }
    expect(aimInput(player, { x: 40, y: 0 }).moveX).toBeGreaterThan(0)
  })

  it('maintient la poussée quand le point dérive de côté', () => {
    // Vitesse élevée mais perpendiculaire à la cible : la vitesse d'approche
    // est nulle, donc rien à freiner — il faut au contraire redresser.
    const player = { x: 0, y: 0, vx: 0, vy: 240, friction: PLAYER_FRICTION }
    expect(aimInput(player, { x: 10, y: 0 }).moveX).toBeGreaterThan(0)
  })

  it("maintient la poussée à plein quand le point s'éloigne", () => {
    // Vitesse d'approche négative : le plancher à zéro l'empêche de compter
    // comme une raison de couper.
    const player = { x: 0, y: 0, vx: -240, vy: 0, friction: PLAYER_FRICTION }
    expect(aimInput(player, { x: 10, y: 0 }).moveX).toBeGreaterThan(0)
  })

  it('ne coupe jamais la poussée si la friction est nulle', () => {
    // Sans friction, aucun arrêt passif : couper la poussée immobiliserait le
    // point pour toujours.
    const player = { x: 0, y: 0, vx: 240, vy: 0, friction: 0 }
    expect(aimInput(player, { x: 10, y: 0 }).moveX).toBeGreaterThan(0)
  })

  it('ne renvoie jamais une entrée dirigée à l’opposé de la cible', () => {
    // Aucun recul : la règle coupe la poussée, elle ne l'inverse pas.
    for (const vx of [-300, -100, 0, 100, 300]) {
      const player = { x: 0, y: 0, vx, vy: 0, friction: PLAYER_FRICTION }
      expect(aimInput(player, { x: 20, y: 0 }).moveX).toBeGreaterThanOrEqual(0)
    }
  })
```

- [ ] **Step 4: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/app/mouse.test.ts`
Expected: FAIL sur « coupe la poussée quand la distance restante suffit tout juste à freiner » — le code actuel pousse encore. Les cinq autres passent déjà : ils gardent des propriétés que le correctif ne doit pas casser.

- [ ] **Step 5: Écrire la règle**

Dans `src/app/mouse.ts`, remplacer le corps d'`aimInput` :

```ts
/**
 * Poursuite : direction joueur→cible, intensité proportionnelle à la distance.
 * La sortie a la forme d'une entrée de manette — la simulation ne saura jamais
 * qu'une souris est derrière.
 *
 * La poussée est coupée dès que la distance restante passe sous la distance
 * d'arrêt : la friction pose alors le point exactement sur la cible. Sans
 * cela, le point arrivait à pleine vitesse là où il lui fallait 10,8 px pour
 * s'arrêter, dépassait d'environ 8 px, et oscillait autour du curseur.
 */
export function aimInput(player: PlayerMotion, target: Point): { moveX: number; moveY: number } {
  const dx = target.x - player.x
  const dy = target.y - player.y
  const distance = Math.hypot(dx, dy)
  if (distance <= DEAD_ZONE) {
    return { moveX: 0, moveY: 0 }
  }
  const ux = dx / distance
  const uy = dy / distance

  // Projection de la vélocité sur la direction de la cible, et non sa norme :
  // un point qui dérive de côté, ou qui s'éloigne, a une vitesse élevée mais
  // rien à freiner — lui couper la poussée le laisserait filer au lieu de le
  // redresser. Le plancher à zéro traite l'éloignement.
  const approach = Math.max(0, player.vx * ux + player.vy * uy)
  // Friction nulle ⇒ aucun arrêt passif : couper la poussée immobiliserait le
  // point pour toujours. C'est le cas des ennemis, jamais celui du joueur,
  // mais la division doit être gardée.
  const stopping = player.friction > 0 ? (approach * approach) / (2 * player.friction) : 0
  if (distance <= stopping) {
    return { moveX: 0, moveY: 0 }
  }

  const intensity = Math.min(1, distance / FULL_THROTTLE_RADIUS)
  return {
    moveX: quantize(ux * intensity),
    moveY: quantize(uy * intensity),
  }
}
```

Mettre à jour le commentaire de `FULL_THROTTLE_RADIUS`, qui annonce encore « le point dépasse donc le curseur d'environ 8 px avant de revenir s'y poser » : c'est précisément ce qui disparaît, et le laisser en ferait la huitième affirmation périmée de ce dépôt.

- [ ] **Step 6: Lancer les deux fichiers de test**

Run: `npx vitest run src/app/mouse.test.ts src/app/arrival.test.ts`
Expected: PASS. Les douze assertions de convergence passent, dont le cas dur (15 px à 240 px/s).

- [ ] **Step 7: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Vérifier à l'œil**

Run: `npm run dev`, jouer à la souris.
Expected : le point se pose sur le curseur et s'y arrête net, sans le dépasser ni osciller. Bouger le curseur par petits gestes près du point, puis par grands balayages : dans les deux cas l'arrivée doit être franche.

Sache que l'onglet piloté par les outils navigateur de ce dépôt est **throttlé** — l'horloge de simulation y reste quasi figée. Si tu ne peux pas observer, dis-le franchement dans ton rapport : le test de convergence couvre déjà la propriété, cette vérification ne fait que confirmer le ressenti.

- [ ] **Step 9: Commit**

```bash
git add src/sim/spawn.ts src/app/mouse.ts src/app/mouse.test.ts src/app/arrival.test.ts
git commit -m "fix(app): poser le point sur le curseur au lieu de le faire osciller"
```

---

## Couverture de la spec

| Section de la spec | Tâche |
| --- | --- |
| §1 Le diagnostic et ses chiffres | 1 (Step 0), 2 (commentaire de `aimInput`) |
| §2 La règle de coupure | 2 (Step 5) |
| §2.1 Projection plutôt que norme | 2 (Step 3 « dérive de côté », Step 5) |
| §2.2 Aucun recul | 2 (Step 4 « jamais à l'opposé ») |
| §2.3 Garde de la friction nulle | 2 (Step 3 « friction nulle », Step 5) |
| §3 `aimInput` reste pure, `InputState` intact, `src/sim/` non modifié | 1 |
| §4 `FULL_THROTTLE_RADIUS`, `DEAD_ZONE` et la quantification conservés | 2 (Step 5) |
| §5 Les six tests existants adaptés, jamais supprimés | 1 (Step 4) |
| §5 Tests unitaires de la règle | 2 (Step 3) |
| §5 Test de convergence, échouant d'abord | 2 (Steps 1-2) |
| §6 Mode clavier et réticule hors périmètre | — (aucune tâche ne les touche) |
