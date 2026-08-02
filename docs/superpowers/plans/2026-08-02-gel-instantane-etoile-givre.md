# Gel instantané et étoile de givre — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le Gel fige d'un coup les ennemis à portée au lieu de poser une zone qui vit 5 s, et se dessine en étoile de grands pics irréguliers au lieu d'un disque.

**Architecture:** Le power-up cesse de créer une entité `Hazard` : `activatePowerUp` balaie une fois les ennemis et pose `Frozen` sur ceux à portée. L'identifiant `HAZARD_FREEZE` et sa branche dans `hazardSystem` disparaissent. Côté rendu, un nouveau module `src/render/fx/frost-star.ts` — calqué sur `shockwave.ts` — dessine l'étoile ; le rayon réel lui parvient par un champ `radius` ajouté à l'événement `powerupUsed`.

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess`), bitECS, Pixi.js 8, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-02-gel-instantane-etoile-givre-design.md`

## Global Constraints

- `Math.random()` est **interdit dans `src/sim/`** (déterminisme de la simulation) et **autorisé dans `src/render/`** (`camera.ts` le documente, `particles.ts` s'en sert).
- L'assertion non-nulle `!` est **interdite dans `src/render/`**, autorisée dans `src/sim/`.
- `stats.freezeRadius` = 130, `stats.freezeDurationMs` = 3500 — **inchangés**. Aucune compensation d'équilibrage n'est au programme.
- Aucun nombre de portée n'est recopié en dur dans un test : il se dérive de `createRunStats()` ou d'une constante exportée.
- Commandes : `npm test` (vitest run), `npm run typecheck` (tsc --noEmit), `npm run lint` (biome check src).
- Commits en français, format conventionnel (commitlint `config-conventional`).
- **Le worktree est partagé avec d'autres sessions.** Ne jamais faire `git add -A` : chaque commit liste ses fichiers explicitement.

---

### Task 1: Le module `frost-star.ts`

Module autonome, sans consommateur pour l'instant. Rien d'autre ne bouge dans cette tâche.

**Files:**
- Create: `src/render/fx/frost-star.ts`
- Test: `src/render/fx/frost-star.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `createFrostStars(container: Container): FrostStars`
  - `interface FrostStars { emit(x: number, y: number, opts: FrostStarOptions): void; update(dtMs: number): void; destroy(): void }`
  - `interface FrostStarOptions { color: number; radius: number }`
  - `spikeAngle(index: number, count: number, jitter01: number): number`
  - `spikeLength(index: number, radius: number, rand01: number): number`
  - `starTaper(progress: number): number`
  - constantes `SPIKE_COUNT`, `SPIKE_MIN_RATIO`, `SPIKE_HALF_WIDTH_RATIO`, `ANGLE_JITTER`, `STAR_DURATION_MS`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/render/fx/frost-star.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import {
  ANGLE_JITTER,
  SPIKE_COUNT,
  SPIKE_MIN_RATIO,
  spikeAngle,
  spikeLength,
  starTaper,
} from './frost-star'

describe('spikeAngle', () => {
  it('centre chaque pic sur sa tranche quand le tirage est neutre', () => {
    const tranche = (Math.PI * 2) / SPIKE_COUNT
    expect(spikeAngle(0, SPIKE_COUNT, 0.5)).toBeCloseTo(0)
    expect(spikeAngle(3, SPIKE_COUNT, 0.5)).toBeCloseTo(3 * tranche)
  })

  it('ne laisse jamais deux voisins se croiser, même au pire tirage', () => {
    // Le pire cas : un pic poussé au maximum vers son voisin, et le voisin
    // poussé au maximum vers lui. C'est exactement ce que borne ANGLE_JITTER.
    for (let i = 0; i < SPIKE_COUNT - 1; i++) {
      expect(spikeAngle(i + 1, SPIKE_COUNT, 0)).toBeGreaterThan(spikeAngle(i, SPIKE_COUNT, 1))
    }
  })

  it('garde un écart minimal égal à la fraction non jittérée de la tranche', () => {
    const tranche = (Math.PI * 2) / SPIKE_COUNT
    const ecart = spikeAngle(1, SPIKE_COUNT, 0) - spikeAngle(0, SPIKE_COUNT, 1)
    expect(ecart).toBeCloseTo(tranche * (1 - ANGLE_JITTER))
  })
})

describe('spikeLength', () => {
  it('force le premier pic au rayon exact, quel que soit le tirage', () => {
    // Sans ce pic garanti, un tirage malchanceux dessinerait une étoile
    // entièrement plus courte que la portée réelle, et le joueur apprendrait
    // une portée fausse.
    expect(spikeLength(0, 130, 0)).toBe(130)
    expect(spikeLength(0, 130, 1)).toBe(130)
  })

  it('tient les autres pics entre le plancher et le rayon', () => {
    expect(spikeLength(1, 130, 0)).toBeCloseTo(130 * SPIKE_MIN_RATIO)
    expect(spikeLength(1, 130, 1)).toBeCloseTo(130)
    expect(spikeLength(7, 130, 0.5)).toBeGreaterThan(130 * SPIKE_MIN_RATIO)
    expect(spikeLength(7, 130, 0.5)).toBeLessThan(130)
  })
})

describe('starTaper', () => {
  it('part de 1, finit à 0, et décroît', () => {
    expect(starTaper(0)).toBe(1)
    expect(starTaper(1)).toBe(0)
    expect(starTaper(0.25)).toBeGreaterThan(starTaper(0.75))
  })

  it('borne les dépassements des deux côtés', () => {
    // `update` dérive `progress` d'un temps restant qui peut sortir de [0, 1]
    // sur une image longue.
    expect(starTaper(-0.5)).toBe(1)
    expect(starTaper(1.5)).toBe(0)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/render/fx/frost-star.test.ts`
Expected: FAIL — « Failed to resolve import "./frost-star" ».

- [ ] **Step 3: Écrire le module**

Créer `src/render/fx/frost-star.ts` :

```ts
import { type Container, Graphics } from 'pixi.js'

interface Spike {
  angle: number
  length: number
}

interface Star {
  gfx: Graphics
  color: number
  spikes: Spike[]
  halfWidth: number
  life: number
  maxLife: number
}

export interface FrostStarOptions {
  color: number
  /** Portée réelle du gel : le pic garanti (indice 0) l'atteint exactement. */
  radius: number
}

export interface FrostStars {
  emit(x: number, y: number, opts: FrostStarOptions): void
  update(dtMs: number): void
  destroy(): void
}

/** Impair : aucune symétrie accidentelle d'un pic à son opposé. */
export const SPIKE_COUNT = 13
/** Longueur plancher, en fraction du rayon : l'écart de longueur doit se voir. */
export const SPIKE_MIN_RATIO = 0.45
/** Demi-largeur de la base d'un pic, en fraction du rayon (≈ 7 px à 130, donc 14 px de base : un pic, pas un cheveu). */
export const SPIKE_HALF_WIDTH_RATIO = 0.055
/**
 * Fraction de la demi-tranche dont un angle peut s'écarter. Des angles
 * uniformément aléatoires produiraient des paquets et de grands arcs vides —
 * ça se lit comme un bug, pas comme du givre. Borné à 0,75, l'écart entre
 * deux voisins ne descend jamais sous 25 % de la tranche nominale, donc aucun
 * pic n'en croise un autre (`frost-star.test.ts` le tient).
 */
export const ANGLE_JITTER = 0.75
export const STAR_DURATION_MS = 450
/** Opacité de départ du remplissage. */
const FILL_ALPHA = 0.85
/** Borne dure, plus basse que les 24 anneaux de `shockwave.ts` : une étoile coûte 13 triangles. */
const STAR_LIMIT = 8

/** Angle du pic `index` : répartition régulière plus un écart borné ; `jitter01` dans [0, 1]. */
export function spikeAngle(index: number, count: number, jitter01: number): number {
  const tranche = (Math.PI * 2) / count
  return index * tranche + (jitter01 * 2 - 1) * (tranche / 2) * ANGLE_JITTER
}

/**
 * Longueur du pic `index`. L'indice 0 vaut `radius` exactement quel que soit
 * le tirage : sans ce pic garanti, une étoile pourrait être entièrement plus
 * courte que la portée réelle. Même exigence que le disque de vérité tracé
 * partout ailleurs — le dessin ne promet jamais moins ni plus que ce qui agit.
 */
export function spikeLength(index: number, radius: number, rand01: number): number {
  if (index === 0) {
    return radius
  }
  return radius * (SPIKE_MIN_RATIO + rand01 * (1 - SPIKE_MIN_RATIO))
}

/** Fondu et affinement, de 1 à 0. Borné : `progress` peut sortir de [0, 1] sur une image longue. */
export function starTaper(progress: number): number {
  return Math.min(1, Math.max(0, 1 - progress))
}

/**
 * Étoiles de givre du Gel. Même couche que les anneaux d'onde de choc.
 *
 * `Math.random()` est autorisé ici (`src/render/`), mais il ne sert qu'à
 * l'émission : les fonctions de géométrie reçoivent leur tirage en paramètre
 * et restent pures, donc testables — même parti que `death-sequence.ts`.
 */
export function createFrostStars(container: Container): FrostStars {
  const stars: Star[] = []

  return {
    emit(x, y, opts): void {
      if (stars.length >= STAR_LIMIT) {
        // FIFO simple : contrairement aux anneaux, une étoile n'a pas de délai
        // d'entrée, donc aucune ne risque d'être évincée avant d'avoir été vue.
        const [evicted] = stars.splice(0, 1)
        evicted?.gfx.destroy()
      }
      const gfx = new Graphics()
      gfx.x = x
      gfx.y = y
      container.addChild(gfx)

      // Tirée une seule fois : la géométrie ne bouge plus de toute la vie de
      // l'étoile. Un pic qui pousserait vers l'extérieur décrirait une onde qui
      // met du temps à arriver — le mensonge même qu'on retire au Gel.
      const spikes: Spike[] = []
      for (let i = 0; i < SPIKE_COUNT; i++) {
        spikes.push({
          angle: spikeAngle(i, SPIKE_COUNT, Math.random()),
          length: spikeLength(i, opts.radius, Math.random()),
        })
      }

      stars.push({
        gfx,
        color: opts.color,
        spikes,
        halfWidth: opts.radius * SPIKE_HALF_WIDTH_RATIO,
        life: STAR_DURATION_MS,
        maxLife: STAR_DURATION_MS,
      })
    },

    update(dtMs): void {
      for (let i = stars.length - 1; i >= 0; i--) {
        const star = stars[i]
        if (!star) {
          continue
        }
        star.life -= dtMs
        if (star.life <= 0) {
          star.gfx.destroy()
          stars.splice(i, 1)
          continue
        }
        const taper = starTaper(1 - star.life / star.maxLife)
        // La base s'affine, la longueur ne bouge pas : la portée reste lisible
        // jusqu'au bout, sans que l'étoile finisse en tache nette plaquée sur
        // l'image (le piège documenté dans `shockwave.ts`).
        const half = star.halfWidth * taper

        star.gfx.clear()
        for (const spike of star.spikes) {
          const cos = Math.cos(spike.angle)
          const sin = Math.sin(spike.angle)
          // Triangle isocèle : pointe sur l'axe du pic, deux coins de base
          // posés sur le point d'explosion lui-même, écartés perpendiculairement.
          star.gfx
            .moveTo(cos * spike.length, sin * spike.length)
            .lineTo(-sin * half, cos * half)
            .lineTo(sin * half, -cos * half)
            .closePath()
        }
        // Un seul `fill` pour les 13 triangles : ils se recouvrent tous au
        // centre, et treize remplissages successifs y empileraient l'opacité
        // en une tache opaque au lieu d'un noyau dense.
        star.gfx.fill({ color: star.color, alpha: FILL_ALPHA * taper })
      }
    },

    destroy(): void {
      for (const star of stars) {
        star.gfx.destroy()
      }
      stars.length = 0
    },
  }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/render/fx/frost-star.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Vérifier types et lint**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/render/fx/frost-star.ts src/render/fx/frost-star.test.ts
git commit -m "feat(render): dessiner une étoile de givre à pics irréguliers"
```

---

### Task 2: `powerupUsed` publie la portée de l'effet

La couche FX n'a aujourd'hui aucun moyen de connaître le rayon réel d'un power-up. Sans ce champ, l'étoile de la tâche 5 ignorerait « Gel élargi ».

**Files:**
- Modify: `src/sim/world.ts:24`
- Modify: `src/sim/powerups/activate.ts:206`
- Test: `src/sim/powerups/activate.test.ts`
- Modify (mise à conformité du type) : `src/app/juice.test.ts:210,264,286,357`, `src/audio/apply.test.ts:26`

**Interfaces:**
- Consumes: rien.
- Produces: `SimEvent` variante `{ type: 'powerupUsed'; kind: number; x: number; y: number; radius: number | null }`. Valeurs : Gel → `stats.freezeRadius`, Buvard → `stats.blotterRadius`, tous les autres → `null`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/sim/powerups/activate.test.ts`, ajouter `POWERUP_ID` à l'import existant depuis `'../data/powerups'`, puis ajouter ce bloc à la fin du fichier :

```ts
/** Portée publiée par le `powerupUsed` du pas, ou `undefined` si aucun n'a été émis. */
function porteePubliee(w: SimWorld): number | null | undefined {
  for (const event of w.events) {
    if (event.type === 'powerupUsed') {
      return event.radius
    }
  }
  return undefined
}

describe("powerupUsed publie la portée de l'effet", () => {
  it('le Gel publie son rayon de stats, « Gel élargi » compris', () => {
    // La valeur des stats, pas la constante de base : sinon la couche FX
    // dessinerait toujours la même taille quelles que soient les cartes.
    const w = setup()
    const stats = createRunStats()
    stats.freezeRadius = 175
    activatePowerUp(w, 'freeze', stats, 400, 300)
    expect(porteePubliee(w)).toBe(175)
  })

  it('le Buvard publie son rayon de stats', () => {
    const w = setup()
    const stats = createRunStats()
    activatePowerUp(w, 'blotter', stats, 400, 300)
    expect(porteePubliee(w)).toBe(stats.blotterRadius)
  })

  it('la Bombe publie null, bien qu’elle ait un rayon', () => {
    // Le sien part de 12 px et grandit jusqu'à `stats.blastRadius` : aucun
    // nombre unique ne la décrit à l'activation, et publier son maximum lui
    // donnerait une portée qu'elle n'a pas encore.
    const w = setup()
    activatePowerUp(w, 'blast', createRunStats(), 400, 300)
    expect(porteePubliee(w)).toBeNull()
  })

  it('les power-ups sans portée ponctuelle publient null', () => {
    for (const kind of ['bramble', 'dash', 'halo', 'volley', 'splatter'] as const) {
      const w = setup()
      activatePowerUp(w, kind, createRunStats(), 400, 300)
      expect(porteePubliee(w), `« ${kind} » devrait publier null`).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/sim/powerups/activate.test.ts`
Expected: FAIL — `porteePubliee` rend `undefined` (le champ `radius` n'existe pas encore). `npm run typecheck` signale aussi `Property 'radius' does not exist`.

- [ ] **Step 3: Ajouter le champ à l'événement**

Dans `src/sim/world.ts`, remplacer la ligne 24 :

```ts
  | { type: 'powerupUsed'; kind: number; x: number; y: number }
```

par :

```ts
  /**
   * `radius` : la portée de l'effet à l'instant de l'activation, quand il en a
   * *une*. `null` sinon — jamais 0, par la même règle que le champ `angle` de
   * `HazardView` : un zéro par défaut affirmerait une portée nulle avec
   * l'aplomb d'une information vraie. La couche FX en a besoin pour dessiner à
   * la vraie taille et ne doit pas la recalculer, sous peine de diverger de
   * celle qui a réellement agi.
   */
  | { type: 'powerupUsed'; kind: number; x: number; y: number; radius: number | null }
```

- [ ] **Step 4: Publier la valeur depuis `activatePowerUp`**

Dans `src/sim/powerups/activate.ts`, ajouter cette fonction juste au-dessus de `export function activatePowerUp` :

```ts
/**
 * Portée publiée avec `powerupUsed`. La Bombe rend `null` **bien qu'elle ait un
 * rayon** : le sien part de 12 px et grandit jusqu'à `stats.blastRadius`, donc
 * aucun nombre unique ne la décrit à l'activation. La Volée et la Bavure sont
 * des jets, la Ronce et le Halo s'attachent au joueur, la Ruée est un geste
 * orienté : aucun n'a de portée ponctuelle.
 */
function usedRadius(kind: PowerUpKind, stats: RunStats): number | null {
  switch (kind) {
    case 'freeze':
      return stats.freezeRadius
    case 'blotter':
      return stats.blotterRadius
    default:
      return null
  }
}
```

Puis remplacer la ligne 206 :

```ts
  world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x, y })
```

par :

```ts
  world.events.push({
    type: 'powerupUsed',
    kind: POWERUP_ID[kind],
    x,
    y,
    radius: usedRadius(kind, stats),
  })
```

- [ ] **Step 5: Mettre les autres tests à conformité du type**

Dans `src/audio/apply.test.ts` ligne 26, ajouter `radius: null` à l'objet poussé :

```ts
      world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x: 10, y: 10, radius: null })
```

Dans `src/app/juice.test.ts`, faire prendre la portée en paramètre au helper `declenche` (ligne ~208) :

```ts
  /** Rejoue un `powerupUsed` du kind donné et rend les appels observés. */
  function declenche(kind: PowerUpKind, radius: number | null = null): ReturnType<typeof fakeFx> {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x: 100, y: 100, radius })
    const fx = fakeFx(true)
    applyJuice(world, createJuiceState(), fx)
    return fx
  }
