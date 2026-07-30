# Élagage, couronne de piques et Plume renforcée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirer deux power-ups qui ne portent pas leur place, transformer le Trait d'encre invisible en une couronne de piques qui tue ce qu'elle touche, et faire de la Plume une ruée large, longue et lisible.

**Architecture:** Tout ce qui tue vit dans `src/sim/` sous forme d'entités `Hazard` : les piques comme le sillage de la ruée sont de vraies zones, pas des décorations. Le rendu (`src/render/views/hazard.ts`) dessine ces entités telles qu'elles sont — ce qui est affiché est exactement ce qui tue.

**Tech Stack:** TypeScript strict, bitECS, Pixi.js 8 (`Graphics`), Vitest (environnement `node`, **sans DOM ni WebGL**), Biome.

**Spec :** `docs/superpowers/specs/2026-07-30-dash-piques-elagage-design.md`

## Global Constraints

- **`src/sim/` reste pur et déterministe** : Biome interdit d'y importer `pixi.js`, `render/`, `ui/`, `app/`, et d'y toucher `window`, `document`, `performance`, `localStorage`. **`Math.random()` y est interdit** — toute rotation ou variation vient de `world.time` ou de `world.rng`.
- **Pas de `!` (non-null assertion) hors de `src/sim/`** ; `noUncheckedIndexedAccess` et `strict` sont actifs partout. Dans `src/sim/`, `!` est autorisé et c'est le style en place.
- **Vitest tourne en environnement `node`** : aucun test ne peut toucher au DOM ni instancier Pixi. Les tests portent sur la simulation et sur les fonctions pures.
- **Toute clé i18n retirée ou ajoutée doit l'être dans `en.json` ET `fr.json`** — `src/i18n/parity.test.ts` échoue sinon.
- **Identifiants numériques : on laisse des trous, on ne renumérote pas.** `POWERUP_ID` perd 4 (`strike`) et 8 (`dryspell`), `HAZARD_STRIKE` (4) disparaît. `POWERUP_BY_ID` reçoit `null` à ces indices. Décaler les autres valeurs ferait bouger du code sans raison.
- **Commentaires et messages de commit en français.** Convention : `type(scope): sujet` (conventional commits, husky + commitlint).
- **Vérification avant chaque commit** : `npm run lint && npm run typecheck && npm test`.
- **Une autre session commite sur cette branche en parallèle.** Ne stage jamais `-A` : ajoute explicitement les fichiers que tu as touchés.

---

### Task 1: Supprimer le Séchage (`dryspell`)

**Files:**
- Modify: `src/sim/data/powerups.ts`, `src/sim/powerups/activate.ts`, `src/sim/upgrades/stats.ts`, `src/sim/world.ts`, `src/sim/systems/homing.ts`, `src/sim/systems/shard.ts`, `src/sim/data/upgrades.ts`, `src/render/views/pickup.ts`, `src/ui/icons.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`
- Test: `src/sim/powerups/activate.test.ts`, `src/sim/systems/shard.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `PowerUpKind` perd `'dryspell'` ; `RunStats` perd `dryspellDurationMs` ; `SimWorld` perd `slowUntil`.

- [ ] **Step 1: Retirer le power-up de la table de données**

Dans `src/sim/data/powerups.ts` : retirer `| 'dryspell'` de `PowerUpKind`, `'dryspell'` de `POWERUP_KINDS`, la ligne `dryspell: 8` de `POWERUP_ID`, l'entrée `dryspell: { durationMs: 4000, slowFactor: 0.35 }` de `POWERUP_BASE`. Dans `POWERUP_BY_ID`, remplacer `'dryspell'` (dernier élément, indice 8) par `null`.

Ajouter au-dessus de `POWERUP_ID` :

```ts
/**
 * Les identifiants ne sont jamais renumérotés quand un power-up disparaît : ce
 * sont des étiquettes opaques, rien ne les parcourt par plage, et les décaler
 * ferait bouger du code qui n'a aucune raison de bouger. `POWERUP_BY_ID` porte
 * donc `null` aux indices libérés (4 : Rature, 8 : Séchage), comme à l'indice 0
 * qui a toujours signifié « emplacement vide » côté bitECS.
 */
```

(La Rature part à la Task 2 ; ce commentaire mentionne déjà les deux, il ne sera pas retouché.)

- [ ] **Step 2: Retirer l'activation et le stat**

Dans `src/sim/powerups/activate.ts`, supprimer le bloc :

```ts
    case 'dryspell':
      world.slowUntil = world.time + stats.dryspellDurationMs
      break
```

Dans `src/sim/upgrades/stats.ts`, supprimer le champ `dryspellDurationMs: number` de l'interface et la ligne `dryspellDurationMs: POWERUP_BASE.dryspell.durationMs,` de `createRunStats`.

- [ ] **Step 3: Retirer `slowUntil` du monde et de ses deux lecteurs**

Dans `src/sim/world.ts`, supprimer le champ `slowUntil` de `SimWorld` (avec son commentaire) et la ligne `world.slowUntil = 0`.

Dans `src/sim/systems/homing.ts`, supprimer les deux lignes `slowed`/`slowFactor` et leur commentaire, puis remplacer :

```ts
    const maxSpeed = Movement.maxSpeed[eid]! * slowFactor
```

par :

```ts
    const maxSpeed = Movement.maxSpeed[eid]!
```

Retirer l'import devenu inutile de `POWERUP_BASE` si plus rien ne l'utilise dans ce fichier (Biome `noUnusedImports` est une erreur).

Dans `src/sim/systems/shard.ts`, remplacer le calcul de `dashSpeed` et son commentaire par :

```ts
        Velocity.x[eid] = (dx / d) * SHARD_DASH_SPEED
        Velocity.y[eid] = (dy / d) * SHARD_DASH_SPEED
