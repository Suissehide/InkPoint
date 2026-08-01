# La poursuite du curseur, et « Pas léger » — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la carte « Pas léger » effective, et faire suivre au point un curseur qui bouge, sans dérive ni dépassement.

**Architecture:** Deux tâches indépendantes. La première branche `stats.moveSpeed` sur le composant du joueur, dans `stepWorld` où les statistiques circulent déjà. La seconde remplace la règle de freinage de `aimInput` par une poursuite qui vise une **vitesse** plutôt qu'une direction — une seule formule qui pousse, freine et corrige latéralement.

**Tech Stack:** TypeScript strict, bitECS, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-01-poursuite-et-pas-leger-design.md`

## Global Constraints

- **Langue.** Commentaires, noms de tests et messages de commit en **français**.
- **Commits.** Conventional Commits, imposés par husky + commitlint. Portées : `sim`, `app`.
- **Ne jamais `git add -A`.** Stage explicite des fichiers listés.
- **Ne jamais pousser** vers `origin`.
- **`src/app/` lit la simulation et ne lui écrit jamais.**
- **La sortie d'`aimInput` reste quantifiée au 1/128** — prérequis du netcode v3.
- **`InputState` ne change pas.** La simulation continue d'ignorer qu'une souris est derrière.
- `noUncheckedIndexedAccess` est actif ; pas de `!` hors de `src/sim/`.
- **Attention au filet de pureté :** `src/sim/purity.test.ts` interdit à `src/sim/` d'importer `render`, `ui`, `app` ou `audio`. Son motif est **hypersensible** — il n'est pas ancré sur une paire de guillemets, donc un simple commentaire citant un chemin comme `src/app/mouse.ts` après un import légitime le déclenche. Décris les modules en toutes lettres plutôt que par leur chemin dans les commentaires de `src/sim/`.
- **Vérification après chaque tâche :** `npm test && npm run lint && npm run typecheck`.
- **Base au démarrage :** 456 tests verts.

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
| --- | --- | --- |
| `src/sim/step.ts` | Synchronise la vitesse du joueur depuis ses statistiques | 1 |
| `src/sim/step.test.ts` | Verrouille le lien statistique → composant | 1 |
| `src/sim/spawn.ts` | `PLAYER_ACCEL` extraite et exportée | 2 |
| `src/app/input-source.ts` | `PlayerMotion` gagne `accel` et `maxSpeed` | 2 |
| `src/app/game.ts` | Les lit depuis le composant `Movement` | 2 |
| `src/app/mouse.ts` | La règle de poursuite | 2 |
| `src/app/mouse.test.ts` | Tests unitaires de la règle | 2 |
| `src/app/arrival.test.ts` | Convergence (assertions inchangées) + poursuite mobile | 2 |

---

### Task 1: Brancher « Pas léger »

La carte multiplie `stats.moveSpeed` par 1,12 et **personne ne lit jamais ce champ**. `Movement.maxSpeed` est posé une fois au spawn depuis `PLAYER_SPEED` et n'est plus touché : le joueur ne va pas plus vite. La carte est inerte depuis sa création.

**Files:**
- Modify: `src/sim/step.ts`
- Test: `src/sim/step.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: rien de nouveau à l'extérieur ; `Movement.maxSpeed` du joueur suit désormais `stats.moveSpeed`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajoute à `src/sim/step.test.ts` :

```ts
describe('vitesse du joueur pilotée par ses statistiques', () => {
  it('reporte moveSpeed sur le composant à chaque pas', () => {
    const world = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
    const player = spawnPlayer(world)
    const stats = createRunStats()

    // Ce que fait « Pas léger » : +12 % de vitesse de déplacement.
    stats.moveSpeed *= 1.12
    stepWorld(world, stats)

    expect(Movement.maxSpeed[player]).toBeCloseTo(stats.moveSpeed, 4)
  })

  it('laisse la vitesse de base intacte sans amélioration', () => {
    const world = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
    const player = spawnPlayer(world)
    const stats = createRunStats()

    stepWorld(world, stats)

    expect(Movement.maxSpeed[player]).toBeCloseTo(PLAYER_SPEED, 4)
  })
})
```