```

Puis ajouter `radius: null` aux trois autres `push` de `powerupUsed` du même fichier (lignes ~264, ~286, ~357).

- [ ] **Step 6: Lancer toute la suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS partout.

- [ ] **Step 7: Commit**

```bash
git add src/sim/world.ts src/sim/powerups/activate.ts src/sim/powerups/activate.test.ts src/app/juice.test.ts src/audio/apply.test.ts
git commit -m "feat(sim): publier la portée d'un power-up dans powerupUsed"
```

---

### Task 3: Le Gel devient instantané

Le cœur du changement. Après cette tâche, plus aucune entité `Hazard` n'est créée par le Gel — la branche de `hazardSystem` devient morte, et la tâche 4 la retire.

**Files:**
- Modify: `src/sim/powerups/activate.ts` (case `'freeze'`, imports, nouvelle fonction)
- Test: `src/sim/powerups/activate.test.ts`
- Modify: `src/sim/systems/hazards.test.ts` (retrait du test de la zone)

**Interfaces:**
- Consumes: `usedRadius` (tâche 2), inchangé.
- Produces: `activatePowerUp(world, 'freeze', stats, x, y)` pose `Frozen` (`remaining = stats.freezeDurationMs`) + `FreshlyFrozen` + vélocité nulle sur chaque `Enemy` non-`Materializing` à distance `≤ stats.freezeRadius + Collider.radius[eid]`, et ne crée aucune entité.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/sim/powerups/activate.test.ts` :