```

et supprimer la variable `dashSpeed` ainsi que l'import de `POWERUP_BASE` s'il devient inutilisé.

- [ ] **Step 4: Retirer la carte, l'icône et le pictogramme**

Dans `src/sim/data/upgrades.ts`, supprimer l'objet dont l'`id` est `'dryspell-duration'`.

Dans `src/ui/icons.ts`, supprimer l'entrée `dryspell` de `POWERUP_ICONS`.

Dans `src/render/views/pickup.ts`, supprimer la fonction `drawDryspell` et l'entrée `dryspell: drawDryspell,` de `DRAWERS`.

Dans les deux locales, supprimer `upgrade.dryspell-duration.name` et `upgrade.dryspell-duration.desc`.

- [ ] **Step 5: Retirer les tests devenus caducs**

Dans `src/sim/powerups/activate.test.ts`, supprimer les cas `'dryspell repousse world.slowUntil dans le futur'` et `'dryspell ralentit les ennemis mais pas le joueur'`.

Dans `src/sim/systems/shard.test.ts`, le test qui pose `w.slowUntil` (vers la ligne 138) devient sans objet : supprimer ce cas et son commentaire d'explication.

- [ ] **Step 6: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS. Le typecheck est le filet qui prouve qu'aucune lecture de `slowUntil` ni de `dryspellDurationMs` n'a survécu.

```bash
git add src/sim/data/powerups.ts src/sim/powerups/activate.ts src/sim/powerups/activate.test.ts src/sim/upgrades/stats.ts src/sim/world.ts src/sim/systems/homing.ts src/sim/systems/shard.ts src/sim/systems/shard.test.ts src/sim/data/upgrades.ts src/render/views/pickup.ts src/ui/icons.ts src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(powerups): retirer le Séchage"
```

---

### Task 2: Supprimer la Rature (`strike`)

**Files:**
- Modify: `src/sim/data/powerups.ts`, `src/sim/powerups/activate.ts`, `src/sim/upgrades/stats.ts`, `src/sim/systems/hazards.ts`, `src/sim/data/upgrades.ts`, `src/render/views/hazard.ts`, `src/render/views/pickup.ts`, `src/ui/icons.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`
- Test: `src/sim/powerups/activate.test.ts`

**Interfaces:**
- Consumes: la table de données déjà allégée par la Task 1.
- Produces: `PowerUpKind` perd `'strike'` ; `RunStats` perd `strikeWidth` ; `HAZARD_STRIKE` n'existe plus.

- [ ] **Step 1: Retirer le power-up de la table de données**

Dans `src/sim/data/powerups.ts` : retirer `| 'strike'` de `PowerUpKind`, `'strike'` de `POWERUP_KINDS`, `strike: 4` de `POWERUP_ID`, `strike: { width: 26, lingerMs: 260 },` de `POWERUP_BASE`, et la ligne `export const HAZARD_STRIKE = 4`. Dans `POWERUP_BY_ID`, remplacer `'strike'` (indice 4) par `null`.

- [ ] **Step 2: Retirer l'activation, le stat et la létalité**

Dans `src/sim/powerups/activate.ts`, supprimer tout le bloc `case 'strike': { … }` ainsi que l'import de `HAZARD_STRIKE`.

Dans `src/sim/upgrades/stats.ts`, supprimer `strikeWidth: number` de l'interface et `strikeWidth: POWERUP_BASE.strike.width,` de `createRunStats`.

Dans `src/sim/systems/hazards.ts`, retirer `HAZARD_STRIKE` de l'import et de l'ensemble `LETHAL`, qui devient :

```ts
const LETHAL = new Set([HAZARD_BLAST, HAZARD_TRAIL, HAZARD_AFTERBURN])
```

- [ ] **Step 3: Retirer les deux cartes, l'icône et les tracés**

Dans `src/sim/data/upgrades.ts`, supprimer les objets d'`id` `'strike-width'` (commune) et `'wide-strike'` (rare).

Dans `src/ui/icons.ts`, supprimer l'entrée `strike`.

Dans `src/render/views/pickup.ts`, supprimer `drawStrike` et son entrée de `DRAWERS`.

Dans `src/render/views/hazard.ts`, retirer `HAZARD_STRIKE` de l'import et son entrée de `COLORS`.

Dans les deux locales, supprimer les quatre clés `upgrade.strike-width.name`, `upgrade.strike-width.desc`, `upgrade.wide-strike.name`, `upgrade.wide-strike.desc`.

- [ ] **Step 4: Retirer le test de la Rature**

Dans `src/sim/powerups/activate.test.ts`, supprimer le cas `'strike crée une zone allongée dans la direction du joueur'` et l'import de `HAZARD_STRIKE`.

Vérifier aussi le commentaire de `src/sim/systems/collision.test.ts` (vers la ligne 82) qui cite « blast/trail/strike » : le corriger en « blast/trail » — c'est un commentaire, mais un commentaire qui nomme une constante disparue est un piège pour le prochain lecteur.

- [ ] **Step 5: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/sim/data/powerups.ts src/sim/powerups/activate.ts src/sim/powerups/activate.test.ts src/sim/upgrades/stats.ts src/sim/systems/hazards.ts src/sim/systems/collision.test.ts src/sim/data/upgrades.ts src/render/views/hazard.ts src/render/views/pickup.ts src/ui/icons.ts src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(powerups): retirer la Rature"
```

---

### Task 3: La couronne de piques — simulation

**Files:**
- Create: `src/sim/systems/spikes.ts`
- Create: `src/sim/systems/spikes.test.ts`
- Delete: `src/sim/systems/trail.ts`, `src/sim/systems/trail.test.ts`
- Modify: `src/sim/data/powerups.ts`, `src/sim/components/index.ts`, `src/sim/powerups/activate.ts`, `src/sim/systems/hazards.ts`, `src/sim/step.ts`
- Test: `src/sim/powerups/activate.test.ts`

**Interfaces:**
- Consumes: la table de données allégée par les Tasks 1-2.
- Produces:
  - `HAZARD_SPIKE = 7` et `POWERUP_BASE.trail = { durationMs: 5000, count: 7, orbitRadius: 40, spikeRadius: 11, angularRate: 0.0016 }`.
  - `Orbiting = defineComponent({ angle: Types.f32, radius: Types.f32 })`.
  - `spikeAngle(baseAngle: number, rate: number, time: number): number` — pure, exportée pour test.
  - `spikeSystem(world: SimWorld): SimWorld`, qui remplace `trailSystem` dans `stepWorld`.