Complète les imports du fichier avec `Movement` (`../components`), `PLAYER_SPEED` et `spawnPlayer` (`../spawn`), et `createRunStats` (`../upgrades/stats`) s'ils n'y sont pas déjà — reprends la forme des imports voisins.

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/sim/step.test.ts`
Expected: FAIL sur le premier — `Movement.maxSpeed` vaut 240 alors que `stats.moveSpeed` vaut 268,8. Le second passe déjà : il garde le cas de base contre une régression.

- [ ] **Step 3: Synchroniser dans `stepWorld`**

Dans `src/sim/step.ts`, en tête de `stepWorld`, juste après le vidage des événements :

```ts
  // Les améliorations écrivent dans `stats` ; le composant reste la seule
  // source de vérité, puisque les ennemis s'en servent aussi. Sans cette
  // ligne, « Pas léger » multipliait une valeur que personne ne lisait, et la
  // carte n'avait aucun effet.
  const player = world.playerEid
  if (player >= 0) {
    Movement.maxSpeed[player] = stats.moveSpeed
  }
```

Importe `Movement` depuis `./components` s'il ne l'est pas déjà.

Le garde `player >= 0` est nécessaire : `resetWorld` pose `playerEid` à `-1`, et écrire à l'indice `-1` d'un `Float32Array` est silencieusement ignoré, ce qui masquerait une erreur au lieu de la signaler.

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run src/sim/step.test.ts`
Expected: PASS.

- [ ] **Step 5: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS. Le compte passe de 456 à 458.

- [ ] **Step 6: Commit**

```bash
git add src/sim/step.ts src/sim/step.test.ts
git commit -m "fix(sim): rendre la carte Pas léger effective"
```

---

### Task 2: Viser une vitesse plutôt qu'une direction

La règle actuelle coupe **toute** l'entrée pendant l'approche. Or `playerMovementSystem` n'applique la friction que si l'entrée est nulle, et la friction décélère le long de la **vitesse courante**, jamais vers la cible. Pendant les ~90 ms de glisse, le point n'est donc plus piloté : un curseur qui bouge à ce moment-là laisse une vingtaine de pixels d'écart.

On remplace par une poursuite qui calcule la vitesse souhaitée et demande l'écart. Une seule formule couvre les trois régimes : pousser, freiner, corriger.

**Files:**
- Modify: `src/sim/spawn.ts`
- Modify: `src/app/input-source.ts`
- Modify: `src/app/game.ts`
- Modify: `src/app/mouse.ts`
- Test: `src/app/mouse.test.ts`
- Test: `src/app/arrival.test.ts`

**Interfaces:**
- Consumes: `PlayerMotion` et `aimInput(player: PlayerMotion, target: Point)` tels qu'ils existent.
- Produces:
  ```ts
  export interface PlayerMotion extends Point {
    vx: number
    vy: number
    /** Décélération passive, en px/s² — jamais négative. */
    friction: number
    /** Accélération commandée à pleine entrée, en px/s². */
    accel: number
    /** Vitesse maximale, en px/s. */
    maxSpeed: number
  }
  ```

- [ ] **Step 1: Écrire le test de poursuite mobile, celui qui reproduit le symptôme**

C'est le test qui manquait : tous les existants visent une cible **fixe**, et c'est précisément pourquoi la dérive est passée.

Ajoute à `src/app/arrival.test.ts` :