**1a.** Ajouter `Collider`, `FreshlyFrozen` et `Frozen` à l'import depuis `'../components'` (`Position` et `Velocity` y sont déjà).

**1b.** Remplacer l'entrée `freeze` de `EMPREINTES` :

```ts
  freeze: (w) => {
    const list = hazards(w)
    expect(list).toHaveLength(1)
    expect(Hazard.kind[list[0]!]).toBe(HAZARD_FREEZE)
  },
```

par :

```ts
  freeze: (w, temoin) => {
    // Plus aucune zone : le gel est instantané. L'empreinte discriminante est
    // le composant, pas un décompte d'entités — aucun autre genre ne pose
    // `Frozen`, alors que la Ruée et le Halo posent aussi zéro `Hazard`.
    expect(hazards(w)).toHaveLength(0)
    expect(hasComponent(w, Frozen, temoin)).toBe(true)
  },
```

**1c.** Changer le type de `EMPREINTES` pour lui passer le témoin :

```ts
const EMPREINTES: Record<PowerUpKind, (w: SimWorld, temoin: number) => void> = {
```

**1d.** Remplacer le corps du `it` de la boucle `describe('activatePowerUp — chaque genre pose son propre effet')` :

```ts
    it(`« ${kind} » pose son effet à lui, et pas celui d’un autre genre`, () => {
      const w = setup()
      // Le témoin doit exister *avant* l'activation : le gel est instantané et
      // ne rattrapera pas un ennemi né après. Les autres empreintes l'ignorent
      // — un ennemi n'est pas une entité `Hazard`, il ne fausse aucun décompte.
      const temoin = spawnEnemy(w, { type: 'point', x: 420, y: 300, materializeMs: 0 })
      activatePowerUp(w, kind, createRunStats(), 400, 300)
      EMPREINTES[kind](w, temoin)
    })
```