- [ ] **Step 1: Écrire le test du système**

Créer `src/sim/systems/spikes.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { Hazard, Position } from '../components'
import { HAZARD_SPIKE, POWERUP_BASE } from '../data/powerups'
import { activatePowerUp } from '../powerups/activate'
import { spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { createWorld } from '../world'
import { spikeAngle, spikeSystem } from './spikes'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  activatePowerUp(w, 'trail', createRunStats(), 400, 300)
  return w
}

const spikePositions = (w: ReturnType<typeof setup>) => {
  const out: { x: number; y: number }[] = []
  for (let eid = 0; eid < 200; eid++) {
    if (Hazard.kind[eid] === HAZARD_SPIKE && Position.x[eid] !== undefined) {
      out.push({ x: Position.x[eid]!, y: Position.y[eid]! })
    }
  }
  return out
}

describe('spikeAngle', () => {
  it("part de l'angle de base à t = 0", () => {
    expect(spikeAngle(1.2, 0.0016, 0)).toBeCloseTo(1.2, 10)
  })

  it('tourne proportionnellement au temps de simulation', () => {
    expect(spikeAngle(0, 0.0016, 1000)).toBeCloseTo(1.6, 10)
  })

  it('est déterministe : deux appels au même instant donnent le même angle', () => {
    expect(spikeAngle(0.5, 0.0016, 1234)).toBe(spikeAngle(0.5, 0.0016, 1234))
  })
})

describe('spikeSystem', () => {
  it('crée autant de piques que le réglage le demande', () => {
    const w = setup()
    expect(spikePositions(w)).toHaveLength(POWERUP_BASE.trail.count)
  })

  it("place les piques sur le cercle d'orbite autour du joueur", () => {
    const w = setup()
    spikeSystem(w)
    const px = Position.x[w.playerEid]!
    const py = Position.y[w.playerEid]!
    for (const p of spikePositions(w)) {
      expect(Math.hypot(p.x - px, p.y - py)).toBeCloseTo(POWERUP_BASE.trail.orbitRadius, 6)
    }
  })

  it('répartit les piques à intervalles angulaires égaux', () => {
    const w = setup()
    spikeSystem(w)
    const px = Position.x[w.playerEid]!
    const py = Position.y[w.playerEid]!
    const angles = spikePositions(w)
      .map((p) => Math.atan2(p.y - py, p.x - px))
      .sort((a, b) => a - b)
    const expected = (Math.PI * 2) / POWERUP_BASE.trail.count
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]! - angles[i - 1]!).toBeCloseTo(expected, 6)
    }
  })

  it('suit le joueur quand il se déplace', () => {
    const w = setup()
    Position.x[w.playerEid] = 100
    Position.y[w.playerEid] = 120
    spikeSystem(w)
    for (const p of spikePositions(w)) {
      expect(Math.hypot(p.x - 100, p.y - 120)).toBeCloseTo(POWERUP_BASE.trail.orbitRadius, 6)
    }
  })

  it('tourne avec le temps de simulation', () => {
    const w = setup()
    spikeSystem(w)
    const before = spikePositions(w)[0]
    w.time = 500
    spikeSystem(w)
    const after = spikePositions(w)[0]
    expect(Math.hypot(after!.x - before!.x, after!.y - before!.y)).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/sim/systems/spikes.test.ts`
Expected: FAIL — `Failed to resolve import "./spikes"`.

- [ ] **Step 3: Ajouter le kind, les réglages et le composant**

Dans `src/sim/data/powerups.ts`, après `HAZARD_AFTERBURN`, ajouter :

```ts
/** Pique de la couronne du Trait d'encre. 7 : la première valeur libre — 4 (la
 *  Rature) reste un trou, voir le commentaire des identifiants ci-dessus. */
export const HAZARD_SPIKE = 7
```

et remplacer l'entrée `trail` de `POWERUP_BASE` par :

```ts
  /**
   * Le Trait d'encre n'est plus une zone collée au joueur (invisible, portée
   * réelle de 19 px) mais une couronne de piques en orbite : portée 51 px
   * (orbite + rayon de pique), et une forme qu'on voit. `angularRate` est en
   * rad/ms — le temps de simulation est en ms partout ailleurs, et le convertir
   * ici plutôt qu'au point d'appel évite de se tromper d'unité.
   */
  trail: {
    durationMs: 5000,
    count: 7,
    orbitRadius: 40,
    spikeRadius: 11,
    angularRate: 0.0016,
    /** Fenêtre d'avertissement avant expiration, lue par le rendu (spec §3.3). */
    warnMs: 900,
  },
```

Dans `src/sim/components/index.ts`, ajouter près de `Hazard` :

```ts
/**
 * Zone en orbite autour du joueur (piques du Trait d'encre) : `angle` est sa
 * position de base sur le cercle, la rotation venant du temps de simulation.
 * Un composant dédié plutôt qu'un champ détourné de `Hazard` — y ranger un
 * angle rendrait les deux illisibles.
 */
export const Orbiting = defineComponent({ angle: Types.f32, radius: Types.f32 })
```

Dans `src/sim/systems/hazards.ts`, ajouter `HAZARD_SPIKE` à l'import et à `LETHAL` :

```ts
const LETHAL = new Set([HAZARD_BLAST, HAZARD_TRAIL, HAZARD_SPIKE, HAZARD_AFTERBURN])
```

- [ ] **Step 4: Écrire le système**

Créer `src/sim/systems/spikes.ts` :