```ts
/**
 * Rejoue une poursuite où la cible bouge, et rend de quoi juger le suivi.
 * `moveTarget` reçoit le numéro de pas et rend la position du curseur.
 */
function chase(moveTarget: (step: number) => { x: number; y: number }, steps: number) {
  const world = createWorld({ seed: 1, width: ARENA.width, height: ARENA.height })
  const player = spawnPlayer(world)
  const start = moveTarget(0)
  Position.x[player] = start.x
  Position.y[player] = start.y
  Velocity.x[player] = 0
  Velocity.y[player] = 0

  let worstLag = 0
  for (let step = 0; step < steps; step++) {
    const target = moveTarget(step)
    const motion: PlayerMotion = {
      x: Position.x[player] ?? 0,
      y: Position.y[player] ?? 0,
      vx: Velocity.x[player] ?? 0,
      vy: Velocity.y[player] ?? 0,
      friction: Movement.friction[player] ?? 0,
      accel: Movement.accel[player] ?? 0,
      maxSpeed: Movement.maxSpeed[player] ?? 0,
    }
    const { moveX, moveY } = aimInput(motion, target)
    world.input.moveX = moveX
    world.input.moveY = moveY
    playerMovementSystem(world)
    integrationSystem(world)
    worstLag = Math.max(
      worstLag,
      Math.hypot(target.x - (Position.x[player] ?? 0), target.y - (Position.y[player] ?? 0)),
    )
  }

  const last = moveTarget(steps - 1)
  const settled = Math.hypot(
    last.x - (Position.x[player] ?? 0),
    last.y - (Position.y[player] ?? 0),
  )
  return { worstLag, settled }
}

const CX = ARENA.width / 2
const CY = ARENA.height / 2

describe('la poursuite d’un curseur qui bouge', () => {
  it('suit un glissé horizontal sans se laisser distancer', () => {
    // 150 px/s pendant 2 s, puis immobile 1 s.
    const { worstLag, settled } = chase(
      (s) => ({ x: CX + Math.min(s, 120) * 150 * (FIXED_DT / 1000), y: CY }),
      180,
    )
    expect(worstLag).toBeLessThan(40)
    expect(settled).toBeLessThan(3)
  })

  it('encaisse un virage sec sans dériver', () => {
    // Le geste décrit par le joueur : la cible part à droite, puis coupe vers
    // le haut au moment où le point la rejoint.
    const { worstLag, settled } = chase(
      (s) =>
        s < 60
          ? { x: CX + s * 150 * (FIXED_DT / 1000), y: CY }
          : { x: CX + 60 * 150 * (FIXED_DT / 1000), y: CY - (s - 60) * 150 * (FIXED_DT / 1000) },
      240,
    )
    expect(worstLag).toBeLessThan(60)
    expect(settled).toBeLessThan(3)
  })

  it('suit un cercle et s’y pose quand il s’arrête', () => {
    const R = 120
    const { worstLag, settled } = chase(
      (s) => {
        const t = Math.min(s, 180) * 0.02
        return { x: CX + Math.cos(t) * R, y: CY + Math.sin(t) * R }
      },
      300,
    )
    expect(worstLag).toBeLessThan(60)
    expect(settled).toBeLessThan(3)
  })
})
```

Complète les imports du fichier avec `FIXED_DT` (`@/sim/world`).

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/app/arrival.test.ts`
Expected: **FAIL**, en particulier sur le virage sec — c'est le geste que le joueur décrit. Le point continue sur son ancien cap pendant la glisse et se retrouve à côté.

**Consigne la sortie exacte dans ton rapport.** Si les trois passent d'emblée, arrête-toi et signale-le : ce serait que la poursuite mobile ne reproduit pas le symptôme, donc que le montage est faux.

- [ ] **Step 3: Étendre `PlayerMotion`**

Dans `src/app/input-source.ts` :

```ts
export interface PlayerMotion extends Point {
  vx: number
  vy: number
  /** Décélération passive, en px/s² — jamais négative. */
  friction: number
  /** Accélération commandée à pleine entrée, en px/s². */
  accel: number
  /** Vitesse maximale, en px/s. */
  maxSpeed: number
}
```

Dans `src/app/game.ts`, `playerMotion()` lit les deux champs de plus depuis le composant `Movement`, sur le modèle de `friction` :

```ts
      accel: Movement.accel[eid] ?? 0,
      maxSpeed: Movement.maxSpeed[eid] ?? 0,
```

Dans `src/sim/spawn.ts`, extrais aussi l'accélération en constante exportée, à côté de `PLAYER_SPEED` et `PLAYER_FRICTION` qui le sont déjà — les tests de la tâche en ont besoin, et une valeur littérale dupliquée entre le spawn et les tests re-divergerait :

```ts
/** Accélération du joueur, en px/s² : il atteint sa vitesse maximale en 0,12 s. */
export const PLAYER_ACCEL = PLAYER_SPEED / 0.12
```

et remplace `Movement.accel[eid] = PLAYER_SPEED / 0.12` par `Movement.accel[eid] = PLAYER_ACCEL`. C'est une extraction pure, la valeur ne change pas.

**Attention au filet de pureté** : ne cite aucun chemin de la forme `src/app/…` dans ce commentaire — le motif de `purity.test.ts` le prendrait pour un import interdit. Décris le module en toutes lettres si tu veux y renvoyer.

- [ ] **Step 4: Remplacer les tests unitaires qui décrivent la coupure**

Trois tests de `src/app/mouse.test.ts` affirment un mécanisme qui disparaît. Ils sont **remplacés**, pas supprimés :

- « coupe la poussée quand la distance restante suffit tout juste à freiner » ;
- « pousse encore quand la distance restante dépasse la distance d'arrêt » ;
- « décroît proportionnellement à l'intérieur du rayon » — celui-ci teste `FULL_THROTTLE_RADIUS`, qui n'existera plus.

Remplace-les par :

```ts
  it('freine en poussant à contresens quand il arrive trop vite', () => {
    // À 10 px et 240 px/s, la vitesse souhaitée vaut √(2 × accel × 10) ≈ 200,
    // donc inférieure à la vitesse actuelle : l'écart pointe à l'opposé.
    const player = { ...immobile(0, 0), vx: 240 }
    expect(aimInput(player, { x: 10, y: 0 }).moveX).toBeLessThan(0)
  })

  it('pousse à plein quand il part de l’arrêt, quelle que soit la distance', () => {
    // Plus d'atténuation par palier : à l'arrêt, la vitesse souhaitée dépasse
    // toujours largement ce qu'une image d'accélération peut fournir.
    expect(aimInput(immobile(0, 0), { x: 16, y: 0 }).moveX).toBeCloseTo(1, 2)
    expect(aimInput(immobile(0, 0), { x: 500, y: 0 }).moveX).toBeCloseTo(1, 2)
  })

  it('corrige latéralement pendant le freinage', () => {
    // Le cœur du correctif : le point arrive vite vers l'est, la cible est au
    // nord-est. Il doit freiner ET tourner, pas seulement freiner.
    const player = { ...immobile(0, 0), vx: 240 }
    const { moveY } = aimInput(player, { x: 12, y: -12 })
    expect(moveY).toBeLessThan(0)
  })