**1e.** Supprimer le test devenu faux :

```ts
  it('freeze crée une zone de gel qui ne grandit pas', () => {
    const w = setup()
    activatePowerUp(w, 'freeze', createRunStats(), 400, 300)
    const h = hazards(w)[0]!
    expect(Hazard.kind[h]).toBe(HAZARD_FREEZE)
    expect(Hazard.growthRate[h]).toBe(0)
  })
```

**1f.** Retirer `HAZARD_FREEZE` de l'import depuis `'../data/powerups'` (plus aucun usage dans le fichier).

**1g.** Ajouter ce bloc :

```ts
describe('le Gel est instantané', () => {
  it('ne crée aucune entité : la zone a bien disparu', () => {
    const w = setup()
    activatePowerUp(w, 'freeze', createRunStats(), 400, 300)
    expect(hazards(w)).toHaveLength(0)
  })

  it('gèle un ennemi à portée pour la durée des stats, et l’arrête net', () => {
    const w = setup()
    const stats = createRunStats()
    const proche = spawnEnemy(w, {
      type: 'point',
      x: 400 + stats.freezeRadius / 2,
      y: 300,
      materializeMs: 0,
    })
    Velocity.x[proche] = 120
    Velocity.y[proche] = -80

    activatePowerUp(w, 'freeze', stats, 400, 300)

    expect(hasComponent(w, Frozen, proche)).toBe(true)
    expect(Frozen.remaining[proche]).toBe(stats.freezeDurationMs)
    expect(hasComponent(w, FreshlyFrozen, proche)).toBe(true)
    expect(Velocity.x[proche]).toBe(0)
    expect(Velocity.y[proche]).toBe(0)
  })

  it('compte le rayon de l’ennemi dans la portée : un contact de bords gèle', () => {
    // Même règle que partout ailleurs (`hazardSystem`) : la portée additionne
    // le rayon de la cible, sinon un gros ennemi survivrait à un gel qui le
    // touche visiblement.
    const w = setup()
    const stats = createRunStats()
    const auBord = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    Position.x[auBord] = 400 + stats.freezeRadius + Collider.radius[auBord]! - 1

    activatePowerUp(w, 'freeze', stats, 400, 300)

    expect(hasComponent(w, Frozen, auBord)).toBe(true)
  })

  it('laisse intact un ennemi hors de portée', () => {
    const w = setup()
    const stats = createRunStats()
    const loin = spawnEnemy(w, {
      type: 'point',
      x: 400 + stats.freezeRadius * 2,
      y: 300,
      materializeMs: 0,
    })

    activatePowerUp(w, 'freeze', stats, 400, 300)

    expect(hasComponent(w, Frozen, loin)).toBe(false)
  })

  it('épargne un ennemi en matérialisation, même à portée', () => {
    // Le pointillé est inoffensif partout, et hors d'atteinte partout (spec §3.3).
    const w = setup()
    const pointille = spawnEnemy(w, { type: 'point', x: 410, y: 300, materializeMs: 500 })

    activatePowerUp(w, 'freeze', createRunStats(), 400, 300)

    expect(hasComponent(w, Frozen, pointille)).toBe(false)
  })

  it('un second Gel rafraîchit un ennemi encore pris par le premier', () => {
    // Le garde « déjà gelé » de `hazardSystem` n'avait de sens que pour une
    // zone qui réappliquait son effet à chaque image. Sur un coup unique, il
    // rendrait un second Gel sans effet sur ce qu'il vise.
    const w = setup()
    const stats = createRunStats()
    const eid = spawnEnemy(w, { type: 'point', x: 410, y: 300, materializeMs: 0 })

    activatePowerUp(w, 'freeze', stats, 400, 300)
    Frozen.remaining[eid] = 100
    activatePowerUp(w, 'freeze', stats, 400, 300)

    expect(Frozen.remaining[eid]).toBe(stats.freezeDurationMs)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/sim/powerups/activate.test.ts`