```ts
import { defineQuery } from 'bitecs'

import { Hazard, Orbiting, Position, PrevPosition } from '../components'
import { HAZARD_SPIKE } from '../data/powerups'
import type { SimWorld } from '../world'

const spikes = defineQuery([Hazard, Orbiting, Position, PrevPosition])

/**
 * Angle d'une pique à un instant donné. Dérivé de `time` (temps de simulation)
 * et non d'une horloge murale : la rotation est déterministe et gèle pendant un
 * hitstop, comme tout le reste du monde.
 */
export function spikeAngle(baseAngle: number, rate: number, time: number): number {
  return baseAngle + rate * time
}

/**
 * La couronne de piques du Trait d'encre. Chaque pique est une vraie zone
 * mortelle, pas un ornement : ce qui est dessiné à l'écran est exactement ce qui
 * tue (spec §3.1). Les trous entre les piques sont voulus — c'est ce qui en fait
 * des piques plutôt qu'une aura — et la rotation les balaie.
 */
export function spikeSystem(world: SimWorld): SimWorld {
  const player = world.playerEid
  if (player < 0) {
    return world
  }
  const px = Position.x[player]!
  const py = Position.y[player]!

  for (const eid of spikes(world)) {
    if (Hazard.kind[eid] !== HAZARD_SPIKE) {
      continue
    }
    // Mémorisée avant le déplacement : ces zones bougent, et sans PrevPosition
    // le rendu ne peut pas les interpoler — elles décrocheraient visiblement du
    // joueur, lui interpolé, sur un écran à haut rafraîchissement.
    PrevPosition.x[eid] = Position.x[eid]!
    PrevPosition.y[eid] = Position.y[eid]!

    const a = spikeAngle(Orbiting.angle[eid]!, Hazard.growthRate[eid]!, world.time)
    const r = Orbiting.radius[eid]!
    Position.x[eid] = px + Math.cos(a) * r
    Position.y[eid] = py + Math.sin(a) * r
  }
  return world
}
```

`Hazard.growthRate` porte ici le taux angulaire : ces zones ne grandissent pas, le champ est libre, et il évite un troisième champ sur `Orbiting`. **Écrire ce choix en commentaire** au point où `activate.ts` l'assigne (Step 5), pas seulement ici.

- [ ] **Step 5: Faire naître les sept piques**

Dans `src/sim/powerups/activate.ts`, remplacer intégralement le `case 'trail'` par :

```ts
    case 'trail': {
      // Une entité par pique : chacune est une vraie zone mortelle, donc ce que
      // le joueur voit est exactement ce qui tue (spec §3.1). Leur position est
      // recalculée à chaque pas par `spikeSystem`.
      const px = Position.x[player]!
      const py = Position.y[player]!
      const { count, orbitRadius, spikeRadius, angularRate } = POWERUP_BASE.trail
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2
        const x = px + Math.cos(angle) * orbitRadius
        const y = py + Math.sin(angle) * orbitRadius
        const eid = createHazard(world, HAZARD_SPIKE, x, y, {
          radius: spikeRadius,
          maxRadius: spikeRadius,
          // `growthRate` porte le taux angulaire : une pique ne grandit jamais,
          // le champ est donc libre, et ça évite un troisième champ sur
          // `Orbiting` pour une valeur identique à toute la couronne.
          growthRate: angularRate,
          lifeMs: stats.trailDurationMs,
        })
        addComponent(world, Orbiting, eid)
        Orbiting.angle[eid] = angle
        Orbiting.radius[eid] = orbitRadius
        addComponent(world, PrevPosition, eid)
        PrevPosition.x[eid] = x
        PrevPosition.y[eid] = y
      }
      break
    }
```

Ajouter `Orbiting` à l'import de `../components` et `HAZARD_SPIKE` à celui de `../data/powerups` ; retirer `HAZARD_TRAIL` et `Velocity` de ces imports s'ils ne servent plus dans ce fichier (Biome `noUnusedImports` est une erreur).

- [ ] **Step 6: Brancher le système et supprimer l'ancien**

Dans `src/sim/step.ts`, remplacer l'import et l'appel de `trailSystem` par `spikeSystem` **à la même position dans l'ordre** — l'ordre des systèmes est figé et documenté, changer la position serait un changement de comportement non demandé.

Supprimer `src/sim/systems/trail.ts` et `src/sim/systems/trail.test.ts`.

- [ ] **Step 7: Adapter le test d'activation**

Dans `src/sim/powerups/activate.test.ts`, le cas qui vérifie que `trail` crée une zone doit maintenant en attendre sept, de kind `HAZARD_SPIKE`. Adapter les assertions existantes plutôt que d'en ajouter un second.

- [ ] **Step 8: Lancer les tests et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — dont les 8 cas de `spikes.test.ts`.

```bash
git add src/sim/systems/spikes.ts src/sim/systems/spikes.test.ts src/sim/data/powerups.ts src/sim/components/index.ts src/sim/powerups/activate.ts src/sim/powerups/activate.test.ts src/sim/systems/hazards.ts src/sim/step.ts
git rm src/sim/systems/trail.ts src/sim/systems/trail.test.ts
git commit -m "feat(sim): transformer le Trait d'encre en couronne de piques"
```

---

### Task 4: La couronne de piques — rendu

**Files:**
- Modify: `src/render/views/hazard.ts`, `src/render/stage.ts`

**Interfaces:**
- Consumes: `HAZARD_SPIKE`, `POWERUP_BASE.trail.warnMs` (Task 3).
- Produces: `HazardView.update` accepte un champ supplémentaire `remainingMs: number`.

- [ ] **Step 1: Passer le temps restant brut au rendu**

`hazardView` reçoit aujourd'hui `lifeRatio`, calculé sur une fenêtre de 400 ms — trop courte pour piloter un avertissement de 900 ms. Dans `src/render/stage.ts`, à l'endroit où `view.update({...})` est appelé pour les zones, ajouter :

```ts
          remainingMs: life === undefined ? Number.POSITIVE_INFINITY : life,
```