```

Les autres tests d'`aimInput` restent **inchangés** : zone morte, cible confondue avec le joueur, visée en diagonale, quantification, magnitude unitaire, dérive latérale, éloignement, friction nulle. Chacun garde une propriété qui reste vraie.

Étends le helper `immobile` pour qu'il fournisse aussi `accel: PLAYER_ACCEL` et `maxSpeed: PLAYER_SPEED`, tous deux importés de `@/sim/spawn` — `PLAYER_ACCEL` vient d'y être extraite au Step 3, `PLAYER_SPEED` y était déjà.

- [ ] **Step 5: Ajouter le test du battement**

La nouvelle règle a un piège : au régime de croisière, la vitesse souhaitée égale la vitesse actuelle, donc l'écart tombe à zéro, donc l'entrée aussi — ce qui **réactive la friction** (`playerMovementSystem` ne l'applique que si l'entrée est nulle), qui ralentit le point, ce qui recrée un écart. Un battement à chaque image, et une sensation d'accroche.

```ts
  it('ne bat pas entre poussée et relâchement en croisière', () => {
    // Cible lointaine, point déjà à sa vitesse de croisière vers elle : la
    // commande ne doit pas s'annuler, sinon la friction reprend la main et le
    // point pulse à chaque image.
    const player = { ...immobile(0, 0), vx: PLAYER_SPEED }
    expect(Math.abs(aimInput(player, { x: 800, y: 0 }).moveX)).toBeGreaterThan(0.001)
  })
```

Le seuil `0.001` n'est pas arbitraire : c'est exactement celui sous lequel `playerMovementSystem` bascule sur la friction.

- [ ] **Step 6: Écrire la règle**

Dans `src/app/mouse.ts`, remplacer `aimInput` et **supprimer `FULL_THROTTLE_RADIUS`**. En revanche `STEP_DT` **reste** : la nouvelle règle s'en sert pour calculer ce qu'une image d'accélération peut fournir. Mets à jour son commentaire, qui renvoie à l'ancienne marge.

```ts
/**
 * Intensité plancher dès qu'une correction est demandée. `playerMovementSystem`
 * n'applique la friction que si l'entrée est nulle : laisser l'intensité tomber
 * à zéro en croisière rendrait la main à la friction, qui ralentirait le point,
 * ce qui recréerait un écart — un battement à chaque image. Une intensité
 * minuscule suffit à garder la commande, sans accélérer notablement.
 */
const MIN_INTENSITY = 0.01