Expected: FAIL — « le Gel est instantané » échoue en bloc (une entité `Hazard` est créée, aucun `Frozen` posé), et l'empreinte `freeze` échoue aussi.

**Seules ces deux familles doivent échouer.** Le témoin ajouté à l'étape 1d est vu par les huit genres : si une autre empreinte tombe (typiquement un décompte d'entités de la Volée ou de la Bavure), c'est que son lanceur varie selon les ennemis présents — un vrai constat, à signaler avant de continuer, pas à contourner.

- [ ] **Step 3: Écrire l'implémentation**

Dans `src/sim/powerups/activate.ts` :

**3a.** Remplacer l'import bitECS :

```ts
import { addComponent, addEntity } from 'bitecs'
```

par :

```ts
import { addComponent, addEntity, defineQuery, Not } from 'bitecs'
```

**3b.** Ajouter `Collider`, `Enemy`, `FreshlyFrozen`, `Frozen`, `Materializing` et `Velocity` à l'import depuis `'../components'`, en gardant l'ordre alphabétique du bloc existant.

**3c.** Ajouter, juste après les imports :

```ts
// Même règle de ciblage que `hazardSystem` : un ennemi en matérialisation
// reste hors d'atteinte (spec §3.3, le pointillé est inoffensif partout).
const gelables = defineQuery([Enemy, Position, Collider, Not(Materializing)])
```

**3d.** Ajouter cette fonction sous `createHazard` :

```ts
/**
 * Gèle d'un coup les ennemis à portée. Le Gel n'est plus une zone : il ne pose
 * rien dans le monde, il agit une fois et c'est fini.
 *
 * Balayage linéaire, pas de hash spatial. Le hash de `hazardSystem` existe
 * parce qu'il tourne à chaque image sur toutes les zones ; ici le code
 * s'exécute une seule fois, au ramassage.
 *
 * Aucun garde « déjà gelé », contrairement à la zone : le sien n'existait que
 * parce qu'elle réappliquait son effet à chaque image, ce qui remettait le
 * minuteur à plein et faisait de `FreshlyFrozen` un état permanent. Sur un coup
 * unique, ce garde empêcherait seulement un second Gel de rafraîchir un ennemi
 * encore pris par le premier. Conséquence voulue : un second Gel repose
 * `FreshlyFrozen`, donc relance une vague de contagion sous « Givre rampant » —
 * une fois, pas en boucle.
 */
function freezeAround(world: SimWorld, stats: RunStats, x: number, y: number): void {
  for (const eid of gelables(world)) {
    const r = stats.freezeRadius + Collider.radius[eid]!
    const dx = Position.x[eid]! - x
    const dy = Position.y[eid]! - y
    if (dx * dx + dy * dy > r * r) {
      continue
    }
    addComponent(world, Frozen, eid)
    Frozen.remaining[eid] = stats.freezeDurationMs
    addComponent(world, FreshlyFrozen, eid)
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0
  }
}
```