(`life` est la variable déjà lue depuis `Lifetime.remaining[eid]` juste au-dessus. `Infinity` pour une zone sans `Lifetime` : elle n'est jamais « sur le point de finir ».)

- [ ] **Step 2: Déclarer le champ et dessiner les piques**

Dans `src/render/views/hazard.ts`, ajouter à l'interface `update` :

```ts
    /** Temps de vie restant en ms, brut — pilote l'avertissement de fin des piques. */
    remainingMs: number
```

Ajouter `HAZARD_SPIKE` à l'import depuis `@/sim/data/powerups`, ainsi que `POWERUP_BASE`, et l'entrée `[HAZARD_SPIKE]: INK.paper,` dans `COLORS`.

Ajouter la fonction de tracé, au-dessus de `createHazardView` :

```ts
/**
 * Une pique : un éclat d'encre effilé, pointe vers l'extérieur. Elle est
 * dessinée centrée sur sa propre entité — donc exactement là où la zone tue
 * (spec §3.1). Sur les dernières `warnMs`, elle pulse et se rétracte : c'est
 * l'avertissement que la couronne va tomber. La pulsation est sinusoïdale et
 * non binaire — même lisibilité qu'un clignotement, sans le stroboscope.
 */
function drawSpike(
  gfx: Graphics,
  radius: number,
  color: number,
  angle: number,
  remainingMs: number,
  time: number,
): void {
  const warn = POWERUP_BASE.trail.warnMs
  const ending = remainingMs < warn
  // 5 Hz : assez rapide pour dire « ça va finir », assez lent pour rester lisible.
  const pulse = ending ? 0.55 + 0.45 * Math.sin((time / 1000) * Math.PI * 2 * 5) : 1
  const shrink = ending ? 0.7 + 0.3 * (remainingMs / warn) : 1

  const len = radius * 2.1 * shrink
  const half = radius * 0.62 * shrink
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Losange allongé dans l'axe de l'orbite : pointe en avant, base en arrière.
  const tip = [cos * len, sin * len]
  const back = [-cos * len * 0.55, -sin * len * 0.55]
  const side = [-sin * half, cos * half]

  gfx
    .moveTo(tip[0]!, tip[1]!)
    .lineTo(side[0]!, side[1]!)
    .lineTo(back[0]!, back[1]!)
    .lineTo(-side[0]!, -side[1]!)
    .closePath()
    .fill({ color, alpha: 0.9 * pulse })
}
```

La vue ne peut pas deviner l'orientation d'une pique : c'est `stage.ts` qui a sous la main la position du joueur et celle de la zone. Ajouter donc un second champ à l'interface `update` :

```ts
    /** Orientation de la zone, en radians. Nulle sauf pour les piques, qui pointent vers l'extérieur. */
    angle: number
```

Dans `update`, ajouter la branche avant celle du Buvard :

```ts
      if (kind === HAZARD_SPIKE) {
        drawSpike(gfx, radius, color, angle, remainingMs, time)
        return
      }
```

(et déstructurer `angle` et `remainingMs` dans la signature de `update`, avec les autres champs).

- [ ] **Step 2 bis: Calculer l'angle dans la scène**

Dans `src/render/stage.ts`, à l'endroit de la boucle sur les zones, le joueur est déjà localisable via `world.playerEid`. Avant la boucle :

```ts
      // Orientation des piques : elles pointent du joueur vers l'extérieur.
      // Calculée ici plutôt que dans la vue, qui ne connaît que la zone.
      const spikeOrigin =
        world.playerEid >= 0
          ? { x: at(Position.x, world.playerEid), y: at(Position.y, world.playerEid) }
          : null
```

et dans l'appel à `view.update({...})` :

```ts
          angle:
            at(Hazard.kind, eid) === HAZARD_SPIKE && spikeOrigin
              ? Math.atan2(at(Position.y, eid) - spikeOrigin.y, at(Position.x, eid) - spikeOrigin.x)
              : 0,
```

en important `HAZARD_SPIKE` depuis `@/sim/data/powerups`. `at` est le lecteur indexé sûr déjà défini en haut de `stage.ts` (`src/render/` n'a pas droit à `!`).

- [ ] **Step 3: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — aucun test ne couvre le rendu, le typecheck est le gate.

```bash
git add src/render/views/hazard.ts src/render/stage.ts
git commit -m "feat(render): dessiner la couronne de piques et son avertissement de fin"
```

---

### Task 5: La Plume — puissance

**Files:**
- Modify: `src/sim/data/powerups.ts`, `src/sim/upgrades/stats.ts`, `src/sim/systems/dash-kill.ts`, `src/sim/systems/player-movement.ts`
- Test: `src/sim/systems/dash-kill.test.ts`, `src/sim/systems/player-movement.test.ts`

**Interfaces:**
- Consumes: rien des tâches précédentes.
- Produces: `RunStats.dashRadius: number` (défaut 40) ; `POWERUP_BASE.dash.durationMs` passe à 380 ; `dashKillSystem(world, stats)` prend désormais les stats.

- [ ] **Step 1: Écrire les tests**

Dans `src/sim/systems/dash-kill.test.ts`, ajouter :

```ts
  it('tue à la portée de `dashRadius`, pas au rayon du joueur', () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 200
    // 30 px du joueur : hors de portée du seul rayon du joueur (9 + 7 = 16),
    // dans celle de la ruée (40 + 7 = 47).
    const enemy = spawnEnemy(w, Position.x[w.playerEid]! + 30, Position.y[w.playerEid]!)
    dashKillSystem(w, stats)
    expect(hasComponent(w, Doomed, enemy)).toBe(true)
  })

  it('ne tue pas au-delà de `dashRadius`', () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 200
    const enemy = spawnEnemy(w, Position.x[w.playerEid]! + 200, Position.y[w.playerEid]!)
    dashKillSystem(w, stats)
    expect(hasComponent(w, Doomed, enemy)).toBe(false)
  })
```

Adapter les helpers (`setup`, `spawnEnemy`) à ceux déjà présents dans le fichier plutôt que d'en créer de nouveaux, et mettre à jour tous les appels existants de `dashKillSystem(w)` en `dashKillSystem(w, createRunStats())`.

Dans `src/sim/systems/player-movement.test.ts`, ajouter :

```ts
  it('accorde une grâce à la fin de la ruée, pas pendant', () => {
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    spawnPlayer(w)
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = FIXED_DT * 2

    playerMovementSystem(w)
    expect(hasComponent(w, Invulnerable, w.playerEid)).toBe(false)

    playerMovementSystem(w)
    expect(hasComponent(w, Dashing, w.playerEid)).toBe(false)
    expect(hasComponent(w, Invulnerable, w.playerEid)).toBe(true)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(200, 0)
  })
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/sim/systems/dash-kill.test.ts src/sim/systems/player-movement.test.ts`
Expected: FAIL — `dashKillSystem` ne prend qu'un argument, et aucune grâce n'est posée.

- [ ] **Step 3: Régler la Plume**

Dans `src/sim/data/powerups.ts`, remplacer l'entrée `dash` de `POWERUP_BASE` :

```ts
  /**
   * 220 ms ne faisaient que 158 px de course — moins de deux fois la longueur du
   * sprite — dans un couloir mortel large de 32 px, soit le seul rayon du joueur.
   * La Plume est le recours quand on est encerclé : il lui faut de quoi trancher
   * une foule (spec §4.1).
   */
  dash: { speed: 720, durationMs: 380, radius: 40, wakeIntervalMs: 30, wakeLifeMs: 800 },
```

Dans `src/sim/upgrades/stats.ts`, ajouter `dashRadius: number` à l'interface et `dashRadius: POWERUP_BASE.dash.radius,` à `createRunStats`.

- [ ] **Step 4: Élargir le couloir mortel**

Dans `src/sim/systems/dash-kill.ts`, changer la signature en `dashKillSystem(world: SimWorld, stats: RunStats)` (importer le type depuis `../upgrades/stats`) et remplacer :

```ts
  const pr = Collider.radius[player]!
```

par :

```ts
  // La portée de la ruée, pas le rayon du joueur : la Plume balaie un couloir
  // (spec §4.1). Aucun test balayé n'est nécessaire — à 720 px/s et 16,7 ms par
  // pas, le joueur avance de 12 px contre un rayon de 40 : le recouvrement entre
  // deux pas est large, rien ne peut passer au travers.
  const pr = stats.dashRadius
```

`Collider` devient peut-être inutilisé pour le joueur mais reste nécessaire pour les ennemis — vérifier avant de toucher à l'import.

Dans `src/sim/step.ts`, passer `stats` à l'appel de `dashKillSystem`.

- [ ] **Step 5: Accorder la grâce d'atterrissage**

Dans `src/sim/systems/player-movement.ts`, dans la branche qui retire `Dashing` :

```ts
      if (remaining <= 0) {
        removeComponent(world, Dashing, eid)
        // Grâce d'atterrissage : la Plume s'active quand on est encerclé, et
        // s'arrêter en pleine foule tuait dans la situation même où on
        // l'utilise. `collisionSystem` décrémente `Invulnerable` plus tard dans
        // le même pas, donc la grâce vaut en pratique une image de moins — c'est
        // sans conséquence à cette durée, et l'aligner coûterait un cas
        // particulier dans les deux systèmes.
        addComponent(world, Invulnerable, eid)
        Invulnerable.remaining[eid] = DASH_LANDING_GRACE_MS
      } else {
```

avec, en haut du fichier :

```ts
/** Grâce accordée à l'atterrissage d'une ruée (spec §4.1). */
const DASH_LANDING_GRACE_MS = 200
```

et `addComponent`, `Invulnerable` ajoutés aux imports.

**Vérifier `src/sim/step.test.ts`** : il porte un invariant sur `Invulnerable`/`Dashing` (vers les lignes 100-135). Le lire et confirmer que la nouvelle grâce le renforce au lieu de le casser ; s'il échoue, comprendre pourquoi avant de le modifier — c'est un test d'invariant, pas un test de détail.

- [ ] **Step 6: Lancer les tests et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/sim/data/powerups.ts src/sim/upgrades/stats.ts src/sim/systems/dash-kill.ts src/sim/systems/dash-kill.test.ts src/sim/systems/player-movement.ts src/sim/systems/player-movement.test.ts src/sim/step.ts
git commit -m "feat(sim): élargir, allonger et sécuriser la ruée de la Plume"
```

---

### Task 6: La Plume — le sillage qui tue et qui se voit

**Files:**
- Create: `src/sim/systems/dash-wake.ts`
- Create: `src/sim/systems/dash-wake.test.ts`
- Modify: `src/sim/step.ts`, `src/sim/world.ts`, `src/render/views/hazard.ts`

**Interfaces:**
- Consumes: `POWERUP_BASE.dash.wakeIntervalMs` / `wakeLifeMs`, `stats.dashRadius` (Task 5).
- Produces: `dashWakeSystem(world: SimWorld, stats: RunStats): SimWorld` ; `SimWorld` gagne `dashWakeAccMs: number`.

- [ ] **Step 1: Écrire le test**

Créer `src/sim/systems/dash-wake.test.ts` :

```ts
import { addComponent, defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Dashing, Hazard, Position } from '../components'
import { HAZARD_TRAIL, POWERUP_BASE } from '../data/powerups'
import { spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT } from '../world'
import { dashWakeSystem } from './dash-wake'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

// Une requête bitECS, PAS un balayage d'indices bruts (`for eid = 0; eid < N`) :
// les ids d'entité viennent d'un compteur global au processus, pas par monde, si
// bien qu'un balayage voit les entités des autres `it()` du fichier et compte
// faux. C'est l'idiome déjà employé par les autres tests de simulation.
const hazardQuery = defineQuery([Hazard, Position])

const wakeEids = (w: ReturnType<typeof setup>): number[] =>
  hazardQuery(w).filter((eid) => Hazard.kind[eid] === HAZARD_TRAIL)

describe('dashWakeSystem', () => {
  it('ne dépose rien hors de la ruée', () => {
    const w = setup()
    for (let i = 0; i < 20; i++) {
      dashWakeSystem(w, createRunStats())
      w.time += FIXED_DT
    }
    expect(wakeEids(w)).toHaveLength(0)
  })

  it("dépose un segment à l'intervalle prévu pendant la ruée", () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 1000

    // 6 pas de 16,67 ms = 100 ms ; à 30 ms d'intervalle, on attend 3 segments
    // (t = 0 compris, puis 30 et 60 et 90 → 4 au plus, 3 au moins selon l'arrondi).
    for (let i = 0; i < 6; i++) {
      dashWakeSystem(w, stats)
      w.time += FIXED_DT
    }
    const expected = Math.floor(100 / POWERUP_BASE.dash.wakeIntervalMs)
    expect(wakeEids(w).length).toBeGreaterThanOrEqual(expected)
    expect(wakeEids(w).length).toBeLessThanOrEqual(expected + 2)
  })

  it('donne au segment le rayon de la ruée', () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 1000
    dashWakeSystem(w, stats)
    for (const eid of wakeEids(w)) {
      // Précision 4, pas 6 : les champs de composant bitECS sont des `f32`, et
      // exiger 1e-6 sur une valeur de cet ordre échoue sur l'arrondi seul.
      expect(Hazard.radius[eid]).toBeCloseTo(stats.dashRadius, 4)
    }
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/sim/systems/dash-wake.test.ts`
Expected: FAIL — `Failed to resolve import "./dash-wake"`.

- [ ] **Step 3: Écrire le système**

Dans `src/sim/world.ts`, ajouter à `SimWorld` et initialiser à 0 :

```ts
  /** Temps accumulé depuis le dernier segment de sillage déposé par la ruée. */
  dashWakeAccMs: number
```

Créer `src/sim/systems/dash-wake.ts` :

```ts
import { addComponent, addEntity, hasComponent } from 'bitecs'

import { Dashing, Hazard, Lifetime, Position } from '../components'
import { HAZARD_TRAIL, POWERUP_BASE } from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * Le sillage de la ruée : des taches d'encre mortelles déposées le long du
 * parcours. C'est aussi tout le visuel de la Plume — le couloir affiché EST le
 * couloir qui tue, donc la portée et la largeur se lisent à l'écran sans qu'un
 * indicateur séparé puisse diverger de la réalité (spec §4.2).
 *
 * Il réutilise `HAZARD_TRAIL`, qui retrouve ici son sens : la constante
 * désignait jusqu'ici une zone collée au joueur qui ne traînait rien.
 */
export function dashWakeSystem(world: SimWorld, stats: RunStats): SimWorld {
  const player = world.playerEid
  if (player < 0 || !hasComponent(world, Dashing, player)) {
    // Remis à zéro hors ruée : sinon le temps écoulé entre deux ruées ferait
    // déposer un segment dès le premier pas de la suivante ET un autre juste
    // après, doublant le premier point du sillage.
    world.dashWakeAccMs = 0
    return world
  }

  world.dashWakeAccMs += FIXED_DT * world.timeScale
  const interval = POWERUP_BASE.dash.wakeIntervalMs
  if (world.dashWakeAccMs < interval) {
    return world
  }
  // Soustraction plutôt que remise à zéro : la cadence reste juste même quand un
  // pas dépasse l'intervalle, au lieu de dériver d'un peu à chaque segment.
  world.dashWakeAccMs -= interval

  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = Position.x[player]!
  Position.y[eid] = Position.y[player]!
  Hazard.kind[eid] = HAZARD_TRAIL
  Hazard.radius[eid] = stats.dashRadius
  Hazard.maxRadius[eid] = stats.dashRadius
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = POWERUP_BASE.dash.wakeLifeMs
  return world
}
```

Dans `src/sim/step.ts`, appeler `dashWakeSystem(world, stats)` **juste après `playerMovementSystem`** — le sillage doit être déposé là où le joueur vient d'arriver, pas où il était.

- [ ] **Step 4: Dessiner le sillage comme une tache d'encre**

Dans `src/render/views/hazard.ts`, `HAZARD_TRAIL` tombe aujourd'hui dans la branche générique (cercle tracé, largeur 3). Lui donner sa branche, avant le `else` final :

```ts
      } else if (kind === HAZARD_TRAIL) {
        // Tache pleine et non anneau : c'est de l'encre déposée, et le joueur
        // doit lire d'un coup d'œil que tout l'intérieur du couloir tue.
        gfx.circle(0, 0, radius).fill({ color, alpha: 0.22 * lifeRatio })
        gfx.circle(0, 0, radius).stroke({ color, width: 2, alpha: 0.5 * lifeRatio })
```

- [ ] **Step 5: Lancer les tests et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/sim/systems/dash-wake.ts src/sim/systems/dash-wake.test.ts src/sim/step.ts src/sim/world.ts src/render/views/hazard.ts
git commit -m "feat(sim): faire tracer un sillage mortel à la ruée"
```

---

### Task 7: Images rémanentes de la ruée

**Files:**
- Create: `src/render/fx/afterimage.ts`
- Create: `src/render/fx/afterimage.test.ts`
- Modify: `src/render/stage.ts`

**Interfaces:**
- Consumes: rien des tâches précédentes.
- Produces:
  - `afterimageAlpha(age: number, lifeMs: number): number` — pure, exportée pour test.
  - `createAfterimages(container: Container): Afterimages` avec `emit(x, y, angle)`, `update(dtMs)`, `destroy()`.

- [ ] **Step 1: Écrire le test de la décroissance**

Créer `src/render/fx/afterimage.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { afterimageAlpha } from './afterimage'

describe('afterimageAlpha', () => {
  it('est à son maximum à la naissance', () => {
    expect(afterimageAlpha(0, 250)).toBeCloseTo(1, 10)
  })

  it("s'éteint exactement en fin de vie", () => {
    expect(afterimageAlpha(250, 250)).toBeCloseTo(0, 10)
  })

  it('décroît de façon monotone', () => {
    expect(afterimageAlpha(50, 250)).toBeGreaterThan(afterimageAlpha(150, 250))
  })

  it('ne repasse jamais au-dessus de zéro passé la fin de vie', () => {
    expect(afterimageAlpha(400, 250)).toBe(0)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/render/fx/afterimage.test.ts`
Expected: FAIL — `Failed to resolve import "./afterimage"`.

- [ ] **Step 3: Écrire le module**

Créer `src/render/fx/afterimage.ts` :

```ts
import { type Container, Graphics } from 'pixi.js'

import { INK } from '../ink'

interface Ghost {
  gfx: Graphics
  age: number
}

export interface Afterimages {
  emit(x: number, y: number, angle: number): void
  update(dtMs: number): void
  destroy(): void
}

const LIFE_MS = 250
/** Borne dure : une ruée longue ne doit pas laisser une file sans fin de fantômes. */
const LIMIT = 16

/** Opacité d'un fantôme à `age` ms. Nulle passé sa fin de vie, jamais négative. */
export function afterimageAlpha(age: number, lifeMs: number): number {
  return Math.max(0, 1 - age / lifeMs)
}

/**
 * Copies fantômes de la pointe de plume pendant la ruée : c'est ce qui fait
 * *sentir* la vitesse, là où le sillage (`dash-wake.ts`) montre la portée.
 * Purement cosmétique — `src/render/` n'écrit jamais dans la simulation.
 */
export function createAfterimages(container: Container): Afterimages {
  const ghosts: Ghost[] = []

  return {
    emit(x, y, angle): void {
      if (ghosts.length >= LIMIT) {
        const oldest = ghosts.shift()
        oldest?.gfx.destroy()
      }
      // Même silhouette que `views/player.ts` : un fantôme qui ne ressemble pas
      // au joueur ne se lit pas comme sa trace.
      const gfx = new Graphics()
      gfx
        .moveTo(13, 0)
        .lineTo(-8, 9)
        .lineTo(-4, 0)
        .lineTo(-8, -9)
        .closePath()
        .fill({ color: INK.paper })
      gfx.x = x
      gfx.y = y
      gfx.rotation = angle
      gfx.alpha = 0.45
      container.addChild(gfx)
      ghosts.push({ gfx, age: 0 })
    },

    update(dtMs): void {
      for (let i = ghosts.length - 1; i >= 0; i--) {
        const g = ghosts[i]
        if (!g) {
          continue
        }
        g.age += dtMs
        const alpha = afterimageAlpha(g.age, LIFE_MS)
        if (alpha <= 0) {
          g.gfx.destroy()
          ghosts.splice(i, 1)
          continue
        }
        g.gfx.alpha = alpha * 0.45
      }
    },

    destroy(): void {
      for (const g of ghosts) {
        g.gfx.destroy()
      }
      ghosts.length = 0
    },
  }
}
```

- [ ] **Step 4: Monter et alimenter depuis la scène**

Dans `src/render/stage.ts` : importer `createAfterimages` et son type, construire l'instance sur `worldLayer` (les fantômes vivent dans le monde, pas au-dessus des particules), l'exposer sur `Stage`, l'appeler dans `sync` et la détruire dans `destroy` — les mêmes quatre points de branchement que les autres modules d'effet.

Dans `sync`, après la mise à jour de la vue du joueur, émettre un fantôme quand le joueur porte `Dashing` et qu'au moins `EMIT_INTERVAL_MS` (40) se sont écoulés en temps réel depuis le dernier. `hasComponent(world, Dashing, p)` donne l'état ; importer `Dashing` depuis `@/sim/components` comme les autres composants déjà lus ici.

**L'émission doit être gardée par `effectsEnabled`** (le drapeau posé par `setEffects`, qui reflète le mouvement réduit) : ce sont des images qui bougent, au même titre que les particules et la secousse.

- [ ] **Step 5: Lancer les tests et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — dont les 4 cas d'`afterimage.test.ts`.

```bash
git add src/render/fx/afterimage.ts src/render/fx/afterimage.test.ts src/render/stage.ts
git commit -m "feat(render): laisser des images rémanentes pendant la ruée"
```

---

### Task 8: Une carte pour la largeur de ruée

**Files:**
- Modify: `src/sim/data/upgrades.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`
- Test: `src/sim/upgrades/draw.test.ts`

**Interfaces:**
- Consumes: `RunStats.dashRadius` (Task 5).
- Produces: carte commune `dash-radius`.

- [ ] **Step 1: Ajouter la carte**

Dans `src/sim/data/upgrades.ts`, à la suite de la carte `dash-duration` :

```ts
  {
    id: 'dash-radius',
    rarity: 'common',
    stackable: true,
    requires: 'dash',
    apply: (s) => {
      s.dashRadius *= 1.3
    },
  },
```

- [ ] **Step 2: Ajouter les clés dans les deux locales**

Dans `src/i18n/locales/en.json` :

```json
  "upgrade.dash-radius.name": "Broad Nib",
  "upgrade.dash-radius.desc": "+30% dash width",
```

Dans `src/i18n/locales/fr.json` :

```json
  "upgrade.dash-radius.name": "Plume large",
  "upgrade.dash-radius.desc": "+30% de largeur de ruée",
```

Ces noms sont libérés par la suppression de la Rature (Task 2) : vérifier qu'ils n'y sont plus avant de les réintroduire, sinon la clé serait dupliquée.

- [ ] **Step 3: Vérifier que le tirage tient toujours**

Run: `npx vitest run src/sim/upgrades/draw.test.ts src/i18n/parity.test.ts`
Expected: PASS. Si un test de `draw.test.ts` compte les cartes du pool ou nomme une carte supprimée, le corriger — c'est une conséquence attendue des Tasks 1, 2 et 8, pas une régression.

- [ ] **Step 4: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/sim/data/upgrades.ts src/sim/upgrades/draw.test.ts src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(upgrades): ajouter une carte de largeur de ruée"
```

---

## Vérification manuelle finale

Après la Task 8, lancer `npm run dev` et vérifier (spec §6) :

1. Ni la Rature ni le Séchage n'apparaissent au sol, et leurs cartes ne sortent plus au choix d'amélioration.
2. Le Trait d'encre fait apparaître sept piques nettement visibles qui tournent autour du joueur et tuent ce qu'elles touchent.
3. Les piques pulsent et se rétractent sur la dernière seconde, assez tôt pour qu'on ait le temps de réagir.
4. La ruée trace un large couloir d'encre visible qui tue, y compris les ennemis qui se referment derrière le joueur.
5. S'arrêter en pleine foule à la fin d'une ruée ne tue plus instantanément.
6. Mouvement réduit activé : les images rémanentes disparaissent ; piques et sillage restent — ce sont des zones de jeu, pas des effets.