/**
 * Poursuite : on vise une **vitesse**, pas une direction. La sortie a la forme
 * d'une entrée de manette — la simulation ne saura jamais qu'une souris est
 * derrière.
 *
 * `√(2 · accel · distance)` est la vitesse maximale depuis laquelle on peut
 * encore s'arrêter pile sur la cible. Trois régimes en découlent sans aucun
 * seuil : loin, elle dépasse `maxSpeed` et l'entrée pousse à plein ; près et
 * lancé, elle plafonne sous la vitesse actuelle et l'écart pointe à l'opposé,
 * donc freine ; et si la cible bouge, l'écart porte la correction latérale
 * **pendant** le freinage. C'est ce dernier point qui corrige la dérive de la
 * règle précédente, qui coupait toute commande pendant l'arrêt.
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

  // Accélération nulle ⇒ aucune commande possible : rendre une entrée pleine
  // vers la cible est le comportement le moins surprenant.
  if (player.accel <= 0) {
    return { moveX: quantize(ux), moveY: quantize(uy) }
  }

  const braking = Math.sqrt(2 * player.accel * distance)
  const desired = Math.min(player.maxSpeed, braking)
  const gapX = ux * desired - player.vx
  const gapY = uy * desired - player.vy
  const gap = Math.hypot(gapX, gapY)
  if (gap === 0) {
    return { moveX: 0, moveY: 0 }
  }

  // Ce qu'une image d'accélération pleine peut fournir : au-delà, demander
  // plus ne servirait à rien ; en deçà, demander tout dépasserait la vitesse
  // souhaitée en un pas.
  const reach = player.accel * STEP_DT
  const intensity = Math.max(MIN_INTENSITY, Math.min(1, gap / reach))
  return {
    moveX: quantize((gapX / gap) * intensity),
    moveY: quantize((gapY / gap) * intensity),
  }
}
```

Mets à jour le commentaire de `DEAD_ZONE` s'il évoque l'ancienne règle, et supprime celui de `FULL_THROTTLE_RADIUS` avec la constante.

- [ ] **Step 7: Adapter la construction de `PlayerMotion` dans le test de convergence**

`src/app/arrival.test.ts` construit un `PlayerMotion` dans `runToTarget` : ajoute-lui `accel` et `maxSpeed`, lus depuis `Movement` comme `friction` l'est déjà. **Ses assertions ne changent pas** — atteindre la cible, ne jamais la dépasser, s'immobiliser restent exigés à l'identique.

- [ ] **Step 8: Lancer les deux fichiers de test**

Run: `npx vitest run src/app/mouse.test.ts src/app/arrival.test.ts`
Expected: PASS, y compris les trois tests de poursuite mobile du Step 1 et les douze assertions de convergence.

Si la convergence échoue alors que la poursuite passe, **ne relâche pas ses seuils** : c'est la règle qu'il faut reprendre. La distance d'arrêt est passée de 10,8 à 14,4 px, ce qui est attendu, mais le point ne doit toujours jamais dépasser.

- [ ] **Step 9: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Vérifier à l'œil**

Run: `npm run dev`, jouer à la souris.
Expected : le point suit le curseur sans traîner, se pose dessus sans le dépasser, et **ne dérive plus quand tu fais tourner le curseur au dernier moment**. Guette aussi un éventuel bégaiement en croisière — c'est ce que le test du Step 5 protège, mais lui seul ne dit rien du ressenti.

L'onglet piloté par les outils navigateur de ce dépôt est **throttlé** : si tu ne peux pas observer, dis-le franchement plutôt que de le prétendre.

- [ ] **Step 11: Commit**

```bash
git add src/sim/spawn.ts src/app/input-source.ts src/app/game.ts src/app/mouse.ts src/app/mouse.test.ts src/app/arrival.test.ts
git commit -m "fix(app): suivre le curseur en visant une vitesse plutôt qu'une direction"
```

---

## Couverture de la spec

| Section de la spec | Tâche |
| --- | --- |
| §2.1 Le constat de la carte inerte | 1 (commentaire du Step 3) |
| §2.2 Synchronisation dans `stepWorld`, composant seule source de vérité | 1 (Step 3) |
| §2.3 Test verrouillant le lien | 1 (Step 1) |
| §3.1 Pourquoi la règle précédente ne peut être rapiécée | 2 (commentaire de `aimInput`) |
| §3.2 La règle : vitesse souhaitée, écart, plafond d'intensité | 2 (Step 6) |
| §3.3 `FULL_THROTTLE_RADIUS` et le seuil de coupure disparaissent | 2 (Step 6) |
| §3.4 `DEAD_ZONE`, quantification, `InputState` intact | 2 (Step 6) |
| §3.5 Distance d'arrêt à 14,4 px, friction cantonnée à la zone morte | 2 (Step 8) |
| §4 Convergence : assertions inchangées, construction adaptée | 2 (Step 7) |
| §4 Poursuite d'une cible mobile, échouant d'abord | 2 (Steps 1-2) |
| §4 Tests unitaires remplacés, jamais supprimés sans contrepartie | 2 (Step 4) |
| §5 Mode clavier et modèle de friction hors périmètre | — (aucune tâche ne les touche) |