**3e.** Remplacer le case `'freeze'` :

```ts
    case 'freeze':
      createHazard(world, HAZARD_FREEZE, x, y, {
        radius: stats.freezeRadius,
        maxRadius: stats.freezeRadius,
        growthRate: 0,
        lifeMs: POWERUP_BASE.freeze.zoneLifeMs,
      })
      break
```

par :

```ts
    case 'freeze':
      // Instantané : `pickupSystem` s'exécute plus tard dans le pas que
      // `hazardSystem`, mais aucun système entre les deux ne déplace d'ennemi,
      // et `homingSystem` comme `formationSystem` excluent `Frozen`
      // structurellement — le cycle de vie d'un ennemi gelé est inchangé.
      freezeAround(world, stats, x, y)
      break
```

**3f.** Retirer `HAZARD_FREEZE` de l'import depuis `'../data/powerups'`.

- [ ] **Step 4: Retirer le test de la zone dans `hazards.test.ts`**

Supprimer ce test de `src/sim/systems/hazards.test.ts` (~ligne 135) :

```ts
  it('la zone de gel fige sans tuer', () => {
    const w = setup()
    const eid = spawnEnemy(w, { type: 'point', x: 420, y: 300, materializeMs: 0 })
    makeHazard(w, HAZARD_FREEZE, 400, 300, {
      radius: 130,
      maxRadius: 130,
      growthRate: 0,
      lifeMs: 5000,
    })
    hazardSystem(w)
    expect(hasComponent(w, Frozen, eid)).toBe(true)
    expect(hasComponent(w, Doomed, eid)).toBe(false)
  })
```

Puis retirer `HAZARD_FREEZE` de l'import du fichier. Les tests voisins (« un ennemi gelé meurt quand le joueur le traverse », « le gel expire et rend l'ennemi mobile ») restent : ils posent `Frozen` à la main et testent `freezeSystem`, pas la zone.

- [ ] **Step 5: Lancer toute la suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS partout. Si `npm run lint` signale `POWERUP_BASE` inutilisé dans `activate.ts`, c'est un faux positif à vérifier — il sert encore aux cases `blast` et `bramble`.

- [ ] **Step 6: Commit**

```bash
git add src/sim/powerups/activate.ts src/sim/powerups/activate.test.ts src/sim/systems/hazards.test.ts
git commit -m "feat(sim): geler d'un coup au lieu de poser une zone qui dure"
```

---

### Task 4: Solder `HAZARD_FREEZE` et `zoneLifeMs`

Plus rien ne crée de zone de gel. Le code qui la traitait doit partir, sinon il reste une branche morte que le prochain lecteur croira vivante.

**Files:**
- Modify: `src/sim/data/powerups.ts` (`HAZARD_FREEZE`, `POWERUP_BASE.freeze.zoneLifeMs`)
- Modify: `src/sim/systems/hazards.ts` (import, `freezeDurationMs`, branche)
- Modify: `src/render/views/hazard.ts` (import, `COLORS`, branche)

**Interfaces:**
- Consumes: le Gel instantané de la tâche 3.
- Produces: `HAZARD_FREEZE` et `POWERUP_BASE.freeze.zoneLifeMs` n'existent plus. `POWERUP_BASE.freeze` garde `{ radius, durationMs }`.

- [ ] **Step 1: Retirer l'identifiant et la durée de zone**

Dans `src/sim/data/powerups.ts`, remplacer la ligne 107 :

```ts
export const HAZARD_FREEZE = 2
```

par :

```ts
// 2 : réservé, jamais réattribué. C'était la zone de gel, disparue quand le
// Gel est devenu instantané. Même règle que les trous 4 et 8 de
// `POWERUP_BY_ID` — ce sont des étiquettes opaques, et une future zone qui
// hériterait du 2 rendrait illisible toute trace antérieure.
```

Puis, ligne 123, remplacer :

```ts
  freeze: { radius: 130, durationMs: 3500, zoneLifeMs: 5000 },
```

par :

```ts
  freeze: { radius: 130, durationMs: 3500 },
```

- [ ] **Step 2: Retirer la branche de `hazardSystem`**

Dans `src/sim/systems/hazards.ts` :

Supprimer la ligne 68 :

```ts
  const freezeDurationMs = stats?.freezeDurationMs ?? POWERUP_BASE.freeze.durationMs
```

Supprimer la branche complète (~lignes 106-117). La chaîne passe de :

```ts
      if (LETHAL.has(kind)) {
        addComponent(world, Doomed, eid)
      } else if (kind === HAZARD_FREEZE) {
        // Applique seulement à l'entrée dans la zone : sinon le minuteur est
        // remis à `freezeDurationMs` chaque image tant que l'ennemi reste
        // dans le rayon, et `FreshlyFrozen` devient un état permanent.
        if (!hasComponent(world, Frozen, eid)) {
          addComponent(world, Frozen, eid)
          Frozen.remaining[eid] = freezeDurationMs
          addComponent(world, FreshlyFrozen, eid)
        }
        Velocity.x[eid] = 0
        Velocity.y[eid] = 0
      } else if (kind === HAZARD_BLOTTER) {
```

à :

```ts
      if (LETHAL.has(kind)) {
        addComponent(world, Doomed, eid)
      } else if (kind === HAZARD_BLOTTER) {
```

le reste de la branche `HAZARD_BLOTTER` étant inchangé.

