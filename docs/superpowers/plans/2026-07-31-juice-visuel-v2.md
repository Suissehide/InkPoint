# Juice visuel v2 — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner une page à l'arène, une mise en scène à la mort, et une signature propre à chacun des cinq power-ups.

**Architecture:** Tout se passe dans `src/render/` et `src/app/`. La simulation n'est pas touchée : pendant l'état `dying` elle est déjà entièrement gelée (`game.ts:onStep` n'appelle `stepWorld` que dans l'état `playing`), donc la séquence de mort est une animation de rendu sur un monde immobile. Comme partout dans ce dépôt, la logique de timing et de courbe est extraite en fonctions pures exportées, seules testées — Pixi n'est jamais instancié en test.

**Tech Stack:** TypeScript strict, PixiJS v8, bitECS, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-07-31-juice-visuel-v2-design.md`

## Global Constraints

- **Langue.** Commentaires, messages de commit et noms de tests en **français**, comme tout le dépôt.
- **Commits.** Conventional Commits, imposés par husky + commitlint. Portées utilisées ici : `render`, `juice`, `app`.
- **Ne jamais `git add -A`.** Une autre session travaille dans le même worktree (`src/sim/systems/bramble.ts` et consorts). Chaque commit liste ses fichiers explicitement.
- **Ne jamais pousser** vers `origin` sans accord explicite.
- **`src/render/` n'a pas droit à `!`** (assertion non-nulle) — réservé à `src/sim/`. Utiliser le helper `at()` de `stage.ts` ou lever.
- **`src/render/` ne doit rien écrire dans le monde.** Lecture seule sur `SimWorld`.
- **`noUncheckedIndexedAccess` est actif** : tout accès indexé est `T | undefined`.
- **Vérification après chaque tâche :** `npm test && npm run lint && npm run typecheck`.
- **Palette :** uniquement `INK` (`src/render/ink.ts`). Aucune couleur en dur.

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
| --- | --- | --- |
| `src/app/juice.ts` | Traduit les événements de simulation en effets ; routage des signatures | 1, 6 |
| `src/render/particles.ts` | Éclats : naissance sur un cercle, convergence, immobilisation | 2 |
| `src/render/fx/shockwave.ts` | Anneaux : contraction, aiguilles, retard | 3 |
| `src/render/page.ts` | **Créé.** La page réglée et sa révélation par le halo | 4 |
| `src/render/views/player.ts` | Installation et respiration du halo, motes | 5 |
| `src/render/fx/death-sequence.ts` | **Créé.** Phases, ordre et effets de la séquence de mort | 7 |
| `src/render/views/enemy.ts` | Blanchiment pendant le temps d'arrêt | 8 |
| `src/render/ink.ts` | `mixColor` — mélange de deux couleurs de la palette | 8 |
| `src/render/stage.ts` | Câblage : calque page, état de mort, masquage des ennemis | 4, 8 |
| `src/app/game.ts` | Cycle de vie du juice, état `dying`, saut au clavier | 1, 8 |

---

### Task 1: Colmater la fuite du ralenti de mort

Le champ `deathSlowmoRemaining` est posé à 800 sur la mort et n'est **jamais** décompté : `timeScaleFor` n'est appelé que dans l'état `playing`, et la simulation est gelée dès que `playerDied` fait basculer vers `dying`. Comme `juice` est un `const` créé une fois (`game.ts:71`) que `startRun()` ne réinitialise pas, chaque run après la première démarre à 0,15× pendant 800 ms.

Le ralenti est donc du code mort : on le supprime plutôt que de le réparer, et on ajoute la réinitialisation qui manquait — `hitstopRemaining` et `hitstopCooldownRemaining` fuient de la même façon, en plus discret.

**Files:**
- Modify: `src/app/juice.ts`
- Modify: `src/app/game.ts`
- Test: `src/app/juice.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `resetJuiceState(state: JuiceState): void` ; `DYING_STATE_MS: number` (durée de l'état `dying`, remplacée en tâche 8 par la durée réelle de la séquence). `JuiceState` perd le champ `deathSlowmoRemaining`. `DEATH_SLOWMO_MS` et `DEATH_SLOWMO_SCALE` disparaissent.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `src/app/juice.test.ts` :

```ts
describe('resetJuiceState', () => {
  it('remet à zéro un hitstop en cours', () => {
    const state = createJuiceState()
    state.hitstopRemaining = 42
    state.hitstopCooldownRemaining = 130
    resetJuiceState(state)
    expect(state.hitstopRemaining).toBe(0)
    expect(state.hitstopCooldownRemaining).toBe(0)
  })

  it('rend au pas suivant sa vitesse pleine', () => {
    // Le scénario de la fuite : une run se termine pendant un hitstop, la
    // suivante démarre avec le même objet d'état.
    const state = createJuiceState()
    state.hitstopRemaining = 60
    resetJuiceState(state)
    expect(timeScaleFor(state, 16.67)).toBe(1)
  })
})
```

Compléter l'import en tête de fichier avec `resetJuiceState`.

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/app/juice.test.ts`
Expected: FAIL — `resetJuiceState is not a function` (et une erreur de typage sur l'import).

- [ ] **Step 3: Écrire l'implémentation**

Dans `src/app/juice.ts` :

1. Supprimer les constantes `DEATH_SLOWMO_MS` et `DEATH_SLOWMO_SCALE`, et ajouter à leur place :

```ts
/**
 * Durée de l'état `dying`, en temps réel. Rien ne s'y joue encore : la
 * séquence de mort (`render/fx/death-sequence.ts`) la remplacera par sa propre
 * durée, qui est la somme de ses phases.
 */
export const DYING_STATE_MS = 800
```

2. Retirer `deathSlowmoRemaining` de `JuiceState` et de `createJuiceState` :

```ts
export interface JuiceState {
  hitstopRemaining: number
  /** Temps restant avant qu'un nouveau hitstop soit à nouveau autorisé à se déclencher. */
  hitstopCooldownRemaining: number
}

export function createJuiceState(): JuiceState {
  return { hitstopRemaining: 0, hitstopCooldownRemaining: 0 }
}

/**
 * Remet l'état à neuf entre deux runs. Sans cet appel, un hitstop encore en
 * cours au moment de la mort reste armé et gèle les premiers pas de la run
 * suivante — l'objet d'état est créé une seule fois pour toute la session.
 */
export function resetJuiceState(state: JuiceState): void {
  state.hitstopRemaining = 0
  state.hitstopCooldownRemaining = 0
}
```

3. Dans `applyJuice`, cas `'playerDied'` : supprimer la ligne `state.deathSlowmoRemaining = DEATH_SLOWMO_MS` et le commentaire qui la justifiait (il parle d'un ralenti qui n'existe plus). Le cas se réduit à son contenu visuel :

```ts
      case 'playerDied':
        if (fx.motionEnabled) {
          fx.camera.shake(shakeForFelt(24))
          fx.particles.emitBurst(event.x, event.y, { color: INK.paper, count: 40 })
          fx.flash.flash(INK.paper, 0.22, 260)
          fx.shockwaves.emit(event.x, event.y, {
            color: INK.paper,
            radius: 320,
            durationMs: 500,
            thickness: 6,
          })
        }
        break
```

4. Dans `timeScaleFor`, supprimer le bloc `deathSlowmoRemaining` :

```ts
export function timeScaleFor(state: JuiceState, dtMs: number): number {
  // Décompte indépendamment de l'état du hitstop lui-même : la cadence se
  // mesure en temps réel écoulé depuis le dernier déclenchement, pas en temps
  // de simulation gelé (sinon elle ne s'écoulerait jamais tant qu'un hitstop
  // tourne, et la fenêtre de suppression n'aurait aucun effet).
  if (state.hitstopCooldownRemaining > 0) {
    state.hitstopCooldownRemaining -= dtMs
  }
  if (state.hitstopRemaining > 0) {
    state.hitstopRemaining -= dtMs
    return 0
  }
  return 1
}
```

Dans `src/app/game.ts` :

5. Adapter l'import ligne 20 :

```ts
import { applyJuice, createJuiceState, DYING_STATE_MS, resetJuiceState, timeScaleFor } from './juice'
```

6. Dans `handleSimEvents`, remplacer `deathTimer = DEATH_SLOWMO_MS` par `deathTimer = DYING_STATE_MS`.

7. Dans `startRun`, ajouter la réinitialisation :

```ts
  function startRun(): void {
    run = createRun()
    resetJuiceState(juice)
    ownedIds = []
    mythicTaken = false
    seenPowerups = new Set()
    killCount = 0
  }
```

8. Dans `src/app/juice.test.ts`, retirer `DEATH_SLOWMO_MS` de l'import (ligne 13) et supprimer l'assertion ligne 55 :

```ts
    expect(state.deathSlowmoRemaining).toBe(DEATH_SLOWMO_MS)
```

Elle couvrait exactement le champ mort qu'on supprime — c'est le test qui garantissait que la fuite se produisait. Le reste du `it()` qui la contient (la mort coupe bien secousse et particules en mouvement réduit) est conservé tel quel.

- [ ] **Step 4: Lancer la vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/juice.ts src/app/game.ts src/app/juice.test.ts
git commit -m "fix(app): ne plus démarrer une run avec le juice de la précédente"
```

---

### Task 2: Trois comportements d'éclats en plus

Le Buvard a besoin d'éclats qui naissent sur un cercle et convergent en accélérant ; le Givre, d'éclats qui s'immobilisent en plein vol. Trois options facultatives : sans elles, `emitBurst` se comporte exactement comme avant.

**Files:**
- Modify: `src/render/particles.ts`
- Test: `src/render/particles.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `BurstOptions` gagne `spawnRadius?: number`, `converge?: boolean`, `stallAfterMs?: number`. Fonctions pures exportées : `convergeSpeed(distance: number, spawnRadius: number, baseSpeed: number): number` et `stallDamping(age: number, stallAfterMs: number | undefined, dtMs: number): number`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `src/render/particles.test.ts` :

```ts
describe('convergeSpeed', () => {
  it('démarre lentement au bord du cercle de naissance', () => {
    expect(convergeSpeed(100, 100, 200)).toBeCloseTo(100, 6)
  })

  it('atteint sa vitesse maximale au centre', () => {
    expect(convergeSpeed(0, 100, 200)).toBeCloseTo(400, 6)
  })

  it('accélère à mesure que la particule se rapproche', () => {
    expect(convergeSpeed(20, 100, 200)).toBeGreaterThan(convergeSpeed(80, 100, 200))
  })

  it('ne ralentit pas au-delà du cercle de naissance', () => {
    expect(convergeSpeed(180, 100, 200)).toBeCloseTo(convergeSpeed(100, 100, 200), 6)
  })
})

describe('stallDamping', () => {
  it('laisse la particule libre sans délai d’arrêt', () => {
    expect(stallDamping(500, undefined, 16.67)).toBe(1)
  })

  it('laisse la particule libre avant son délai', () => {
    expect(stallDamping(100, 240, 16.67)).toBe(1)
  })

  it('la fige une fois le délai passé', () => {
    expect(stallDamping(300, 240, 16.67)).toBeLessThan(0.6)
  })

  it('ne dépend pas du framerate', () => {
    const plein = stallDamping(300, 240, 16.67)
    const moitie = stallDamping(300, 240, 8.335)
    expect(moitie * moitie).toBeCloseTo(plein, 6)
  })
})
```

Si `src/render/particles.test.ts` n'importe encore que `burstAngle`, compléter l'import.

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/render/particles.test.ts`
Expected: FAIL — `convergeSpeed is not a function`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `src/render/particles.ts`, ajouter après `burstAngle` :

```ts
/** Décroissance par pas de 16,67 ms d'une particule prise en glace. */
const STALL_DECAY_PER_STEP = 0.55

/**
 * Vitesse d'aspiration à `distance` du centre. Elle croît à mesure que la
 * particule se rapproche : une aspiration à vitesse constante se lit comme une
 * convergence géométrique, pas comme une force (spec §4.3). Au-delà du cercle
 * de naissance la courbe est plate — rien ne naît là, mais une particule
 * poussée hors du cercle ne doit pas accélérer à l'envers.
 */
export function convergeSpeed(distance: number, spawnRadius: number, baseSpeed: number): number {
  const closeness = 1 - Math.min(1, distance / spawnRadius)
  return baseSpeed * (0.5 + 1.5 * closeness)
}

/**
 * Facteur de vitesse d'une particule « prise en glace » : 1 tant qu'elle file,
 * puis une décroissance rapide et indépendante du framerate. Exprimée par pas
 * de référence puis élevée à la puissance du pas réel, pour qu'un écran à
 * 120 Hz gèle au même rythme qu'un écran à 60 Hz.
 */
export function stallDamping(
  age: number,
  stallAfterMs: number | undefined,
  dtMs: number,
): number {
  if (stallAfterMs === undefined || age < stallAfterMs) {
    return 1
  }
  return STALL_DECAY_PER_STEP ** (dtMs / 16.67)
}
```

Étendre `BurstOptions` :

```ts
export interface BurstOptions {
  color: number
  count: number
  /** Direction centrale du cône, en radians. Ignorée si `spread` vaut 2π. */
  dir?: number
  /** Ouverture totale du cône, en radians. Par défaut le cercle entier. */
  spread?: number
  /** Vitesse de référence en px/s ; chaque particule la module de ×0,35 à ×1,65. */
  speed?: number
  sizeScale?: number
  /** Éclats étirés le long de leur vélocité plutôt que ronds. */
  streak?: boolean
  /** Les éclats naissent sur un cercle de ce rayon plutôt qu'au point d'émission. */
  spawnRadius?: number
  /** Les éclats convergent vers le point d'émission au lieu de s'en éloigner. */
  converge?: boolean
  /** Passé ce délai (ms), l'éclat s'immobilise et fond sur place. */
  stallAfterMs?: number
}
```

Étendre `Particle` :

```ts
interface Particle {
  gfx: Graphics
  vx: number
  vy: number
  life: number
  maxLife: number
  age: number
  stallAfterMs?: number
  /** Renseigné pour les éclats aspirés : centre, rayon de naissance, vitesse de référence. */
  converge?: { cx: number; cy: number; spawnRadius: number; baseSpeed: number }
}
```

Dans `emitBurst`, à l'intérieur de la boucle, remplacer le positionnement et la construction du `Particle` :

```ts
        const spawnRadius = opts.spawnRadius ?? 0
        gfx.x = x + Math.cos(angle) * spawnRadius
        gfx.y = y + Math.sin(angle) * spawnRadius
        container.addChild(gfx)

        const maxLife = 280 + Math.random() * 420
        active.push({
          gfx,
          // Un éclat aspiré reçoit sa vélocité à chaque frame dans `update` :
          // elle dépend de sa distance au centre, qui change.
          vx: opts.converge ? 0 : Math.cos(angle) * speed,
          vy: opts.converge ? 0 : Math.sin(angle) * speed,
          life: maxLife,
          maxLife,
          age: 0,
          stallAfterMs: opts.stallAfterMs,
          converge: opts.converge
            ? { cx: x, cy: y, spawnRadius: Math.max(1, spawnRadius), baseSpeed }
            : undefined,
        })
```

Dans `update`, remplacer le corps de la boucle après le décompte de vie :

```ts
        p.age += dtMs

        if (p.converge) {
          const dx = p.converge.cx - p.gfx.x
          const dy = p.converge.cy - p.gfx.y
          const distance = Math.hypot(dx, dy)
          if (distance < 6) {
            // Arrivé au centre : il est absorbé, pas figé au milieu du buvard.
            p.gfx.destroy()
            active.splice(i, 1)
            continue
          }
          const speed = convergeSpeed(distance, p.converge.spawnRadius, p.converge.baseSpeed)
          // Composante tangentielle : l'éclat spirale au lieu de tomber droit,
          // ce qui annonce le tourbillon de la zone (`views/hazard.ts`).
          const angle = Math.atan2(dy, dx) + 0.5
          p.vx = Math.cos(angle) * speed
          p.vy = Math.sin(angle) * speed
          p.gfx.x += p.vx * dt
          p.gfx.y += p.vy * dt
        } else {
          p.gfx.x += p.vx * dt
          p.gfx.y += p.vy * dt
          const damping = stallDamping(p.age, p.stallAfterMs, dtMs)
          p.vx *= 0.94 * damping
          p.vy *= 0.94 * damping
        }
        p.gfx.alpha = p.life / p.maxLife
```

- [ ] **Step 4: Lancer la vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS, tests existants de `burstAngle` compris.

- [ ] **Step 5: Commit**

```bash
git add src/render/particles.ts src/render/particles.test.ts
git commit -m "feat(render): aspirer et figer des éclats, en plus de les projeter"
```

---

### Task 3: Anneaux qui se contractent, qui piquent, ou qui attendent

Le Buvard a besoin d'un anneau qui rétrécit, le Givre d'une onde en aiguilles, la Bombe d'une seconde onde retardée de 90 ms. `juice.ts` est appelé par pas de simulation et n'a pas d'horloge propre : le retard doit être porté par l'anneau lui-même.

**Files:**
- Modify: `src/render/fx/shockwave.ts`
- Test: `src/render/fx/shockwave.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `ShockwaveOptions` gagne `fromRadius?: number`, `needles?: number`, `delayMs?: number`. Fonctions pures exportées : `ringRadiusBetween(progress: number, fromRadius: number, toRadius: number): number` et `needleOuter(index: number, radius: number): number`. `ringRadius` conserve sa signature et son comportement.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `src/render/fx/shockwave.test.ts` :

```ts
describe('ringRadiusBetween', () => {
  it('coïncide avec ringRadius quand elle part de zéro', () => {
    expect(ringRadiusBetween(0.4, 0, 100)).toBeCloseTo(ringRadius(0.4, 100), 10)
  })

  it('part du rayon initial', () => {
    expect(ringRadiusBetween(0, 190, 14)).toBeCloseTo(190, 10)
  })

  it('atteint exactement le rayon final', () => {
    expect(ringRadiusBetween(1, 190, 14)).toBeCloseTo(14, 10)
  })

  it('reste monotone décroissante quand elle se contracte', () => {
    expect(ringRadiusBetween(0.7, 190, 14)).toBeLessThan(ringRadiusBetween(0.3, 190, 14))
  })
})

describe('needleOuter', () => {
  it('alterne une aiguille courte et une longue', () => {
    expect(needleOuter(0, 100)).toBeCloseTo(100, 10)
    expect(needleOuter(1, 100)).toBeGreaterThan(needleOuter(0, 100))
  })

  it('garde la même alternance d’un tour sur l’autre', () => {
    expect(needleOuter(2, 100)).toBeCloseTo(needleOuter(0, 100), 10)
    expect(needleOuter(3, 100)).toBeCloseTo(needleOuter(1, 100), 10)
  })
})
```

Compléter l'import avec `ringRadiusBetween` et `needleOuter`.

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/render/fx/shockwave.test.ts`
Expected: FAIL — `ringRadiusBetween is not a function`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `src/render/fx/shockwave.ts` :

```ts
/** Rayon intérieur des aiguilles de givre, en fraction du rayon de l'onde. */
const NEEDLE_INNER = 0.78
/** Dépassement d'une aiguille sur deux. */
const NEEDLE_OVERSHOOT = 1.14

/**
 * Rayon d'un anneau qui va de `fromRadius` à `toRadius` à `progress` (0 → 1).
 * Même courbe ease-out cubique que `ringRadius`, dont elle est la
 * généralisation : l'onde part vite puis freine, qu'elle s'étende ou se
 * contracte.
 */
export function ringRadiusBetween(progress: number, fromRadius: number, toRadius: number): number {
  return fromRadius + (toRadius - fromRadius) * (1 - (1 - progress) ** 3)
}

export function ringRadius(progress: number, maxRadius: number): number {
  return ringRadiusBetween(progress, 0, maxRadius)
}

/**
 * Rayon extérieur de l'aiguille `index`. Une sur deux dépasse : une onde de
 * givre dont toutes les pointes s'arrêtent au même rayon se relit comme un
 * cercle, exactement ce qu'on cherche à éviter (spec §4.2).
 */
export function needleOuter(index: number, radius: number): number {
  return radius * (index % 2 === 0 ? 1 : NEEDLE_OVERSHOOT)
}
```

Remplacer la définition existante de `ringRadius` (ne pas la dupliquer) et étendre les options :

```ts
export interface ShockwaveOptions {
  color: number
  radius: number
  durationMs?: number
  thickness?: number
  /** Rayon de départ ; au-delà de `radius`, l'anneau se contracte. Par défaut 0. */
  fromRadius?: number
  /** Dessine l'onde en N aiguilles radiales plutôt qu'en cercle. */
  needles?: number
  /** Délai avant que l'anneau ne commence à vivre, en ms. */
  delayMs?: number
}
```

Étendre `Ring` avec `fromRadius: number`, `needles: number`, `delayMs: number`, et les renseigner dans `emit` (`opts.fromRadius ?? 0`, `opts.needles ?? 0`, `opts.delayMs ?? 0`). Un anneau retardé naît invisible : poser `gfx.visible = false` à la création.

Dans `update`, décompter d'abord le délai, puis dessiner :

```ts
      if (ring.delayMs > 0) {
        ring.delayMs -= dtMs
        if (ring.delayMs > 0) {
          continue
        }
        ring.gfx.visible = true
      }
```

et remplacer le tracé du cercle par un aiguillage :

```ts
      const progress = 1 - ring.life / ring.maxLife
      const radius = ringRadiusBetween(progress, ring.fromRadius, ring.maxRadius)
      const alpha = ring.life / ring.maxLife
      const width = ring.thickness * alpha + 0.5

      ring.gfx.clear()
      if (ring.needles > 0) {
        for (let n = 0; n < ring.needles; n++) {
          const angle = (n / ring.needles) * Math.PI * 2
          const inner = radius * NEEDLE_INNER
          const outer = needleOuter(n, radius)
          ring.gfx
            .moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
            .lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
        }
        ring.gfx.circle(0, 0, radius * NEEDLE_INNER)
        ring.gfx.stroke({ color: ring.color, width, alpha })
      } else {
        ring.gfx.circle(0, 0, Math.max(1, radius)).stroke({ color: ring.color, width, alpha })
      }
```

Adapter cet extrait à la forme exacte du `update` existant (noms des variables locales, gestion de `life`) sans changer sa logique de décompte.

- [ ] **Step 4: Lancer la vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS, les quatre tests existants de `ringRadius` compris.

- [ ] **Step 5: Commit**

```bash
git add src/render/fx/shockwave.ts src/render/fx/shockwave.test.ts
git commit -m "feat(render): contracter, hérisser et retarder une onde de choc"
```

---

### Task 4: La page révélée par la plume

Une page réglée sous l'arène, invisible hors d'un halo de 165 px centré sur le joueur. Le calque va dans `content`, **avant** `worldLayer` : il hérite ainsi du masque d'arène, du zoom et de la vignette, mais pas du boil — la réglure est du papier, pas du trait d'encre, elle ne doit pas frémir à 8 fps.

La révélation est un **masque** : un `Sprite` porteur d'une texture en dégradé radial, déplacé sur le joueur à chaque frame. Déplacer un masque coûte une transformation par frame ; redessiner la réglure en coûterait une par ligne.

**Files:**
- Create: `src/render/page.ts`
- Create: `src/render/page.test.ts`
- Modify: `src/render/stage.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `createPage(container: Container): Page` où
  ```ts
  export interface Page {
    resize(width: number, height: number): void
    /** `null` quand le joueur n'est pas à l'écran : la page se retire. */
    update(position: { x: number; y: number } | null): void
    /** `false` = mouvement réduit : réglure statique et uniforme, pas de halo. */
    setHaloEnabled(enabled: boolean): void
    destroy(): void
  }
  ```
  Fonction pure exportée : `revealAlpha(distance: number, radius: number): number`. Constantes exportées : `PAGE_HALO_RADIUS = 165`, `PAGE_REVEAL_PEAK = 0.34`, `PAGE_STATIC_ALPHA = 0.07`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/render/page.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { PAGE_HALO_RADIUS, PAGE_REVEAL_PEAK, revealAlpha } from './page'

describe('revealAlpha', () => {
  it('atteint son pic sous la plume', () => {
    expect(revealAlpha(0, PAGE_HALO_RADIUS)).toBeCloseTo(PAGE_REVEAL_PEAK, 10)
  })

  it('s’annule exactement au bord du halo', () => {
    expect(revealAlpha(PAGE_HALO_RADIUS, PAGE_HALO_RADIUS)).toBe(0)
  })

  it('reste nulle au-delà : la page n’existe que dans le halo', () => {
    expect(revealAlpha(PAGE_HALO_RADIUS * 3, PAGE_HALO_RADIUS)).toBe(0)
  })

  it('décroît de façon monotone', () => {
    expect(revealAlpha(40, PAGE_HALO_RADIUS)).toBeGreaterThan(revealAlpha(120, PAGE_HALO_RADIUS))
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/render/page.test.ts`
Expected: FAIL — le module `./page` n'existe pas.

- [ ] **Step 3: Créer `src/render/page.ts`**

```ts
import { Container, Graphics, Sprite, Texture } from 'pixi.js'

import { INK } from './ink'

/** Rayon du halo de révélation, en pixels d'arène. */
export const PAGE_HALO_RADIUS = 165
/** Opacité de la réglure sous la plume. */
export const PAGE_REVEAL_PEAK = 0.34
/**
 * Opacité uniforme de la réglure en mouvement réduit. Le halo est alors coupé :
 * un large disque lumineux qui suit le joueur est précisément le genre de
 * changement de luminance que ce réglage existe pour éviter (spec §6). La page
 * reste, seule sa révélation mobile disparaît.
 */
export const PAGE_STATIC_ALPHA = 0.07

/** Espacement des lignes de réglure. */
const RULE_GAP = 32
/** Abscisse de la marge verticale. */
const MARGIN_X = 58
/** Côté de la texture de dégradé, en pixels. */
const MASK_SIZE = PAGE_HALO_RADIUS * 2

export interface Page {
  resize(width: number, height: number): void
  /** `null` quand le joueur n'est pas à l'écran : la page se retire. */
  update(position: { x: number; y: number } | null): void
  /** `false` = mouvement réduit : réglure statique et uniforme, pas de halo. */
  setHaloEnabled(enabled: boolean): void
  destroy(): void
}

/**
 * Opacité de la page à `distance` de la plume. Pic au centre, nulle au bord et
 * au-delà : c'est la variante « révélation pure » — hors du halo, le fond
 * n'existe pas (spec §2.1).
 */
export function revealAlpha(distance: number, radius: number): number {
  if (distance >= radius) {
    return 0
  }
  return PAGE_REVEAL_PEAK * (1 - distance / radius)
}

/**
 * Texture du masque : un disque dont l'alpha suit `revealAlpha`, normalisé sur
 * [0, 1] — c'est `container.alpha` qui porte le pic, pour que le mouvement
 * réduit puisse le remplacer par une valeur uniforme sans retoucher la texture.
 */
function createMaskTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = MASK_SIZE
  canvas.height = MASK_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('render/page: contexte 2D indisponible pour le masque de révélation')
  }
  const gradient = ctx.createRadialGradient(
    PAGE_HALO_RADIUS,
    PAGE_HALO_RADIUS,
    0,
    PAGE_HALO_RADIUS,
    PAGE_HALO_RADIUS,
    PAGE_HALO_RADIUS,
  )
  const stops = 12
  for (let i = 0; i <= stops; i++) {
    const t = i / stops
    const normalized = revealAlpha(t * PAGE_HALO_RADIUS, PAGE_HALO_RADIUS) / PAGE_REVEAL_PEAK
    gradient.addColorStop(t, `rgba(255,255,255,${normalized})`)
  }
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE)
  return Texture.from(canvas)
}

/**
 * La page sous l'arène : une réglure de cahier révélée par un halo qui suit la
 * plume. Vit dans `content`, avant `worldLayer` — elle prend donc le masque
 * d'arène et la vignette, mais pas le boil : c'est du papier, pas de l'encre.
 */
export function createPage(container: Container): Page {
  const layer = new Container()
  const ruling = new Graphics()
  layer.addChild(ruling)
  container.addChild(layer)

  const maskTexture = createMaskTexture()
  const mask = new Sprite(maskTexture)
  mask.anchor.set(0.5)
  container.addChild(mask)

  let haloEnabled = true

  const applyMode = (): void => {
    layer.mask = haloEnabled ? mask : null
    mask.visible = haloEnabled
    layer.alpha = haloEnabled ? PAGE_REVEAL_PEAK : PAGE_STATIC_ALPHA
  }
  applyMode()

  return {
    resize(width, height): void {
      // Tracée à opacité pleine : le dégradé du masque et `layer.alpha`
      // portent seuls l'atténuation, donc un redimensionnement n'a jamais à
      // rejouer les calculs de révélation.
      ruling.clear()
      for (let y = RULE_GAP; y < height; y += RULE_GAP) {
        ruling.moveTo(0, y).lineTo(width, y)
      }
      ruling.stroke({ color: INK.paper, width: 1.3 })
      ruling.moveTo(MARGIN_X, 0).lineTo(MARGIN_X, height)
      ruling.stroke({ color: INK.danger, width: 1.3, alpha: 0.85 })
    },

    update(position): void {
      if (!position) {
        layer.visible = false
        mask.visible = false
        return
      }
      layer.visible = true
      if (haloEnabled) {
        mask.visible = true
        mask.position.set(position.x, position.y)
      }
    },

    setHaloEnabled(enabled): void {
      haloEnabled = enabled
      applyMode()
    },

    destroy(): void {
      layer.destroy({ children: true })
      mask.destroy()
      maskTexture.destroy(true)
    },
  }
}
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Run: `npx vitest run src/render/page.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Câbler le calque dans `stage.ts`**

1. Ajouter l'import : `import { createPage } from './page'`.

2. Créer le calque **avant** `worldLayer`, juste après `content.mask = clip` et `viewportLayer.addChild(content)` :

```ts
  // Avant `worldLayer` : la page passe sous les entités. Dans `content`, donc
  // masquée à l'arène, zoomée avec elle et assombrie par la vignette — mais
  // hors du boil, qui n'est posé que sur `worldLayer` : la réglure est du
  // papier, elle ne doit pas frémir à 8 fps comme le trait d'encre.
  const page = createPage(content)

  const worldLayer = new Container()
  content.addChild(worldLayer)
```

3. Dans `sync`, après la mise à jour de la vue du joueur, alimenter la page avec sa position **interpolée** — la même que `playerView`, sans quoi la réglure sauterait d'un pas de simulation à l'autre :

```ts
      page.update(
        world.playerEid >= 0
          ? {
              x: lerp(at(PrevPosition.x, world.playerEid), at(Position.x, world.playerEid), alpha),
              y: lerp(at(PrevPosition.y, world.playerEid), at(Position.y, world.playerEid), alpha),
            }
          : null,
      )
```

4. Dans `setViewport`, ajouter `page.resize(arenaWidth, arenaHeight)` à côté de `frame.resize(...)`.

5. Dans `setEffects`, ajouter `page.setHaloEnabled(effectsEnabled)`.

6. Dans `destroy`, ajouter `page.destroy()`.

- [ ] **Step 6: Vérifier à l'œil**

Run: `npm run dev`, lancer une partie.
Expected: une réglure pâle apparaît sous la plume et le suit ; hors du halo l'arène reste noire ; la réglure ne tremble pas (pas de boil) ; elle s'assombrit sur les bords avec la vignette ; elle disparaît à la mort. Dans Réglages, activer le mouvement réduit : la réglure devient uniforme et faible sur toute l'arène, sans halo.

- [ ] **Step 7: Vérification complète et commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/render/page.ts src/render/page.test.ts src/render/stage.ts
git commit -m "feat(render): révéler une page réglée sous la plume"
```

---

### Task 5: Le halo s'installe et respire

Aujourd'hui l'anneau du joueur apparaît d'un coup (`halo.visible = hasHalo`). Il doit s'installer en 320 ms puis respirer tant qu'il couvre, et sept motes tournent avec lui. C'est la signature du power-up Halo : le seul des cinq qui ne détone pas.

**Files:**
- Modify: `src/render/views/player.ts`
- Create: `src/render/views/player.test.ts`
- Modify: `src/render/stage.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `PlayerView.update` gagne le champ `dtMs: number`. Fonctions pures exportées depuis `player.ts` : `haloInstall(elapsedMs: number): number` et `haloBreathe(elapsedMs: number): number`. Constantes exportées : `HALO_INSTALL_MS = 320`, `HALO_BREATHE_AMPLITUDE = 0.045`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/render/views/player.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { HALO_BREATHE_AMPLITUDE, HALO_INSTALL_MS, haloBreathe, haloInstall } from './player'

describe('haloInstall', () => {
  it('part de rien', () => {
    expect(haloInstall(0)).toBeCloseTo(0, 10)
  })

  it('est complètement installé au bout de sa durée', () => {
    expect(haloInstall(HALO_INSTALL_MS)).toBeCloseTo(1, 10)
  })

  it('ne dépasse jamais 1, même longtemps après', () => {
    expect(haloInstall(HALO_INSTALL_MS * 10)).toBe(1)
  })

  it('freine en fin de course : plus de la moitié du chemin à mi-temps', () => {
    expect(haloInstall(HALO_INSTALL_MS / 2)).toBeGreaterThan(0.5)
  })
})

describe('haloBreathe', () => {
  it('démarre à sa taille nominale', () => {
    expect(haloBreathe(0)).toBeCloseTo(1, 10)
  })

  it('reste borné par son amplitude', () => {
    for (let t = 0; t < 4000; t += 17) {
      expect(Math.abs(haloBreathe(t) - 1)).toBeLessThanOrEqual(HALO_BREATHE_AMPLITUDE + 1e-9)
    }
  })

  it('respire vraiment : il s’écarte de 1 quelque part', () => {
    let ecartMax = 0
    for (let t = 0; t < 4000; t += 17) {
      ecartMax = Math.max(ecartMax, Math.abs(haloBreathe(t) - 1))
    }
    expect(ecartMax).toBeGreaterThan(HALO_BREATHE_AMPLITUDE * 0.9)
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/render/views/player.test.ts`
Expected: FAIL — `haloInstall is not a function`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `src/render/views/player.ts`, remplacer le fichier par :

```ts
import { Container, Graphics } from 'pixi.js'

import { INK } from '../ink'

/** Durée d'installation du halo, en ms. */
export const HALO_INSTALL_MS = 320
/** Amplitude de la respiration, en fraction du rayon. */
export const HALO_BREATHE_AMPLITUDE = 0.045
/** Pulsation de la respiration, en rad/ms — une période d'environ 1,25 s. */
const HALO_BREATHE_RATE = 0.005
/** Rayon nominal de l'anneau. */
const HALO_RADIUS = 17
/** Nombre de motes en orbite. */
const MOTE_COUNT = 7
/** Vitesse angulaire des motes, en rad/ms. */
const MOTE_RATE = 0.0011

export interface PlayerView {
  container: Container
  update(opts: {
    x: number
    y: number
    angle: number
    hasHalo: boolean
    invulnerable: boolean
    /** Temps réel écoulé depuis la frame précédente — anime le halo. */
    dtMs: number
  }): void
}

/**
 * La silhouette de la pointe de plume, à l'origine et pointant vers +x.
 * Exportée parce que les images rémanentes de la ruée (`fx/afterimage.ts`) la
 * dessinent aussi : un fantôme qui ne ressemble pas au joueur ne se lit pas
 * comme sa trace, et deux copies du même tracé finissent toujours par diverger.
 */
export function drawNib(gfx: Graphics, color: number): void {
  gfx.moveTo(13, 0).lineTo(-8, 9).lineTo(-4, 0).lineTo(-8, -9).closePath().fill({ color })
}

/**
 * Installation du halo sur [0, 1]. Courbe ease-out cubique : il se pose vite
 * puis s'ancre, au lieu d'apparaître d'un coup comme avant (spec §4.5).
 */
export function haloInstall(elapsedMs: number): number {
  const k = Math.min(1, Math.max(0, elapsedMs / HALO_INSTALL_MS))
  return 1 - (1 - k) ** 3
}

/** Facteur de rayon de la respiration, borné à ±`HALO_BREATHE_AMPLITUDE`. */
export function haloBreathe(elapsedMs: number): number {
  return 1 + HALO_BREATHE_AMPLITUDE * Math.sin(elapsedMs * HALO_BREATHE_RATE)
}

/** Le joueur : une pointe de plume orientée vers son déplacement. */
export function createPlayerView(): PlayerView {
  const container = new Container()
  const body = new Graphics()
  const halo = new Graphics()
  const motes = new Graphics()
  container.addChild(halo, motes, body)

  drawNib(body, INK.paper)
  halo.circle(0, 0, HALO_RADIUS).stroke({ color: INK.paper, width: 2, alpha: 0.55 })

  // Le halo s'anime sur une horloge murale qui lui est propre : il doit
  // continuer à respirer pendant un hitstop, comme la secousse et les
  // particules, alors que le monde est gelé.
  let haloElapsed = 0
  let hadHalo = false

  return {
    container,
    update({ x, y, angle, hasHalo, invulnerable, dtMs }) {
      container.x = x
      container.y = y
      container.rotation = angle
      container.alpha = invulnerable && !hasHalo ? 0.55 : 1

      if (hasHalo && !hadHalo) {
        // Reprise à zéro à chaque nouveau halo : ramassé deux fois de suite,
        // il doit se réinstaller, pas continuer la respiration du précédent.
        haloElapsed = 0
      }
      hadHalo = hasHalo
      halo.visible = hasHalo
      motes.visible = hasHalo
      if (!hasHalo) {
        return
      }

      haloElapsed += dtMs
      const install = haloInstall(haloElapsed)
      const scale = install * haloBreathe(haloElapsed)
      halo.scale.set(scale)
      halo.alpha = install

      // La rotation des motes est portée par le tracé, pas par un conteneur :
      // le conteneur du joueur tourne déjà avec la plume, et les motes ne
      // doivent pas suivre son orientation.
      motes.clear()
      for (let i = 0; i < MOTE_COUNT; i++) {
        const a = (i / MOTE_COUNT) * Math.PI * 2 + haloElapsed * MOTE_RATE - angle
        const r = HALO_RADIUS * 3.8 * scale
        motes.circle(Math.cos(a) * r, Math.sin(a) * r, 2.1)
      }
      motes.fill({ color: INK.paper, alpha: 0.55 * install })
    },
  }
}
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Run: `npx vitest run src/render/views/player.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Passer `dtMs` depuis `stage.ts`**

Dans `sync`, l'appel à `playerView.update({...})` gagne `dtMs: frameDtMs` — la variable est déjà calculée en tête de fonction, précisément pour être disponible ici.

- [ ] **Step 6: Vérification complète et commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

```bash
git add src/render/views/player.ts src/render/views/player.test.ts src/render/stage.ts
git commit -m "feat(render): installer le halo au lieu de le faire apparaître"
```

---

### Task 6: Une signature de déclenchement par power-up

`applyJuice` reçoit un `kind` et le jette : les cinq power-ups jouent le même souffle ambre. On le route désormais vers cinq signatures qui se distinguent sur un axe structurel — le sens du mouvement, le rythme, le comportement des éclats — et pas seulement par la couleur.

**Files:**
- Modify: `src/app/juice.ts`
- Test: `src/app/juice.test.ts`

**Interfaces:**
- Consumes: `BurstOptions.spawnRadius` / `.converge` / `.stallAfterMs` (tâche 2) ; `ShockwaveOptions.fromRadius` / `.needles` / `.delayMs` (tâche 3).
- Produces: rien de nouveau à l'extérieur ; `applyJuice` conserve sa signature.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `src/app/juice.test.ts`, en réutilisant les helpers déjà présents dans ce fichier — `fakeFx(motionEnabled)` (ligne 18) et `createWorld` importé de `@/sim/world`. Compléter l'import de tête avec `POWERUP_ID` et le type `PowerUpKind` depuis `@/sim/data/powerups`. Les mocks de `fakeFx` sont des `vi.fn()`, donc `.mock.calls` est disponible après un cast `vi.mocked(...)` ou via `as unknown as Mock` selon ce que le typage exige :

```ts
describe('signatures de déclenchement des power-ups', () => {
  /** Rejoue un `powerupUsed` du kind donné et rend les appels observés. */
  function declenche(kind: PowerUpKind): ReturnType<typeof fakeFx> {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x: 100, y: 100 })
    const fx = fakeFx(true)
    applyJuice(world, createJuiceState(), fx)
    return fx
  }

  it('la Bombe frappe deux fois, la seconde en retard', () => {
    const fx = declenche('blast')
    expect(fx.shockwaves.emit).toHaveBeenCalledTimes(2)
    const retards = fx.shockwaves.emit.mock.calls.map((c) => c[2].delayMs ?? 0)
    expect(retards.filter((d) => d > 0)).toHaveLength(1)
  })

  it('le Givre hérisse son onde et fige ses éclats', () => {
    const fx = declenche('freeze')
    expect(fx.shockwaves.emit.mock.calls[0]?.[2].needles).toBeGreaterThan(0)
    expect(fx.particles.emitBurst.mock.calls[0]?.[2].stallAfterMs).toBeGreaterThan(0)
  })

  it('le Buvard aspire : ses éclats naissent au bord et convergent', () => {
    const fx = declenche('blotter')
    const burst = fx.particles.emitBurst.mock.calls[0]?.[2]
    expect(burst.converge).toBe(true)
    expect(burst.spawnRadius).toBeGreaterThan(0)
    const ring = fx.shockwaves.emit.mock.calls[0]?.[2]
    expect(ring.fromRadius).toBeGreaterThan(ring.radius)
  })

  it('la Ruée n’émet aucun anneau : elle part quelque part', () => {
    const fx = declenche('dash')
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
    expect(fx.particles.emitBurst).toHaveBeenCalled()
  })

  it('le Halo ne détone pas', () => {
    const fx = declenche('halo')
    expect(fx.particles.emitBurst).not.toHaveBeenCalled()
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
    // Il s'annonce quand même : c'est `views/player.ts` qui l'installe.
    expect(fx.flash.flash).toHaveBeenCalled()
  })

  it('ne joue aucune signature en mouvement réduit', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.events.push({ type: 'powerupUsed', kind: POWERUP_ID.blast, x: 100, y: 100 })
    const fx = fakeFx(false)
    applyJuice(world, createJuiceState(), fx)
    expect(fx.particles.emitBurst).not.toHaveBeenCalled()
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/app/juice.test.ts`
Expected: FAIL — les cinq kinds produisent aujourd'hui le même appel unique.

- [ ] **Step 3: Écrire l'implémentation**

Dans `src/app/juice.ts`, ajouter l'import `import { POWERUP_BY_ID } from '@/sim/data/powerups'` (et le type `PowerUpKind` si le fichier ne l'a pas déjà), puis la fonction de routage avant `applyJuice` :

```ts
/**
 * Le déclenchement d'un power-up. Chaque signature se distingue sur un axe
 * structurel — sens du mouvement, rythme, comportement des éclats — et pas
 * seulement par la couleur : sinon le daltonisme, la vignette de danger et le
 * grain suffisent à les confondre (spec §4).
 *
 * `angle` vient de `Facing` quand l'entité en porte un ; `null` sinon. Seule la
 * Ruée s'en sert : c'est le seul déclenchement orienté des cinq.
 */
function powerupSignature(
  kind: PowerUpKind,
  x: number,
  y: number,
  angle: number | null,
  fx: {
    particles: Particles
    flash: Flash
    shockwaves: Shockwaves
  },
): void {
  switch (kind) {
    case 'blast':
      // Deux temps : la seule des cinq à frapper deux fois, donc la plus violente.
      fx.flash.flash(INK.blast, 0.12)
      fx.shockwaves.emit(x, y, { color: INK.blast, radius: 92, durationMs: 300, thickness: 4 })
      fx.shockwaves.emit(x, y, {
        color: INK.blast,
        radius: 132,
        fromRadius: 10,
        durationMs: 560,
        thickness: 2,
        delayMs: 90,
      })
      fx.particles.emitBurst(x, y, {
        color: INK.blast,
        count: 22,
        speed: 280,
        streak: true,
      })
      break

    case 'freeze':
      // L'onde pousse en aiguilles et les éclats prennent en glace en plein vol.
      fx.flash.flash(INK.frost, 0.05)
      fx.shockwaves.emit(x, y, {
        color: INK.frost,
        radius: 88,
        durationMs: 620,
        thickness: 2,
        needles: 16,
      })
      fx.particles.emitBurst(x, y, {
        color: INK.frost,
        count: 18,
        speed: 215,
        streak: true,
        stallAfterMs: 300,
      })
      break

    case 'blotter':
      // Le seul qui va vers l'intérieur : on comprend qu'il attire avant
      // qu'un ennemi ait bougé.
      fx.flash.flash(INK.paper, 0.03)
      fx.shockwaves.emit(x, y, {
        color: INK.paper,
        radius: 14,
        fromRadius: 100,
        durationMs: 620,
        thickness: 2.4,
      })
      fx.particles.emitBurst(x, y, {
        color: INK.paper,
        count: 26,
        speed: 150,
        spawnRadius: 108,
        converge: true,
        streak: true,
      })
      break

    case 'dash': {
      // Aucun anneau : un anneau dit « ça part de partout », or la ruée part
      // quelque part. La giclée d'élan se fait à l'opposé de la direction.
      fx.flash.flash(INK.paper, 0.045)
      const dir = angle ?? 0
      fx.particles.emitBurst(x, y, {
        color: INK.paper,
        count: 16,
        dir: dir + Math.PI,
        spread: 0.9,
        speed: 290,
        streak: true,
      })
      break
    }

    case 'halo':
      // Une protection ne devrait pas exploser. L'anneau s'installe dans
      // `render/views/player.ts` ; ici, un simple accusé de réception.
      fx.flash.flash(INK.paper, 0.022)
      break

    default:
      break
  }
}
```

Remplacer le cas `'powerupUsed'` de la boucle d'événements :

```ts
      case 'powerupUsed': {
        if (fx.motionEnabled) {
          const kind = POWERUP_BY_ID[event.kind]
          if (kind) {
            powerupSignature(kind, event.x, event.y, event.angle ?? null, fx)
          }
        }
        break
      }
```

L'événement `powerupUsed` ne porte pas encore d'angle. Deux options, à trancher à l'implémentation :

- **Retenue :** ne pas toucher à `SimEvent`. Lire l'orientation du joueur depuis le monde, comme le fait déjà `killDirection` : `Facing.angle[world.playerEid]`. La ruée part dans la direction où pointe la plume, qui est exactement ce que `Facing` porte. Remplacer `event.angle ?? null` par un helper local `playerFacing(world)` renvoyant `number | null` (`null` si `world.playerEid < 0`), sur le modèle de `killDirection`.
- Écartée : ajouter un champ `angle` à `SimEvent`, ce qui touche la simulation pour une information déjà lisible depuis le rendu.

Adapter les imports de types (`Particles`, `Flash`, `Shockwaves`, `Facing`) en conséquence.

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run src/app/juice.test.ts`
Expected: PASS.

- [ ] **Step 5: Vérifier à l'œil**

Run: `npm run dev`. Ramasser chaque power-up et vérifier que les cinq déclenchements sont distinguables les yeux fermés sur la couleur : deux ondes pour la Bombe, des piques pour le Givre, une aspiration pour le Buvard, une giclée orientée pour la Ruée, rien qui explose pour le Halo.

- [ ] **Step 6: Vérification complète et commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/app/juice.ts src/app/juice.test.ts
git commit -m "feat(juice): donner à chaque power-up sa signature de déclenchement"
```

---

### Task 7: La séquence de mort — phases et effets

Quatre temps, 1600 ms : l'arrêt (340 ms), les détonations en onde depuis le joueur (760 ms), la dispersion du joueur (500 ms). Le monde est gelé pendant tout `dying`, donc la séquence prend un instantané des ennemis au démarrage et n'y revient plus.

**Files:**
- Create: `src/render/fx/death-sequence.ts`
- Create: `src/render/fx/death-sequence.test.ts`

**Interfaces:**
- Consumes: `Particles`, `Flash`, `Shockwaves`.
- Produces:
  ```ts
  export type DeathPhase = 'freeze' | 'detonate' | 'disperse' | 'done'
  export const DEATH_FREEZE_MS = 340
  export const DEATH_DETONATE_MS = 760
  export const DEATH_DISPERSE_MS = 500
  export const DEATH_SEQUENCE_MS = 1600
  export function deathPhaseAt(elapsedMs: number): DeathPhase
  export function detonationDelay(distance: number, maxDistance: number, eid: number): number
  export interface DeathSequence {
    start(world: SimWorld, x: number, y: number, arenaWidth: number, arenaHeight: number): void
    update(dtMs: number, fx: { particles: Particles; flash: Flash; shockwaves: Shockwaves; motionEnabled: boolean }): void
    readonly detonated: ReadonlySet<number>
    readonly phase: DeathPhase
    readonly playerGone: boolean
    readonly done: boolean
    finish(): void
  }
  export function createDeathSequence(): DeathSequence
  ```

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/render/fx/death-sequence.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import {
  DEATH_DETONATE_MS,
  DEATH_DISPERSE_MS,
  DEATH_FREEZE_MS,
  DEATH_SEQUENCE_MS,
  deathPhaseAt,
  detonationDelay,
} from './death-sequence'

describe('durée de la séquence', () => {
  it('vaut exactement la somme de ses phases', () => {
    expect(DEATH_FREEZE_MS + DEATH_DETONATE_MS + DEATH_DISPERSE_MS).toBe(DEATH_SEQUENCE_MS)
  })
})

describe('deathPhaseAt', () => {
  it('commence par le temps d’arrêt', () => {
    expect(deathPhaseAt(0)).toBe('freeze')
    expect(deathPhaseAt(DEATH_FREEZE_MS - 1)).toBe('freeze')
  })

  it('enchaîne sur les détonations', () => {
    expect(deathPhaseAt(DEATH_FREEZE_MS)).toBe('detonate')
    expect(deathPhaseAt(DEATH_FREEZE_MS + DEATH_DETONATE_MS - 1)).toBe('detonate')
  })

  it('finit par la dispersion du joueur', () => {
    expect(deathPhaseAt(DEATH_FREEZE_MS + DEATH_DETONATE_MS)).toBe('disperse')
    expect(deathPhaseAt(DEATH_SEQUENCE_MS - 1)).toBe('disperse')
  })

  it('est terminée au bout de sa durée', () => {
    expect(deathPhaseAt(DEATH_SEQUENCE_MS)).toBe('done')
    expect(deathPhaseAt(DEATH_SEQUENCE_MS * 3)).toBe('done')
  })
})

describe('detonationDelay', () => {
  it('fait partir le plus proche avant le plus lointain', () => {
    expect(detonationDelay(10, 1000, 4)).toBeLessThan(detonationDelay(900, 1000, 4))
  })

  it('est déterministe : deux appels sur la même entité coïncident', () => {
    expect(detonationDelay(500, 1000, 42)).toBe(detonationDelay(500, 1000, 42))
  })

  it('désordonne un peu : deux entités à la même distance ne partent pas ensemble', () => {
    const delais = [1, 2, 3, 4, 5, 6, 7, 8].map((eid) => detonationDelay(500, 1000, eid))
    expect(new Set(delais).size).toBeGreaterThan(1)
  })

  it('laisse toute la file détoner avant la fin de sa phase', () => {
    for (let eid = 0; eid < 200; eid++) {
      expect(detonationDelay(1000, 1000, eid)).toBeLessThan(DEATH_DETONATE_MS)
    }
  })

  it('ne renvoie jamais de délai négatif', () => {
    expect(detonationDelay(0, 1000, 0)).toBeGreaterThanOrEqual(0)
  })

  it('supporte une distance au-delà du maximum sans dépasser la phase', () => {
    expect(detonationDelay(5000, 1000, 9)).toBeLessThan(DEATH_DETONATE_MS)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/render/fx/death-sequence.test.ts`
Expected: FAIL — le module `./death-sequence` n'existe pas.

- [ ] **Step 3: Créer `src/render/fx/death-sequence.ts`**

```ts
import { defineQuery } from 'bitecs'

import { Collider, Enemy, Position } from '@/sim/components'
import type { SimWorld } from '@/sim/world'
import { INK } from '../ink'
import type { Flash } from './flash'
import type { Particles } from '../particles'
import type { Shockwaves } from './shockwave'

/** Le monde se fige : les ennemis blanchissent, le joueur encaisse. */
export const DEATH_FREEZE_MS = 340
/** Les ennemis détonent, du plus proche au plus lointain. */
export const DEATH_DETONATE_MS = 760
/** Le joueur se disperse. */
export const DEATH_DISPERSE_MS = 500
/** Durée totale, et donc durée de l'état `dying`. */
export const DEATH_SEQUENCE_MS = DEATH_FREEZE_MS + DEATH_DETONATE_MS + DEATH_DISPERSE_MS

/** Étalement de l'onde de détonation sur la phase. */
const DETONATION_SPREAD_MS = 620
/** Grain de désordre, pour que l'onde ne se lise pas comme un métronome. */
const DETONATION_JITTER_MS = 70
/**
 * Fraction de la diagonale de l'arène au-delà de laquelle un ennemi part au
 * plus tard. Sans plafond, un seul traînard à l'angle opposé étirerait toute
 * l'onde et laisserait le centre de l'arène vide pendant une demi-seconde.
 */
const DETONATION_REACH = 0.62

const enemyQuery = defineQuery([Enemy, Position, Collider])

export type DeathPhase = 'freeze' | 'detonate' | 'disperse' | 'done'

export function deathPhaseAt(elapsedMs: number): DeathPhase {
  if (elapsedMs < DEATH_FREEZE_MS) {
    return 'freeze'
  }
  if (elapsedMs < DEATH_FREEZE_MS + DEATH_DETONATE_MS) {
    return 'detonate'
  }
  if (elapsedMs < DEATH_SEQUENCE_MS) {
    return 'disperse'
  }
  return 'done'
}

/**
 * Grain pseudo-aléatoire sur [0, 1[ tiré de l'`eid`. Volontairement pas
 * `Math.random()`, pourtant permis dans `src/render/` : une séquence de mort
 * reproductible se débogue et se teste, un tirage par frame non (spec §3.2).
 */
function jitter01(eid: number): number {
  return ((Math.imul(eid, 2654435761) >>> 0) % 1000) / 1000
}

/**
 * Délai de détonation d'un ennemi, en ms depuis le début de la phase. L'onde
 * part du point d'impact : la mort a un centre et une cause.
 */
export function detonationDelay(distance: number, maxDistance: number, eid: number): number {
  const reach = Math.max(1, maxDistance)
  const ratio = Math.min(1, Math.max(0, distance / reach))
  return ratio * DETONATION_SPREAD_MS + jitter01(eid) * DETONATION_JITTER_MS
}

interface Doomed {
  eid: number
  x: number
  y: number
  delay: number
}

export interface DeathSequence {
  start(world: SimWorld, x: number, y: number, arenaWidth: number, arenaHeight: number): void
  update(
    dtMs: number,
    fx: { particles: Particles; flash: Flash; shockwaves: Shockwaves; motionEnabled: boolean },
  ): void
  /** Ennemis déjà détonés : `stage.ts` cesse de les dessiner. */
  readonly detonated: ReadonlySet<number>
  readonly phase: DeathPhase
  /** Le joueur s'est dispersé : ni lui ni la page ne se dessinent plus. */
  readonly playerGone: boolean
  readonly done: boolean
  /** Saute à la fin — la séquence est interruptible au clavier (spec §3.3). */
  finish(): void
}

/**
 * La mise en scène de la mort. Purement du rendu : pendant l'état `dying`, la
 * simulation est déjà entièrement gelée (`app/game.ts` n'appelle `stepWorld`
 * que dans l'état `playing`), donc rien ici ne peut désynchroniser quoi que ce
 * soit. L'instantané des ennemis est pris une fois au démarrage, pour la même
 * raison : plus rien ne bougera.
 */
export function createDeathSequence(): DeathSequence {
  let elapsed = 0
  let doomed: Doomed[] = []
  let playerX = 0
  let playerY = 0
  const detonated = new Set<number>()
  let playerGone = false
  let active = false

  return {
    start(world, x, y, arenaWidth, arenaHeight): void {
      elapsed = 0
      detonated.clear()
      playerGone = false
      active = true
      playerX = x
      playerY = y

      const maxDistance = Math.hypot(arenaWidth, arenaHeight) * DETONATION_REACH
      doomed = []
      for (const eid of enemyQuery(world)) {
        const ex = Position.x[eid]
        const ey = Position.y[eid]
        if (ex === undefined || ey === undefined) {
          continue
        }
        doomed.push({
          eid,
          x: ex,
          y: ey,
          delay: detonationDelay(Math.hypot(ex - x, ey - y), maxDistance, eid),
        })
      }
    },

    update(dtMs, fx): void {
      if (!active) {
        return
      }
      elapsed += dtMs
      const phase = deathPhaseAt(elapsed)

      if (phase === 'detonate' || phase === 'disperse' || phase === 'done') {
        const since = elapsed - DEATH_FREEZE_MS
        for (const d of doomed) {
          if (detonated.has(d.eid) || since < d.delay) {
            continue
          }
          detonated.add(d.eid)
          if (fx.motionEnabled) {
            fx.particles.emitBurst(d.x, d.y, {
              color: INK.danger,
              count: 11,
              speed: 130,
              streak: true,
            })
            fx.shockwaves.emit(d.x, d.y, { color: INK.danger, radius: 46, durationMs: 380 })
            fx.flash.flash(INK.danger, 0.02)
          }
        }
      }

      if (!playerGone && (phase === 'disperse' || phase === 'done')) {
        playerGone = true
        // Le flash reste derrière `motionEnabled`, comme tous ceux de
        // `app/juice.ts` : c'est un changement de luminance plein cadre. En
        // mouvement réduit, la mort garde son ordre et son rythme — le
        // blanchiment et la disparition progressive des ennemis — sans
        // projection à l'écran (spec §6).
        if (fx.motionEnabled) {
          fx.flash.flash(INK.paper, 0.26, 300)
          fx.particles.emitBurst(playerX, playerY, {
            color: INK.paper,
            count: 34,
            speed: 190,
            streak: true,
          })
          fx.shockwaves.emit(playerX, playerY, {
            color: INK.paper,
            radius: 170,
            durationMs: 620,
            thickness: 5,
          })
        }
      }
    },

    get detonated(): ReadonlySet<number> {
      return detonated
    },
    get phase(): DeathPhase {
      return active ? deathPhaseAt(elapsed) : 'done'
    },
    get playerGone(): boolean {
      return playerGone
    },
    get done(): boolean {
      return !active || deathPhaseAt(elapsed) === 'done'
    },

    finish(): void {
      elapsed = DEATH_SEQUENCE_MS
      playerGone = true
      for (const d of doomed) {
        detonated.add(d.eid)
      }
    },
  }
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run src/render/fx/death-sequence.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Vérification complète et commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS. Le module n'est encore appelé par personne — c'est voulu, la tâche 8 le branche.

```bash
git add src/render/fx/death-sequence.ts src/render/fx/death-sequence.test.ts
git commit -m "feat(render): écrire la mise en scène de la mort"
```

---

### Task 8: Brancher la séquence de mort

La séquence existe mais personne ne l'appelle. Il faut : blanchir les ennemis pendant l'arrêt, cesser de dessiner ceux qui ont détoné, retirer le joueur et la page à la dispersion, et rendre le tout interruptible au clavier.

**Files:**
- Modify: `src/render/ink.ts`
- Create: `src/render/ink.test.ts`
- Modify: `src/render/views/enemy.ts`
- Modify: `src/render/stage.ts`
- Modify: `src/app/game.ts`
- Modify: `src/app/juice.ts`

**Interfaces:**
- Consumes: `createDeathSequence`, `DEATH_SEQUENCE_MS` (tâche 7) ; `Page.update` (tâche 4).
- Produces: `mixColor(from: number, to: number, t: number): number` dans `ink.ts` ; `EnemyView.update` gagne `whiten: number` ; `Stage` gagne `setDeathState(state: DeathState | null): void` avec `interface DeathState { detonated: ReadonlySet<number>; whiten: number; playerGone: boolean }`. `DYING_STATE_MS` disparaît de `juice.ts`.

- [ ] **Step 1: Écrire le test de `mixColor`**

Créer `src/render/ink.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { INK, mixColor } from './ink'

describe('mixColor', () => {
  it('rend la première couleur à 0', () => {
    expect(mixColor(INK.danger, INK.paper, 0)).toBe(INK.danger)
  })

  it('rend la seconde à 1', () => {
    expect(mixColor(INK.danger, INK.paper, 1)).toBe(INK.paper)
  })

  it('mélange composante par composante', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x7f7f7f)
  })

  it('borne les facteurs hors de [0, 1]', () => {
    expect(mixColor(INK.danger, INK.paper, -3)).toBe(INK.danger)
    expect(mixColor(INK.danger, INK.paper, 12)).toBe(INK.paper)
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/render/ink.test.ts`
Expected: FAIL — `mixColor is not a function`.

- [ ] **Step 3: Ajouter `mixColor` à `src/render/ink.ts`**

```ts
/**
 * Mélange deux couleurs de la palette, composante par composante. Sert au
 * blanchiment des ennemis pendant le temps d'arrêt de la mort : le monde est
 * suspendu, donc plus hostile (spec §3.2).
 */
export function mixColor(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, t))
  const mix = (shift: number): number => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * k) << shift
  }
  return mix(16) | mix(8) | mix(0)
}
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Run: `npx vitest run src/render/ink.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Blanchir les ennemis**

Dans `src/render/views/enemy.ts` :

1. Ajouter `whiten: number` aux options de `update` (0 = couleur normale, 1 = papier).
2. L'inclure dans `lastKey` — sinon le cache court-circuite l'animation :
   `const key = \`${radius.toFixed(1)}|${materializeProgress.toFixed(2)}|${frozen}|${whiten.toFixed(2)}\``
3. Remplacer le calcul de couleur :

```ts
      // Blanchiment pendant le temps d'arrêt de la séquence de mort : le monde
      // est suspendu, les ennemis cessent d'être rouges donc menaçants.
      const color = mixColor(frozen ? INK.frost : INK.danger, INK.paper, whiten)
```

4. Importer `mixColor` depuis `../ink`.

- [ ] **Step 6: Câbler l'état de mort dans `stage.ts`**

1. Ajouter au type `Stage` :

```ts
  /**
   * Pilote la séquence de mort côté rendu : quels ennemis ont détoné, à quel
   * point le monde est blanchi, et si le joueur s'est dispersé. `null` en
   * dehors de l'état `dying`.
   */
  setDeathState(state: DeathState | null): void
```

et exporter le type :

```ts
export interface DeathState {
  detonated: ReadonlySet<number>
  /** 0 = couleurs normales, 1 = tout est papier. */
  whiten: number
  playerGone: boolean
}
```

2. Ajouter `let deathState: DeathState | null = null` près de `effectsEnabled`, et l'implémentation `setDeathState(state) { deathState = state }` dans l'objet retourné.

3. Dans la boucle des ennemis de `sync`, sauter ceux qui ont détoné et transmettre le blanchiment :

```ts
      const liveEnemies = new Set<number>()
      for (const eid of enemyQuery(world)) {
        if (deathState?.detonated.has(eid)) {
          // Détoné : sa vue est retirée par `reap`, faute d'être marquée vivante.
          continue
        }
        liveEnemies.add(eid)
        ...
        view.update({
          ...
          whiten: deathState?.whiten ?? 0,
        })
      }
```

4. Retirer le joueur et la page à la dispersion :

```ts
      const playerGone = deathState?.playerGone ?? false
      playerView.container.visible = world.playerEid >= 0 && !playerGone
      page.update(
        world.playerEid >= 0 && !playerGone
          ? { x: /* position interpolée, cf. tâche 4 */, y: /* idem */ }
          : null,
      )
```

Réutiliser l'expression de position interpolée déjà en place depuis la tâche 4 ; l'extraire dans une variable locale plutôt que de la dupliquer.

- [ ] **Step 7: Piloter la séquence depuis `game.ts`**

1. Imports :

```ts
import { createDeathSequence, DEATH_FREEZE_MS, DEATH_SEQUENCE_MS } from '@/render/fx/death-sequence'
```

et retirer `DYING_STATE_MS` de l'import de `./juice`.

2. Remplacer `let deathTimer = 0` par `const deathSequence = createDeathSequence()`.

3. Dans `handleSimEvents`, cas `playerDied` :

```ts
      } else if (event.type === 'playerDied') {
        machine.send('DIED')
        deathSequence.start(run.world, event.x, event.y, ARENA.width, ARENA.height)
      }
```

(`ARENA` est déjà importé par `game.ts` pour `computeViewport`.)

4. Dans la boucle `frame`, remplacer le bloc `dying` :

```ts
    if (machine.state === 'dying') {
      deathSequence.update(dt, {
        particles: stage.particles,
        flash: stage.flash,
        shockwaves: stage.shockwaves,
        motionEnabled: !reducedMotion,
      })
      // Le blanchiment ne dure que le temps d'arrêt, puis retombe : les
      // ennemis qui restent à détoner redeviennent rouges à mesure que l'onde
      // les atteint.
      stage.setDeathState({
        detonated: deathSequence.detonated,
        whiten: deathSequence.phase === 'freeze' ? 1 : 0,
        playerGone: deathSequence.playerGone,
      })
      if (deathSequence.done) {
        stage.setDeathState(null)
        machine.send('DEATH_ANIM_DONE')
        onEnterGameOver()
      }
    }
```

5. Sauter la séquence au clavier. Dans le gestionnaire `keydown`, **avant** les branches d'écran :

```ts
    // La séquence de mort est interruptible : sur un jeu où l'on relance vingt
    // fois de suite, une animation qu'on ne peut pas couper devient une
    // punition dès la troisième mort (spec §3.3).
    if (machine.state === 'dying') {
      deathSequence.finish()
      return
    }
```

6. Dans `startRun`, ajouter `stage.setDeathState(null)` — une relance depuis l'écran de fin ne doit pas hériter des ennemis marqués détonés.

- [ ] **Step 8: Retirer `DYING_STATE_MS`**

Supprimer la constante de `src/app/juice.ts` : la durée de l'état `dying` est désormais celle de la séquence, portée par `DEATH_SEQUENCE_MS`. `npm run typecheck` signale tout appelant oublié.

- [ ] **Step 9: Vérifier à l'œil**

Run: `npm run dev`, se faire tuer.
Expected : tout se fige et blanchit ~1/3 de seconde, les ennemis détonent du plus proche au plus lointain, le joueur se disperse en dernier, la page disparaît avec lui, l'écran de fin arrive. Appuyer sur une touche pendant la séquence : l'écran de fin arrive immédiatement. Relancer : la partie démarre à vitesse pleine (tâche 1) et aucun ennemi n'est invisible.

- [ ] **Step 10: Vérification complète et commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/render/ink.ts src/render/ink.test.ts src/render/views/enemy.ts src/render/stage.ts src/app/game.ts src/app/juice.ts
git commit -m "feat(app): mettre la mort en scène au lieu de l'attendre"
```

---

## Couverture de la spec

| Section de la spec | Tâche |
| --- | --- |
| §2 La page révélée | 4 |
| §3.1–3.2 Phases et onde de détonation | 7 |
| §3.3 Saut au clavier | 8 |
| §3.4 Module `death-sequence.ts`, masquage des ennemis, blanchiment | 7, 8 |
| §3.5 Fuite du ralenti, `DEATH_SEQUENCE_MS` | 1, 8 |
| §4.1 Bombe · §4.2 Givre · §4.3 Buvard · §4.4 Ruée | 6 |
| §4.5 Halo (pas de burst + installation) | 5, 6 |
| §5 `spawnRadius` / `converge` / `stallAfterMs` | 2 |
| §5 `fromRadius` / `needles` / `delayMs` | 3 |
| §5 Installation du halo dans `player.ts` | 5 |
| §6 Mouvement réduit — page | 4 |
| §6 Mouvement réduit — mort et signatures | 6, 7, 8 |
| §7 Tests des fonctions pures | 2, 3, 4, 5, 7, 8 |
| §7 Non-régression du ralenti | 1 |
| §7 Routage des signatures | 6 |