Retirer ensuite des imports : `HAZARD_FREEZE` (depuis `'../data/powerups'`), `FreshlyFrozen` et `Frozen` (depuis `'../components'`) — ces deux composants ne servaient plus qu'ici. Vérifier après coup que `Velocity`, `POWERUP_BASE` et `hasComponent` sont encore utilisés ailleurs dans le fichier (le Buvard s'en sert) et les garder.

- [ ] **Step 3: Retirer le disque du rendu**

Dans `src/render/views/hazard.ts` :

Retirer `HAZARD_FREEZE` de l'import depuis `'@/sim/data/powerups'`, retirer l'entrée de `COLORS` :

```ts
  [HAZARD_FREEZE]: INK.frost,
```

et retirer la branche de `update` (~ligne 298). La chaîne passe de :

```ts
      if (kind === HAZARD_BLOTTER) {
        drawVortex(gfx, radius, color, lifeRatio, time)
      } else if (kind === HAZARD_FREEZE) {
        gfx.circle(0, 0, radius).fill({ color, alpha: 0.1 * lifeRatio })
        gfx.circle(0, 0, radius).stroke({ color, width: 1.6, alpha: 0.7 * lifeRatio })
      } else if (kind === HAZARD_TRAIL) {
        drawWake(gfx, radius, color, angle, lifeRatio)
      } else {
        gfx.circle(0, 0, radius).stroke({ color, width: 3, alpha: lifeRatio })
      }
```

à :

```ts
      if (kind === HAZARD_BLOTTER) {
        drawVortex(gfx, radius, color, lifeRatio, time)
      } else if (kind === HAZARD_TRAIL) {
        drawWake(gfx, radius, color, angle, lifeRatio)
      } else {
        gfx.circle(0, 0, radius).stroke({ color, width: 3, alpha: lifeRatio })
      }
```

Les sorties anticipées au-dessus (`HAZARD_BRAMBLE`, `HAZARD_QUILL`, `HAZARD_SPLATTER`) ne bougent pas.

`INK.frost` reste dans `ink.ts` : il colore les ennemis gelés et la nouvelle étoile.

- [ ] **Step 4: Vérifier qu'il ne reste aucune trace**

Run: `grep -rn "HAZARD_FREEZE\|zoneLifeMs" src/`
Expected: **aucun résultat.** Le commentaire « 2 : réservé » ne contient ni l'un ni l'autre de ces jetons — s'il ressort quelque chose, c'est une vraie trace oubliée.

- [ ] **Step 5: Lancer toute la suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS partout.

- [ ] **Step 6: Commit**

```bash
git add src/sim/data/powerups.ts src/sim/systems/hazards.ts src/render/views/hazard.ts
git commit -m "refactor: solder la zone de gel, son identifiant et sa durée"
```

---

### Task 5: Câbler l'étoile et corriger la documentation

Dernière tâche : le module de la tâche 1 rencontre la portée de la tâche 2, et le Gel change de signature à l'écran.

**Files:**
- Modify: `src/render/stage.ts` (import, interface `Stage`, création, `update`, retour, `destroy`)
- Modify: `src/app/juice.ts` (import, signatures `powerupSignature` et `applyJuice`, case `'freeze'`)
- Modify: `src/app/game.ts:336,437` (les deux passages de l'objet `fx`)
- Test: `src/app/juice.test.ts` (`fakeFx`, test du Givre)
- Modify: `docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md:52,292`

**Interfaces:**
- Consumes: `createFrostStars`, `FrostStars` (tâche 1) ; `event.radius` (tâche 2).
- Produces: `Stage.frostStars: FrostStars` ; l'objet `fx` d'`applyJuice` porte `frostStars: FrostStars`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/app/juice.test.ts` :

**1a.** Ajouter l'import `import type { FrostStars } from '@/render/fx/frost-star'` à côté de celui de `Shockwaves`.

**1b.** Ajouter `frostStars` à `fakeFx` (déclaration de type **et** corps) :

```ts
function fakeFx(motionEnabled: boolean): {
  camera: Camera
  particles: Particles
  flash: Flash
  shockwaves: Shockwaves
  frostStars: FrostStars
  punch: (strength: number) => void
  motionEnabled: boolean
} {
  const camera: Camera = { shake: vi.fn(), update: vi.fn(() => ({ x: 0, y: 0 })) }
  const particles: Particles = { emitBurst: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const flash: Flash = { flash: vi.fn(), resize: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const shockwaves: Shockwaves = { emit: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const frostStars: FrostStars = { emit: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  return { camera, particles, flash, shockwaves, frostStars, punch: vi.fn(), motionEnabled }
}
```

**1c.** Remplacer le test du Givre :

```ts
  it('le Givre hérisse son onde et fige ses éclats', () => {
    const fx = declenche('freeze')
    expect(vi.mocked(fx.shockwaves.emit).mock.calls[0]?.[2].needles).toBeGreaterThan(0)
    expect(vi.mocked(fx.particles.emitBurst).mock.calls[0]?.[2].stallAfterMs).toBeGreaterThan(0)
  })
```

par :

```ts
  it('le Givre plante une étoile à la portée réelle du gel, et fige ses éclats', () => {
    // 175 et non le rayon de base : c'est la portée publiée par l'événement qui
    // doit piloter le dessin, sinon « Gel élargi » resterait invisible.
    const fx = declenche('freeze', 175)
    expect(vi.mocked(fx.frostStars.emit).mock.calls[0]?.[2].radius).toBe(175)
    expect(vi.mocked(fx.particles.emitBurst).mock.calls[0]?.[2].stallAfterMs).toBeGreaterThan(0)
  })

  it("le Givre n'émet plus d'anneau : une seule forme de givre à l'écran", () => {
    // Garder l'onde à aiguilles superposerait deux givres concentriques, et
    // l'anneau raconterait une zone que le Gel ne pose plus.
    const fx = declenche('freeze', 130)
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/app/juice.test.ts`
Expected: FAIL — `fx.frostStars.emit` n'a jamais été appelé, et l'onde à aiguilles l'est encore.

- [ ] **Step 3: Exposer `frostStars` depuis `stage.ts`**

Dans `src/render/stage.ts`, cinq points :

Après l'import de `shockwave` (ligne 28) :

```ts
import { createFrostStars, type FrostStars } from './fx/frost-star'
```

Dans l'interface `Stage`, après `shockwaves` (ligne 71) :

```ts
  /** Étoiles de givre du Gel — pilotées depuis `src/app/juice.ts`. */
  readonly frostStars: FrostStars
```

Après la création des anneaux (ligne 155) :

```ts
  const frostStars = createFrostStars(particlesLayer)
```

Dans la boucle d'image, après `shockwaves.update(frameDtMs)` (ligne 367) :

```ts
      frostStars.update(frameDtMs)
```

Dans l'objet rendu, après `shockwaves,` (ligne 378) :

```ts
    frostStars,
```

Dans `destroy`, après `shockwaves.destroy()` (ligne 416) :

```ts
      frostStars.destroy()
```

- [ ] **Step 4: Changer la signature du Gel dans `juice.ts`**

Ajouter l'import :

```ts
import type { FrostStars } from '@/render/fx/frost-star'
```

Ajouter `frostStars: FrostStars` à l'objet `fx` de `powerupSignature` (à côté de `shockwaves`) **et** à celui d'`applyJuice`.

Ajouter un paramètre `radius` à `powerupSignature`, après `angle` :

```ts
function powerupSignature(
  kind: PowerUpKind,
  x: number,
  y: number,
  angle: number | null,
  /** Portée publiée par l'événement ; `null` pour les genres qui n'en ont pas. */
  radius: number | null,
  fx: {
```

Mettre à jour l'appel (ligne ~355) :

```ts
            powerupSignature(kind, event.x, event.y, playerFacing(world), event.radius, fx)
```

Remplacer le case `'freeze'` :

```ts
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
```

par :

```ts
    case 'freeze':
      // Une étoile plantée d'un coup, et des éclats qui prennent en glace en
      // plein vol. L'onde à aiguilles est partie : c'était un cercle hérissé,
      // et un cercle qui s'étend raconte une zone que le Gel ne pose plus.
      fx.flash.flash(INK.frost, 0.05)
      if (radius !== null) {
        // Jamais de repli sur une constante : la simulation publie toujours la
        // portée du Gel, et une étoile absente serait une panne visible plutôt
        // qu'une étoile de la mauvaise taille, silencieusement fausse.
        fx.frostStars.emit(x, y, { color: INK.frost, radius })
      }
      fx.particles.emitBurst(x, y, {
        color: INK.frost,
        count: 18,
        speed: 215,
        streak: true,
        stallAfterMs: 300,
      })
      break
```

- [ ] **Step 5: Passer `frostStars` depuis `game.ts`**

Aux deux endroits qui passent `shockwaves: stage.shockwaves,` (lignes 336 et 437), ajouter juste en dessous :

```ts
          frostStars: stage.frostStars,
```

en respectant l'indentation locale de chaque site.

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS partout.

- [ ] **Step 7: Corriger la documentation**

Dans `docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md`, ligne 52, remplacer :

```
| Gel | `#8fd8ff` | Zone de gel, ennemis gelés |
```

par :

```
| Gel | `#8fd8ff` | Étoile de givre, ennemis gelés |
```

Ligne 292, remplacer :

```
| **Gel** / *Freeze* | Contrôle, zone posée | Zone déposée à la position du joueur au déclenchement. Fige les ennemis qui s'y trouvent ou y entrent ; **un ennemi gelé meurt si le joueur le traverse** |
```

par :

```
| **Gel** / *Freeze* | Contrôle, instantané | Fige d'un coup les ennemis à portée de la position de déclenchement. Rien ne persiste après : ce qui n'était pas là n'est pas pris ; **un ennemi gelé meurt si le joueur le traverse** |
```

- [ ] **Step 8: Vérifier à l'écran**

Run: `npm run dev`
Ramasser un Gel dans une vague dense. Attendu : une étoile de pics de longueurs inégales apparaît d'un coup, le plus long atteignant le bord de la zone gelée ; elle s'affine et disparaît en moins d'une demi-seconde ; aucun disque, aucun anneau ne subsiste ; les ennemis pris restent figés, et les traverser les tue.

- [ ] **Step 9: Commit**

```bash
git add src/render/stage.ts src/app/juice.ts src/app/game.ts src/app/juice.test.ts docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md
git commit -m "feat(render): remplacer le disque du Gel par une étoile de givre"
```

---

## Note sur le worktree partagé

Ce dépôt est travaillé par plusieurs sessions simultanées sur le même worktree. Le commit `efe5311` (deux nouveaux power-ups) a atterri entre l'écriture du spec et celle de ce plan, et le plan a été relu contre l'état d'après. Deux conséquences à garder en tête :

- `PowerUpKind` compte huit genres (`blast`, `freeze`, `bramble`, `blotter`, `dash`, `halo`, `volley`, `splatter`). La tâche 2 les couvre tous.
- Chaque commit liste ses fichiers explicitement. **Jamais `git add -A`** : il emporterait le travail en cours d'une autre session.

Avant de commencer, relancer `npm test` sur `main` pour partir d'une base verte — si elle ne l'est pas, ce n'est pas ce plan qui l'a cassée.
