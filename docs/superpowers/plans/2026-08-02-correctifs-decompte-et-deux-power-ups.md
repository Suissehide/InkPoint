# Correctifs, décompte de reprise et deux power-ups — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirer « Onde de choc », rendre la Ronce invincible, sortir le Buvard du tirage, intercaler un décompte 3-2-1 à la reprise, agrandir les textes des écrans, et ajouter deux power-ups (Volée de plumes, Bavure).

**Architecture:** Trois couches à frontières dures, déjà en place. `src/sim/` est une simulation ECS pure (bitECS) : pas de Pixi, pas de DOM, pas de `Math.random()`, pas d'horloge réelle. `src/render/` lit la simulation sans jamais y écrire. `src/ui/` pose des écrans DOM (Tailwind v4) par-dessus le canvas. Le contenu de jeu — power-ups, cartes, ennemis — vit en données typées dans `src/sim/data/`, et les nouveaux power-ups suivent ce patron : des constantes, un composant, un système, jamais une exception dans un système existant.

**Tech Stack:** TypeScript 5.7 strict · bitECS 0.3 · PixiJS 8 · Tailwind CSS 4 · Vite 6 · Vitest 2 · Biome 2.4

## Global Constraints

- **Langue.** Tout commentaire, nom de test et message de commit est en **français**. Le code (identifiants, clés i18n) est en anglais. C'est la convention de tout le dépôt.
- **Commits conventionnels.** Husky + commitlint les imposent : `feat(scope): …`, `fix(scope): …`, `refactor(scope): …`, `docs(scope): …`, `test(scope): …`. Scopes en usage : `app`, `sim`, `render`, `ui`, `audio`, `i18n`, `spec`, `test`.
- **Pureté de `src/sim/`.** Interdits et vérifiés par `src/sim/purity.test.ts` (filet textuel) *et* par Biome : `Math.random()`, `Date.now()`, `new Date()`, `performance`, `document`, `window`, tout import de `pixi.js`. Utiliser `world.rng` et `world.time`.
- **`noUncheckedIndexedAccess` est actif.** L'assertion non-nulle `!` est **autorisée dans `src/sim/` seulement**. Dans `src/render/` et `src/ui/`, utiliser `??` ou lever — voir le helper `at()` de `src/render/stage.ts`.
- **Un seul dépôt, plusieurs sessions.** **Ne jamais faire `git add -A` ni `git add .`** : lister les fichiers explicitement dans chaque commit.
- **Ne jamais pousser vers `origin`** sans demande explicite. Les commits restent locaux.
- **Après chaque tâche**, avant de commiter : `npm test && npm run lint && npm run typecheck` doivent passer.
- **Identifiants jamais renumérotés.** `POWERUP_ID` et les constantes `HAZARD_*` sont des étiquettes opaques : un indice libéré porte `null` dans `POWERUP_BY_ID`, il n'est jamais réattribué.

**Valeurs exactes reprises de la spec :**

| Constante | Valeur |
| --- | --- |
| `COUNTDOWN_STEP_MS` | `600` |
| `COUNTDOWN_DIGITS` | `3` |
| `--ui` | `clamp(18px, 1.4vh + 8px, 30px)` |
| facteurs de la rampe | `ui-2xs` 0.58 · `ui-xs` 0.68 · `ui-sm` 0.82 · `ui-base` 1 · `ui-lg` 1.15 · `ui-2xl` 1.5 · `ui-huge` 4.5 |
| `POWERUP_ID.volley` / `.splatter` | `9` / `10` |
| `HAZARD_QUILL` / `HAZARD_SPLATTER` | `8` / `9` |
| `POWERUP_WEIGHT.volley` / `.splatter` | `4` / `3` |
| `POWERUP_BASE.volley` | `count 3 · speed 340 · turnRate 0.006 · lifeMs 2600 · quillRadius 5 · blastRadius 60 · blastGrowth 320 · blastLingerMs 120` |
| `POWERUP_BASE.splatter` | `speed 300 · radius 11 · lifeMs 4200 · splitAngle 0.5` |

**Spec de référence :** `docs/superpowers/specs/2026-08-02-correctifs-decompte-et-deux-power-ups-design.md`

---

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
| --- | --- |
| `src/app/countdown.ts` | minuteur pur du décompte de reprise (horloge réelle, sans DOM) |
| `src/app/countdown.test.ts` | ses tests |
| `src/ui/screens/countdown.ts` | l'écran qui affiche le chiffre |
| `src/sim/systems/seeker.ts` | déplacement, ciblage et impact des plumes ; lancement d'une volée |
| `src/sim/systems/seeker.test.ts` | ses tests |
| `src/sim/systems/ricochet.ts` | déplacement, rebond et dédoublement de la Bavure ; lancement d'une goutte |
| `src/sim/systems/ricochet.test.ts` | ses tests |

**Modifiés :** `src/sim/data/powerups.ts`, `src/sim/data/upgrades.ts`, `src/sim/components/index.ts`, `src/sim/step.ts`, `src/sim/systems/hazards.ts`, `src/sim/systems/pickup.ts`, `src/sim/powerups/activate.ts`, `src/sim/upgrades/stats.ts`, `src/app/game-state.ts`, `src/app/game.ts`, `src/audio/sounds.ts`, `src/audio/ui.ts`, `src/render/views/hazard.ts`, `src/render/views/pickup.ts`, `src/ui/icons.ts`, `src/ui/components/card.ts`, `src/ui/screens/{upgrade,pause,menu,settings,gameover}.ts`, `src/styles/main.css`, `src/i18n/locales/{fr,en}.json`, et les tests existants cités tâche par tâche.

---

## Task 1 : retirer « Onde de choc »

**Files:**
- Modify: `src/sim/data/upgrades.ts:106-114`
- Modify: `src/sim/data/powerups.ts:157-160`
- Modify: `src/sim/systems/hazards.ts:20-32,55-116`
- Modify: `src/i18n/locales/fr.json:59-60`
- Modify: `src/i18n/locales/en.json:59-60`
- Modify: `src/ui/components/card.test.ts`

**Interfaces:**
- Consumes: rien
- Produces: `RULE_TUNING` ne contient plus que `freezeSpreadRadius`, `freezeSpreadFactor`, `freezeSpreadFloorMs`, `afterburn`. La chaîne `'shockwave'` ne doit plus apparaître nulle part hors de `src/render/fx/shockwave.ts` (l'effet visuel d'onde, sans rapport, piloté par `juice.ts`).

- [ ] **Step 1 : vérifier que le test i18n attrape bien la suppression**

Retirer d'abord la carte, sans toucher aux locales, prouve que le filet existe.

Dans `src/sim/data/upgrades.ts`, supprimer entièrement ce bloc :

```ts
  {
    id: 'shockwave',
    rarity: 'rare',
    stackable: false,
    requires: 'blast',
    apply: (s) => {
      s.rules.add('shockwave')
    },
  },
```

- [ ] **Step 2 : lancer les tests i18n et constater l'échec attendu**

Run: `npx vitest run src/i18n/upgrades.test.ts`
Expected: FAIL — deux échecs « aucune clé de carte ne survit à sa carte », un par locale, listant `upgrade.shockwave.name` et `upgrade.shockwave.desc`.

- [ ] **Step 3 : retirer les clés des deux locales**

Dans `src/i18n/locales/fr.json`, supprimer les deux lignes :

```json
  "upgrade.shockwave.name": "Onde de choc",
  "upgrade.shockwave.desc": "L'explosion repousse les survivants",
```

Dans `src/i18n/locales/en.json`, supprimer les deux lignes :

```json
  "upgrade.shockwave.name": "Shockwave",
  "upgrade.shockwave.desc": "The blast pushes back survivors",
```

- [ ] **Step 4 : relancer les tests i18n**

Run: `npx vitest run src/i18n/upgrades.test.ts src/i18n/parity.test.ts`
Expected: PASS

- [ ] **Step 5 : retirer le réglage de la règle**

Dans `src/sim/data/powerups.ts`, supprimer ces deux lignes de `RULE_TUNING` :

```ts
  /** Onde de choc : anneau juste au-delà du rayon mortel, et vitesse de recul. */
  shockwave: { ringMultiplier: 1.6, impulseSpeed: 600 },
```

- [ ] **Step 6 : retirer la branche de recul du système de zones**

Dans `src/sim/systems/hazards.ts`, retirer `RULE_TUNING` de l'import venant de `../data/powerups` (il n'y servait qu'à l'onde de choc ; `RULE_TUNING.afterburn` est lu par `lifetime.ts`, qui garde le sien).

Puis remplacer le corps de `hazardSystem`, de la ligne `const shockwaveActive = …` jusqu'à la fin du bloc `if (distSq > r * r) { … }`, par :

```ts
export function hazardSystem(world: SimWorld, stats?: RunStats): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale
  // Lu depuis les stats (pas la constante) : « Gel prolongé » doit allonger
  // la durée du gel, y compris pour Givre rampant qui la réutilise.
  const freezeDurationMs = stats?.freezeDurationMs ?? POWERUP_BASE.freeze.durationMs

  const hash = hashFor(world)
  hash.clear()
  for (const eid of targets(world)) {
    hash.insert(eid, Position.x[eid]!, Position.y[eid]!)
  }

  // Sert à la passe de libération ci-dessous, qui doit couvrir toute façon de
  // sortir du tourbillon (zone expirée, ennemi repoussé), pas seulement le
  // cas où la zone est toujours là.
  const capturedThisFrame = new Set<number>()

  for (const hid of hazards(world)) {
    const kind = Hazard.kind[hid]!
    const growth = Hazard.growthRate[hid]!
    if (growth > 0) {
      Hazard.radius[hid] = Math.min(Hazard.maxRadius[hid]!, Hazard.radius[hid]! + growth * dt)
    }

    const hx = Position.x[hid]!
    const hy = Position.y[hid]!
    const hr = Hazard.radius[hid]!

    // Marge dérivée de MAX_ENEMY_RADIUS, jamais en dur : sinon un ennemi plus
    // large ajouté plus tard sortirait de la fenêtre de recherche.
    for (const eid of hash.query(hx, hy, hr + MAX_ENEMY_RADIUS, scratch)) {
      const r = hr + Collider.radius[eid]!
      const dx = Position.x[eid]! - hx
      const dy = Position.y[eid]! - hy
      const distSq = dx * dx + dy * dy

      if (distSq > r * r) {
        continue
      }
```

Le reste de la boucle (les branches `LETHAL`, `HAZARD_FREEZE`, `HAZARD_BLOTTER`) et la passe de libération finale sont **inchangés**.

- [ ] **Step 7 : purger la graine de test qui nomme une carte disparue**

`frameJitter` ne fait que hacher une chaîne : les tests passeraient tels quels, mais une graine nommée d'après une carte supprimée induit en erreur. Dans `src/ui/components/card.test.ts`, remplacer les quatre occurrences de `'shockwave'` par `'creeping-frost'` :

```ts
describe('frameJitter', () => {
  it('rend toujours la même déviation pour une carte et un sommet donnés', () => {
    expect(frameJitter('creeping-frost', 2)).toBe(frameJitter('creeping-frost', 2))
  })

  it('dévie différemment deux sommets de la même carte', () => {
    const sommets = [0, 1, 2, 3].map((i) => frameJitter('creeping-frost', i))
    expect(new Set(sommets).size).toBeGreaterThan(1)
  })

  it('dévie différemment deux cartes au même sommet', () => {
    expect(frameJitter('creeping-frost', 0)).not.toBe(frameJitter('light-step', 0))
  })

  it('reste dans une déviation discrète, jamais un cadre difforme', () => {
    for (const id of ['creeping-frost', 'light-step', 'second-ink', 'afterburn']) {
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(frameJitter(id, i))).toBeLessThanOrEqual(2.5)
      }
    }
  })
})
```

- [ ] **Step 8 : vérifier qu'il ne reste aucune trace**

Run: `grep -rn "shockwave" src | grep -v "fx/shockwave\|shockwaves\|Shockwaves"`
Expected: aucune ligne.

- [ ] **Step 9 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS partout.

- [ ] **Step 10 : commit**

```bash
git add src/sim/data/upgrades.ts src/sim/data/powerups.ts src/sim/systems/hazards.ts src/i18n/locales/fr.json src/i18n/locales/en.json src/ui/components/card.test.ts
git commit -m "feat(sim): retirer « Onde de choc », qui éparpillait ce que la Bombe suivante devait cueillir"
```

---

## Task 2 : la Ronce rend invincible

**Files:**
- Modify: `src/sim/powerups/activate.ts:1-24,86-122`
- Test: `src/sim/systems/collision.test.ts` (nouveau `describe` en fin de fichier)

**Interfaces:**
- Consumes: `activatePowerUp(world, kind, stats, x, y)` — signature inchangée
- Produces: après `activatePowerUp(world, 'bramble', stats, x, y)`, le joueur porte `Invulnerable` avec `remaining = stats.brambleDurationMs + FIXED_DT`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter en fin de `src/sim/systems/collision.test.ts` :

```ts
describe('bouclier de la Ronce d’encre', () => {
  // La couronne est étanche par construction (powerups.test.ts le vérifie sur
  // les trois genres d'ennemis), mais c'est un argument géométrique sur un
  // anneau STATIQUE : un ennemi rapide peut la traverser en un seul pas. Le
  // bouclier est ce qui rend la promesse vraie quoi qu'il arrive.
  it('rend le joueur invulnérable au contact pendant toute la durée de la couronne', () => {
    const w = setup()
    activatePowerUp(w, 'bramble', createRunStats(), 400, 300)
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w)
    expect(w.alive).toBe(true)
  })

  it('redevient mortel une fois la couronne expirée', () => {
    const w = setup()
    const stats = createRunStats()
    activatePowerUp(w, 'bramble', stats, 400, 300)
    // Un pas de plus que la grâce accordée : elle vaut brambleDurationMs + FIXED_DT.
    Invulnerable.remaining[w.playerEid] = FIXED_DT
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w)
    expect(w.alive).toBe(false)
  })

  // collisionSystem expire `Invulnerable` AVANT que lifetimeSystem ne tue les
  // épines : à durée strictement égale, il existe une image où la couronne est
  // encore à l'écran et le joueur redevenu mortel. C'est exactement le piège
  // que le commentaire de `Dashing` raconte avoir déjà vécu.
  it('accorde un pas de marge de plus que la durée des épines', () => {
    const w = setup()
    const stats = createRunStats()
    activatePowerUp(w, 'bramble', stats, 400, 300)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(stats.brambleDurationMs + FIXED_DT, 3)
  })

  // Les tableaux SoA de bitECS ne sont jamais remis à zéro au retrait d'un
  // composant : lire `Invulnerable.remaining` sans `hasComponent` ferait durer
  // la Ronce aussi longtemps que la plus longue invulnérabilité de la partie.
  it('ignore la valeur résiduelle d’une invulnérabilité révolue', () => {
    const w = setup()
    addComponent(w, Invulnerable, w.playerEid)
    Invulnerable.remaining[w.playerEid] = 999_999
    removeComponent(w, Invulnerable, w.playerEid)
    const stats = createRunStats()
    activatePowerUp(w, 'bramble', stats, 400, 300)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(stats.brambleDurationMs + FIXED_DT, 3)
  })

  // Un Halo brisé pose 1000 ms. Ramasser une Ronce dans la seconde qui suit ne
  // doit jamais raccourcir cette grâce.
  it('garde la plus longue des deux grâces', () => {
    const w = setup()
    addComponent(w, Invulnerable, w.playerEid)
    Invulnerable.remaining[w.playerEid] = 60_000
    activatePowerUp(w, 'bramble', createRunStats(), 400, 300)
    expect(Invulnerable.remaining[w.playerEid]).toBe(60_000)
  })
})
```

Compléter les imports en tête de `src/sim/systems/collision.test.ts` :

```ts
import { addComponent, defineQuery, entityExists, hasComponent, removeComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Enemy, Halo, Invulnerable, Position, Velocity } from '../components'
import { activatePowerUp } from '../powerups/activate'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '../world'
import { collisionSystem } from './collision'
import { deathSystem } from './death'
```

- [ ] **Step 2 : lancer et constater l'échec**

Run: `npx vitest run src/sim/systems/collision.test.ts -t "Ronce"`
Expected: FAIL — le joueur meurt au premier test, et `Invulnerable.remaining` vaut `undefined` aux suivants.

- [ ] **Step 3 : poser le bouclier à l'activation**

Dans `src/sim/powerups/activate.ts`, ajouter `hasComponent` à l'import bitECS, `Invulnerable` aux composants, et `FIXED_DT` à l'import du monde :

```ts
import { addComponent, addEntity, hasComponent } from 'bitecs'

import {
  Attractor,
  Dashing,
  Facing,
  Halo,
  Hazard,
  Invulnerable,
  Lifetime,
  Orbiting,
  Position,
  PrevPosition,
} from '../components'
```

```ts
import { FIXED_DT, type SimWorld } from '../world'
```

Puis, dans la branche `case 'bramble'`, juste avant le `break`, après la boucle qui crée les épines :

```ts
      // La couronne est étanche par géométrie, mais l'étanchéité raisonne sur
      // un anneau STATIQUE : un ennemi assez rapide la traverse en un seul pas
      // de simulation. Le bouclier fait tenir la promesse quoi qu'il arrive.
      //
      // `+ FIXED_DT` : `collisionSystem` expire `Invulnerable` AVANT que
      // `lifetimeSystem` ne tue les épines (voir l'ordre dans step.ts). À durée
      // strictement égale, il existe une image où la couronne est encore à
      // l'écran et le joueur redevenu mortel — le piège que le commentaire de
      // `Dashing`, plus bas, raconte avoir déjà vécu.
      //
      // `hasComponent` et non une lecture directe : les tableaux SoA de bitECS
      // ne sont jamais remis à zéro au retrait d'un composant, donc
      // `Invulnerable.remaining[player]` peut encore porter la valeur d'une
      // grâce révolue. Le `Math.max` garde la plus longue des deux, pour qu'une
      // Ronce ramassée juste après un Halo brisé n'écourte pas sa seconde.
      const grace = stats.brambleDurationMs + FIXED_DT
      const current = hasComponent(world, Invulnerable, player)
        ? Invulnerable.remaining[player]!
        : 0
      addComponent(world, Invulnerable, player)
      Invulnerable.remaining[player] = Math.max(current, grace)
      break
```

- [ ] **Step 4 : relancer**

Run: `npx vitest run src/sim/systems/collision.test.ts`
Expected: PASS, tests existants compris.

- [ ] **Step 5 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 6 : commit**

```bash
git add src/sim/powerups/activate.ts src/sim/systems/collision.test.ts
git commit -m "feat(sim): la Ronce rend invincible, car l'étanchéité de la couronne ne survit pas à un pas rapide"
```

---

## Task 3 : sortir le Buvard du tirage

**Files:**
- Modify: `src/sim/data/powerups.ts` (après `POWERUP_WEIGHT`)
- Modify: `src/sim/systems/pickup.ts:1-38`
- Test: `src/sim/data/powerups.test.ts`

**Interfaces:**
- Consumes: `POWERUP_KINDS`, `POWERUP_WEIGHT`
- Produces: `POWERUP_DISABLED: ReadonlySet<PowerUpKind>` et `POWERUP_DRAWABLE: readonly PowerUpKind[]`, exportés depuis `src/sim/data/powerups.ts`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter en fin de `src/sim/data/powerups.test.ts` :

```ts
/**
 * Le Buvard est désactivé, pas supprimé : il garde son identifiant, son poids
 * et tout son code. Un poids nul aurait fait la même chose en apparence, mais
 * `powerups.test.ts` exige un poids strictement positif — précisément parce
 * qu'un zéro se lit comme un oubli, là où un ensemble nommé dit ce qu'il fait.
 */
describe('genres retirés du tirage', () => {
  it('ne désactive que des genres qui existent', () => {
    for (const kind of POWERUP_DISABLED) {
      expect([...POWERUP_KINDS], `« ${kind} » désactivé mais absent de POWERUP_KINDS`).toContain(
        kind,
      )
    }
  })

  it('laisse le sac de tirage non vide', () => {
    expect(POWERUP_DRAWABLE.length).toBeGreaterThan(0)
  })

  it('exclut du sac exactement les genres désactivés', () => {
    const attendu = POWERUP_KINDS.filter((kind) => !POWERUP_DISABLED.has(kind))
    expect([...POWERUP_DRAWABLE]).toEqual(attendu)
  })

  // La désactivation ne touche pas l'identité : le Buvard doit rester
  // interprétable si une sauvegarde ou un test le pose au sol à la main.
  it('garde un identifiant et un poids aux genres désactivés', () => {
    for (const kind of POWERUP_DISABLED) {
      expect(POWERUP_ID[kind]).toBeGreaterThan(0)
      expect(POWERUP_WEIGHT[kind]).toBeGreaterThan(0)
    }
  })
})
```

Ajouter `POWERUP_DISABLED` et `POWERUP_DRAWABLE` à l'import en tête du fichier :

```ts
import {
  POWERUP_BASE,
  POWERUP_BY_ID,
  POWERUP_DISABLED,
  POWERUP_DRAWABLE,
  POWERUP_ID,
  POWERUP_KINDS,
  POWERUP_WEIGHT,
  type PowerUpKind,
} from './powerups'
```

Ajouter aussi, dans `src/sim/systems/pickup.test.ts` s'il existe, ou créer le fichier avec :

```ts
import { defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Pickup } from '../components'
import { POWERUP_BY_ID, POWERUP_DISABLED } from '../data/powerups'
import { createWorld } from '../world'
import { spawnPickup } from './pickup'

const pickupsIn = defineQuery([Pickup])

describe('sac de tirage des pastilles', () => {
  // 400 tirages sur des graines variées : assez pour qu'un genre de poids 1
  // sur ~20 sorte des dizaines de fois s'il est dans le sac.
  it('ne pose jamais au sol un genre désactivé', () => {
    for (let seed = 0; seed < 20; seed++) {
      const w = createWorld({ seed, width: 800, height: 600 })
      for (let i = 0; i < 20; i++) {
        spawnPickup(w)
      }
      for (const eid of pickupsIn(w)) {
        const kind = POWERUP_BY_ID[Pickup.kind[eid]!]
        expect(kind, 'identifiant de pastille inconnu').not.toBeUndefined()
        expect(POWERUP_DISABLED.has(kind!), `« ${kind} » est sorti du sac malgré sa désactivation`).toBe(
          false,
        )
      }
    }
  })
})
```

- [ ] **Step 2 : lancer et constater l'échec**

Run: `npx vitest run src/sim/data/powerups.test.ts src/sim/systems/pickup.test.ts`
Expected: FAIL — `POWERUP_DISABLED` et `POWERUP_DRAWABLE` n'existent pas (erreur d'import / de compilation).

- [ ] **Step 3 : déclarer l'ensemble et le sac**

Dans `src/sim/data/powerups.ts`, juste après le bloc `POWERUP_WEIGHT` :

```ts
/**
 * Genres retirés du sac de tirage sans être supprimés : identifiant, poids et
 * code restent en place, une ligne à retirer les remet en jeu.
 *
 * Un poids à zéro aurait produit le même effet visible, mais `powerups.test.ts`
 * exige un poids strictement positif pour chaque genre — un zéro y serait
 * indistinguable d'un oubli, là où un ensemble nommé dit ce qu'il fait.
 *
 * Le Buvard sort ici parce que son tourbillon plaisait moins qu'il ne
 * dérangeait. Sa carte « Papier assoiffé » n'a rien à faire de son côté :
 * `draw.ts` conditionne toute carte à `seenPowerups`, elle cesse d'être
 * tirable d'elle-même et reviendra pareillement d'elle-même.
 */
export const POWERUP_DISABLED: ReadonlySet<PowerUpKind> = new Set<PowerUpKind>(['blotter'])

/** Les genres réellement tirables. Seul `pickup.ts` doit consulter cette liste. */
export const POWERUP_DRAWABLE: readonly PowerUpKind[] = POWERUP_KINDS.filter(
  (kind) => !POWERUP_DISABLED.has(kind),
)
```

- [ ] **Step 4 : faire tirer le sac dans la bonne liste**

Dans `src/sim/systems/pickup.ts`, remplacer `POWERUP_KINDS` par `POWERUP_DRAWABLE` dans l'import, dans le total et dans le tirage :

```ts
import {
  PICKUP_LIFE_MS,
  PICKUP_RADIUS,
  POWERUP_BY_ID,
  POWERUP_DRAWABLE,
  POWERUP_ID,
  POWERUP_WEIGHT,
  type PowerUpKind,
} from '../data/powerups'
```

```ts
const POWERUP_WEIGHT_TOTAL = POWERUP_DRAWABLE.reduce((sum, kind) => sum + POWERUP_WEIGHT[kind], 0)

/**
 * Tirage pondéré par somme cumulée, un seul appel à `world.rng.next()`. Le
 * repli sur le dernier genre après la boucle n'est pas décoratif : l'arrondi
 * flottant peut faire que la somme cumulée n'atteigne jamais `threshold` sur
 * le dernier terme.
 */
function drawPowerUpKind(world: SimWorld): PowerUpKind {
  const threshold = world.rng.next() * POWERUP_WEIGHT_TOTAL
  let cumulative = 0
  for (const kind of POWERUP_DRAWABLE) {
    cumulative += POWERUP_WEIGHT[kind]
    if (threshold < cumulative) {
      return kind
    }
  }
  return POWERUP_DRAWABLE[POWERUP_DRAWABLE.length - 1]!
}
```

- [ ] **Step 5 : relancer**

Run: `npx vitest run src/sim/data/powerups.test.ts src/sim/systems/pickup.test.ts`
Expected: PASS

- [ ] **Step 6 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 7 : commit**

```bash
git add src/sim/data/powerups.ts src/sim/systems/pickup.ts src/sim/data/powerups.test.ts src/sim/systems/pickup.test.ts
git commit -m "feat(sim): sortir le Buvard du tirage sans le supprimer"
```

---

## Task 4 : le minuteur du décompte

**Files:**
- Create: `src/app/countdown.ts`
- Test: `src/app/countdown.test.ts`

**Interfaces:**
- Consumes: rien
- Produces:
  - `COUNTDOWN_STEP_MS = 600`, `COUNTDOWN_DIGITS = 3`, `COUNTDOWN_MS = 1800`
  - `countdownDigitAt(elapsedMs: number): number`
  - `createCountdown(): Countdown` où `Countdown = { readonly digit: number; readonly done: boolean; start(): void; update(dtMs: number): void }`

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `src/app/countdown.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import {
  COUNTDOWN_DIGITS,
  COUNTDOWN_MS,
  COUNTDOWN_STEP_MS,
  countdownDigitAt,
  createCountdown,
} from './countdown'

describe('countdownDigitAt', () => {
  it('part du plus grand chiffre', () => {
    expect(countdownDigitAt(0)).toBe(COUNTDOWN_DIGITS)
  })

  it('tient un chiffre pendant tout son palier', () => {
    expect(countdownDigitAt(COUNTDOWN_STEP_MS - 1)).toBe(3)
    expect(countdownDigitAt(COUNTDOWN_STEP_MS)).toBe(2)
    expect(countdownDigitAt(COUNTDOWN_STEP_MS * 2 - 1)).toBe(2)
    expect(countdownDigitAt(COUNTDOWN_STEP_MS * 2)).toBe(1)
  })

  // 0 et non 3 : la vue distingue « plus rien à afficher » de « ça recommence ».
  it('tombe à zéro une fois le décompte fini', () => {
    expect(countdownDigitAt(COUNTDOWN_MS)).toBe(0)
    expect(countdownDigitAt(COUNTDOWN_MS * 10)).toBe(0)
  })
})

describe('createCountdown', () => {
  it('naît terminé, pour ne rien afficher avant le premier start', () => {
    expect(createCountdown().done).toBe(true)
  })

  it('affiche le premier chiffre dès le démarrage', () => {
    const c = createCountdown()
    c.start()
    expect(c.done).toBe(false)
    expect(c.digit).toBe(COUNTDOWN_DIGITS)
  })

  it('descend chiffre par chiffre puis se termine', () => {
    const c = createCountdown()
    c.start()
    const vus: number[] = [c.digit]
    for (let i = 0; i < COUNTDOWN_DIGITS; i++) {
      c.update(COUNTDOWN_STEP_MS)
      vus.push(c.digit)
    }
    expect(vus).toEqual([3, 2, 1, 0])
    expect(c.done).toBe(true)
  })

  // Un onglet remis au premier plan livre son retard en une fois. `game.ts`
  // plafonne déjà `dt`, mais le module ne s'y fie pas : il doit terminer,
  // jamais sauter dans un état incohérent.
  it('termine proprement sur un pas de temps énorme', () => {
    const c = createCountdown()
    c.start()
    c.update(60_000)
    expect(c.done).toBe(true)
    expect(c.digit).toBe(0)
  })

  it('ignore un pas de temps négatif', () => {
    const c = createCountdown()
    c.start()
    c.update(-5_000)
    expect(c.digit).toBe(COUNTDOWN_DIGITS)
    expect(c.done).toBe(false)
  })

  it('se relance à neuf après un start', () => {
    const c = createCountdown()
    c.start()
    c.update(COUNTDOWN_MS)
    c.start()
    expect(c.done).toBe(false)
    expect(c.digit).toBe(COUNTDOWN_DIGITS)
  })
})
```

- [ ] **Step 2 : lancer et constater l'échec**

Run: `npx vitest run src/app/countdown.test.ts`
Expected: FAIL — `Failed to resolve import "./countdown"`.

- [ ] **Step 3 : écrire le minuteur**

Créer `src/app/countdown.ts` :

```ts
/**
 * Le décompte de reprise. Sortir d'une pause ou d'un choix de carte relançait
 * la simulation à l'image suivante, sans laisser le temps de retrouver le
 * point ; trois chiffres s'intercalent désormais.
 *
 * Piloté par l'horloge réelle, comme `render/fx/death-sequence.ts` et pour la
 * même raison : pendant le décompte, la simulation ne fait aucun pas — son
 * horloge est arrêtée, elle ne peut rien cadencer.
 *
 * Aucun DOM, aucun Pixi : la mise en scène vit dans `ui/screens/countdown.ts`,
 * ce module ne connaît que des millisecondes.
 */

/** Durée d'affichage d'un chiffre, en ms. */
export const COUNTDOWN_STEP_MS = 600
/** Nombre de chiffres affichés : 3, 2, 1. */
export const COUNTDOWN_DIGITS = 3
/** Durée totale, et donc durée de l'état `countdown`. */
export const COUNTDOWN_MS = COUNTDOWN_DIGITS * COUNTDOWN_STEP_MS

export interface Countdown {
  /** 3, 2 ou 1 pendant le décompte ; 0 une fois terminé. */
  readonly digit: number
  readonly done: boolean
  start(): void
  update(dtMs: number): void
}

/**
 * Chiffre affiché à `elapsedMs` du début. Exportée à part de l'instance : le
 * découpage en paliers se teste sans avoir à simuler une horloge.
 *
 * Rend 0 une fois fini, jamais 3 : la vue doit pouvoir distinguer « plus rien
 * à afficher » de « ça recommence ».
 */
export function countdownDigitAt(elapsedMs: number): number {
  if (elapsedMs >= COUNTDOWN_MS) {
    return 0
  }
  return COUNTDOWN_DIGITS - Math.floor(Math.max(0, elapsedMs) / COUNTDOWN_STEP_MS)
}

export function createCountdown(): Countdown {
  // Naît terminé : un `update` reçu avant tout `start` ne doit rien afficher.
  let elapsed = COUNTDOWN_MS

  return {
    get digit(): number {
      return countdownDigitAt(elapsed)
    },
    get done(): boolean {
      return elapsed >= COUNTDOWN_MS
    },
    start(): void {
      elapsed = 0
    },
    update(dtMs: number): void {
      // Écrêté aux deux bouts : un `dt` négatif (horloge qui recule) ne doit
      // pas faire remonter le décompte, un `dt` énorme (onglet remis au premier
      // plan) doit le terminer plutôt que de le dépasser sans borne.
      elapsed = Math.min(COUNTDOWN_MS, elapsed + Math.max(0, dtMs))
    },
  }
}
```

- [ ] **Step 4 : relancer**

Run: `npx vitest run src/app/countdown.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 6 : commit**

```bash
git add src/app/countdown.ts src/app/countdown.test.ts
git commit -m "feat(app): un minuteur de décompte, sur l'horloge réelle faute d'horloge de simulation"
```

---

## Task 5 : l'état `countdown` dans la machine à états

**Files:**
- Modify: `src/app/game-state.ts:1-25`
- Test: `src/app/game-state.test.ts`

**Interfaces:**
- Consumes: rien
- Produces: `GameState` gagne `'countdown'`, `GameEvent` gagne `'COUNTDOWN_DONE'`. `wavePause + UPGRADE_CHOSEN` et `paused + RESUME` mènent désormais à `countdown`, plus à `playing`.

- [ ] **Step 1 : écrire les tests qui échouent**

**Deux tests existants deviennent faux** — ce sont eux qui prouvent que la reprise a bien changé de forme. Dans `src/app/game-state.test.ts`, remplacer `'wavePause → playing sur UPGRADE_CHOSEN'` par :

```ts
  it('wavePause → countdown sur UPGRADE_CHOSEN', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('WAVE_END')
    m.send('UPGRADE_CHOSEN')
    expect(m.state).toBe('countdown')
  })
```

et remplacer `'playing ↔ paused'` par :

```ts
  it('playing ↔ paused, la reprise repassant par le décompte', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('PAUSE')
    expect(m.state).toBe('paused')
    m.send('RESUME')
    m.send('COUNTDOWN_DONE')
    expect(m.state).toBe('playing')
  })
```

Puis ajouter en fin de `describe` :

```ts
  it('paused → countdown sur RESUME', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('PAUSE')
    m.send('RESUME')
    expect(m.state).toBe('countdown')
  })

  it('countdown → playing sur COUNTDOWN_DONE', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('PAUSE')
    m.send('RESUME')
    m.send('COUNTDOWN_DONE')
    expect(m.state).toBe('playing')
  })

  // Échap pendant le décompte doit remettre en pause, pas laisser filer.
  it('countdown → paused sur PAUSE', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('PAUSE')
    m.send('RESUME')
    m.send('PAUSE')
    expect(m.state).toBe('paused')
  })

  // Le début de partie a déjà sa mise en scène (l'arrivée du curseur) : les
  // deux se superposeraient.
  it('démarrer et relancer une partie ne passent pas par le décompte', () => {
    const m = createGameStateMachine()
    m.send('START')
    expect(m.state).toBe('playing')

    m.send('DIED')
    m.send('DEATH_ANIM_DONE')
    m.send('RESTART')
    expect(m.state).toBe('playing')
  })
```

- [ ] **Step 2 : lancer et constater l'échec**

Run: `npx vitest run src/app/game-state.test.ts`
Expected: FAIL — les envois de `COUNTDOWN_DONE` sont ignorés et l'état reste `playing` après `UPGRADE_CHOSEN` / `RESUME`.

- [ ] **Step 3 : ajouter l'état et l'événement**

Dans `src/app/game-state.ts`, remplacer les trois premiers blocs :

```ts
export type GameState =
  | 'menu'
  | 'playing'
  | 'wavePause'
  | 'countdown'
  | 'dying'
  | 'gameover'
  | 'paused'

export type GameEvent =
  | 'START'
  | 'WAVE_END'
  | 'UPGRADE_CHOSEN'
  | 'COUNTDOWN_DONE'
  | 'DIED'
  | 'DEATH_ANIM_DONE'
  | 'RESTART'
  | 'PAUSE'
  | 'RESUME'
  | 'QUIT'

// Table de transitions explicite : un état absent de la clé d'un état donné
// est ignoré silencieusement par `send`, ce qui est le comportement voulu —
// une entrée non gérée par l'UI (double clic, race d'input) ne doit jamais
// faire planter la machine.
//
// `countdown` s'intercale sur les deux reprises — sortie de pause, carte
// choisie — et sur elles seules. `START` et `RESTART` mènent toujours
// directement à `playing` : le début d'une partie a déjà sa mise en scène,
// l'arrivée du curseur, et les deux se superposeraient.
const TRANSITIONS: Record<GameState, Partial<Record<GameEvent, GameState>>> = {
  menu: { START: 'playing' },
  playing: { WAVE_END: 'wavePause', DIED: 'dying', PAUSE: 'paused' },
  wavePause: { UPGRADE_CHOSEN: 'countdown', PAUSE: 'paused' },
  countdown: { COUNTDOWN_DONE: 'playing', PAUSE: 'paused' },
  dying: { DEATH_ANIM_DONE: 'gameover' },
  gameover: { RESTART: 'playing', QUIT: 'menu' },
  paused: { RESUME: 'countdown', QUIT: 'menu' },
}
```

- [ ] **Step 4 : relancer**

Run: `npx vitest run src/app/game-state.test.ts`
Expected: PASS

- [ ] **Step 5 : typecheck — il doit signaler les branches de `game.ts` non traitées**

Run: `npm run typecheck`
Expected: PASS. `game.ts` compare `machine.state` à des littéraux, il ne fait pas d'exhaustivité : rien ne casse ici, le branchement vient à la tâche 6.

- [ ] **Step 6 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 7 : commit**

```bash
git add src/app/game-state.ts src/app/game-state.test.ts
git commit -m "feat(app): intercaler un état de décompte sur les deux reprises"
```

---

## Task 6 : l'écran de décompte, son son, et son branchement

**Files:**
- Create: `src/ui/screens/countdown.ts`
- Modify: `src/styles/main.css` (après `.hud-punch`)
- Modify: `src/audio/sounds.ts` (après `NAV_VOICE`)
- Modify: `src/audio/ui.ts`
- Modify: `src/app/game.ts`

**Interfaces:**
- Consumes: `createCountdown`, `COUNTDOWN_DIGITS` (tâche 4) ; l'état `'countdown'` et l'événement `'COUNTDOWN_DONE'` (tâche 5)
- Produces:
  - `createCountdownScreen(root: HTMLElement): CountdownScreen` où `CountdownScreen = { show(): void; update(digit: number): void; hide(): void }`
  - `countdownVoice(digit: number): VoiceSpec` dans `src/audio/sounds.ts`
  - `playCountdownTick(digit: number): void` dans `src/audio/ui.ts`
  - La classe CSS `.countdown-pop`

- [ ] **Step 1 : la voix**

Dans `src/audio/sounds.ts`, ajouter après la constante `NAV_VOICE` :

```ts
/**
 * Tic du décompte de reprise. Le dernier chiffre monte d'une quinte et tient
 * plus longtemps : le joueur doit entendre que ça repart, pas seulement que
 * ça compte.
 */
export function countdownVoice(digit: number): VoiceSpec {
  const last = digit <= 1
  return {
    source: 'tone',
    freq: last ? 660 : 440,
    durationMs: last ? 200 : 110,
    gain: 0.16,
  }
}
```

- [ ] **Step 2 : le point d'entrée écran**

Dans `src/audio/ui.ts`, ajouter `countdownVoice` à l'import et la fonction en fin de fichier :

```ts
import { cardVoices, countdownVoice, NAV_VOICE } from './sounds'
```

```ts
/** Un tic par chiffre du décompte de reprise. */
export function playCountdownTick(digit: number): void {
  engine?.play(countdownVoice(digit))
}
```

- [ ] **Step 3 : l'animation CSS**

Dans `src/styles/main.css`, ajouter à la fin :

```css
/* Chaque chiffre du décompte de reprise arrive en s'affaissant, comme un
   tampon qu'on pose. Relancé par `countdown.ts` (ui/screens) à chaque
   changement de chiffre. Coupé par les deux gardes de mouvement réduit
   ci-dessus, qui ramènent toute animation à 0,001 ms : sous mouvement réduit
   le chiffre apparaît sec, ce qui reste parfaitement lisible. */
@keyframes countdown-pop {
  0% {
    opacity: 0.2;
    transform: scale(1.6);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.countdown-pop {
  animation: countdown-pop 260ms ease-out;
}
```

- [ ] **Step 4 : l'écran**

Créer `src/ui/screens/countdown.ts` :

```ts
export interface CountdownScreen {
  show(): void
  /** Repose le chiffre ; ne relance l'animation que quand il change réellement. */
  update(digit: number): void
  hide(): void
}

/**
 * Le décompte de reprise. Deux partis pris qui le distinguent des autres
 * écrans :
 *
 * — **Ni voile sombre ni `backdrop-blur`**, contrairement à `pause.ts` et
 *   `upgrade.ts`. L'arène gelée doit rester parfaitement lisible pendant qu'on
 *   se rassemble : c'est tout l'intérêt de la mesure, pas l'attente.
 * — **`pointer-events-none`** : l'écran n'intercepte rien, `app/game.ts` garde
 *   la main sur le clavier (Échap remet en pause).
 *
 * Aucun i18n : un chiffre est un chiffre.
 */
export function createCountdownScreen(root: HTMLElement): CountdownScreen {
  const el = document.createElement('div')
  el.className = 'pointer-events-none absolute inset-0 hidden items-center justify-center text-paper'

  const digitEl = document.createElement('div')
  digitEl.className = 'ui-huge leading-none opacity-80'
  el.appendChild(digitEl)
  root.appendChild(el)

  // -1 et non 0 : 0 est le chiffre « plus rien à afficher », qui doit lui aussi
  // pouvoir être posé une fois.
  let shown = -1

  return {
    show(): void {
      shown = -1
      el.classList.remove('hidden')
      el.classList.add('flex')
    },

    update(digit: number): void {
      if (digit === shown) {
        return
      }
      shown = digit
      digitEl.textContent = digit > 0 ? String(digit) : ''
      // Retrait / lecture forcée / ajout : une animation CSS déjà posée ne se
      // relance pas seule (même patron que `hud.punch`).
      digitEl.classList.remove('countdown-pop')
      void digitEl.offsetWidth
      digitEl.classList.add('countdown-pop')
    },

    hide(): void {
      el.classList.add('hidden')
      el.classList.remove('flex')
    },
  }
}
```

- [ ] **Step 5 : brancher dans `game.ts` — les imports**

Dans `src/app/game.ts`, ajouter aux imports existants :

```ts
import { bindUiAudio, playCountdownTick } from '@/audio/ui'
import { createCountdownScreen } from '@/ui/screens/countdown'
import { createCountdown } from './countdown'
```

(la ligne `import { bindUiAudio } from '@/audio/ui'` est **remplacée** par la première ci-dessus)

- [ ] **Step 6 : brancher dans `game.ts` — l'instance et l'écran**

Après `const gameOverScreen = createGameOverScreen(uiRoot)`, ajouter :

```ts
  const countdownScreen = createCountdownScreen(uiRoot)
  const countdown = createCountdown()

  /**
   * Toute reprise passe par là. `mouse.forgetTarget()` y est remonté depuis les
   * deux appelants : sans lui, le premier pas viserait le bouton ou la carte
   * qu'on vient de cliquer.
   */
  function beginCountdown(): void {
    mouse.forgetTarget()
    countdown.start()
    countdownScreen.show()
    countdownScreen.update(countdown.digit)
    playCountdownTick(countdown.digit)
  }
```

- [ ] **Step 7 : brancher dans `game.ts` — les deux reprises**

Remplacer le `onResume` de `createPauseScreen` :

```ts
    onResume(): void {
      machine.send('RESUME')
      pauseScreen.hide()
      beginCountdown()
    },
```

Remplacer la fin de `onCardChosen` (les trois dernières lignes, `mouse.forgetTarget()` comprise) :

```ts
    machine.send('UPGRADE_CHOSEN')
    upgradeScreen.hide()
    beginCountdown()
  }
```

- [ ] **Step 8 : brancher dans `game.ts` — l'avancée par image**

Dans `frame()`, juste après le bloc `if (machine.state === 'dying') { … }` et **avant** `loop.advance(dt)` :

```ts
    if (machine.state === 'countdown') {
      const before = countdown.digit
      countdown.update(dt)
      const digit = countdown.digit
      // Le tic du premier chiffre est joué par `beginCountdown` ; ici, seuls
      // les changements. `digit > 0` : la fin du décompte n'a pas son tic à
      // elle, c'est le jeu qui reprend qui la signale.
      if (digit !== before && digit > 0) {
        playCountdownTick(digit)
      }
      countdownScreen.update(digit)
      if (countdown.done) {
        machine.send('COUNTDOWN_DONE')
        countdownScreen.hide()
      }
    }
```

- [ ] **Step 9 : brancher dans `game.ts` — le curseur et le réticule**

Remplacer `syncCursorVisibility` :

```ts
  // Masqué pendant le jeu effectif (`playing`, `dying`) ET pendant le décompte
  // de reprise : sans cela le curseur système reparaîtrait pour 1,8 s à chaque
  // vague. Conséquence voulue — `stage.setAimTarget` est conditionné à
  // `cursorHidden`, donc le réticule s'affiche pendant le décompte et le joueur
  // voit où le point va filer avant que ça reparte.
  let cursorHidden = false
  function syncCursorVisibility(): void {
    const hidden =
      machine.state === 'playing' || machine.state === 'dying' || machine.state === 'countdown'
    if (hidden === cursorHidden) {
      return
    }
    cursorHidden = hidden
    document.body.classList.toggle('cursor-hidden', hidden)
  }
```

- [ ] **Step 10 : brancher dans `game.ts` — Échap pendant le décompte**

Dans l'écouteur `keydown`, remplacer le bloc final `if (e.code === 'Escape' && machine.state === 'playing')` par :

```ts
    // Volontairement pas depuis `wavePause` : la machine à états n'a pas de
    // retour de `paused` vers `wavePause`, y entrer perdrait la carte en cours
    // de choix. Depuis `countdown`, en revanche, remettre en pause est le
    // comportement attendu — le joueur n'a pas encore repris la main.
    if (e.code === 'Escape' && (machine.state === 'playing' || machine.state === 'countdown')) {
      countdownScreen.hide()
      machine.send('PAUSE')
      pauseScreen.show()
    }
```

- [ ] **Step 11 : vérifier à l'œil dans le jeu**

Run: `npm run dev`

Vérifier, dans l'ordre :
1. Lancer une partie, `Échap`, « Reprendre » → le décompte 3-2-1 s'affiche sur l'arène **visible et gelée**, sans voile ni flou.
2. Aucun ennemi ne bouge pendant le décompte.
3. En mode souris (Réglages → Déplacement → Souris) : le réticule est visible pendant le décompte, le curseur système ne l'est pas.
4. Survivre à une vague, choisir une carte → le décompte s'affiche aussi.
5. `Échap` **pendant** le décompte → l'écran de pause revient, le chiffre disparaît.
6. Trois tics audio, le dernier plus haut.
7. Mourir puis « rejouer » → **pas** de décompte.

- [ ] **Step 12 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 13 : commit**

```bash
git add src/ui/screens/countdown.ts src/styles/main.css src/audio/sounds.ts src/audio/ui.ts src/app/game.ts
git commit -m "feat(ui): un décompte 3-2-1 à la reprise, sur une arène qu'on voit encore"
```

---

## Task 7 : la rampe typographique et les cartes

**Files:**
- Modify: `src/styles/main.css` (après le bloc `@font-face`)
- Modify: `src/ui/icons.ts:20-21`
- Modify: `src/ui/components/card.ts:48-71`
- Modify: `src/ui/screens/upgrade.ts:15-16,38-45`

**Interfaces:**
- Consumes: rien
- Produces: la variable CSS `--ui` sur `#ui`, les utilitaires `ui-2xs` `ui-xs` `ui-sm` `ui-base` `ui-lg` `ui-2xl` `ui-huge`, et `icon(kind, size)` accepte désormais une chaîne CSS en plus d'un nombre.

- [ ] **Step 1 : poser la rampe**

Dans `src/styles/main.css`, insérer juste après le second bloc `@font-face` (celui de Kalam) :

```css
/* Échelle typographique des écrans DOM.
   Elle vit sur `#ui` et non sur `html` : le HUD est déjà mis à l'échelle par
   un `transform` calé sur le zoom de l'arène (`hud.setViewport`), et les
   classes Tailwind en `rem` qu'il utilise auraient grandi une seconde fois.
   Les utilitaires ci-dessous sont opt-in — le HUD n'en emploie aucun, donc
   rien ne change pour lui.

   `vh` et non `vw` : l'arène est en 16:9 et cadrée par sa dimension la plus
   contrainte ; sur une fenêtre large et basse, c'est la hauteur qui dit la
   taille réellement perçue.

   Le plancher de 18 px est au-dessus de l'existant, pas à son niveau : une
   rampe calée pour égaler l'ancien à 720 p n'agrandirait rien sur la
   résolution la plus courante. Le plafond de 30 px existe pour la 4 K, où
   `1.4vh` seul donnerait des cartes de 360 px — passé une certaine taille,
   agrandir ne rend plus rien plus lisible. */
#ui {
  --ui: clamp(18px, 1.4vh + 8px, 30px);
}

/* Toutes les tailles dérivent de `--ui`, jamais du parent : imbriquer deux
   utilitaires ne compose pas les facteurs, contrairement à un usage direct
   de `em`. */
@utility ui-2xs {
  font-size: calc(var(--ui) * 0.58);
}
@utility ui-xs {
  font-size: calc(var(--ui) * 0.68);
}
@utility ui-sm {
  font-size: calc(var(--ui) * 0.82);
}
@utility ui-base {
  font-size: calc(var(--ui) * 1);
}
@utility ui-lg {
  font-size: calc(var(--ui) * 1.15);
}
@utility ui-2xl {
  font-size: calc(var(--ui) * 1.5);
}
@utility ui-huge {
  font-size: calc(var(--ui) * 4.5);
}
```

- [ ] **Step 2 : laisser les pictogrammes suivre le texte qui les entoure**

Dans `src/ui/icons.ts`, remplacer la dernière ligne :

```ts
/**
 * `size` accepte un nombre (pixels, comme avant) ou une chaîne CSS : les
 * cartes passent `'1em'` pour que le pictogramme suive la taille de police du
 * bloc qui le contient, et donc la rampe `--ui`.
 */
export const icon = (kind: PowerUpKind, size: number | string = 24): string =>
  `<svg viewBox="0 0 56 56" width="${size}" height="${size}" aria-hidden="true">${POWERUP_ICONS[kind]}</svg>`
```

- [ ] **Step 3 : convertir la carte**

Dans `src/ui/components/card.ts`, remplacer entièrement `renderCard` :

```ts
export function renderCard(card: UpgradeDef, selected: boolean): string {
  const iconKind = card.requires ?? 'blast'
  const r = RARITY[card.rarity]
  // `1em` et non une taille en pixels : le pictogramme suit la taille de police
  // du bloc qui le porte, donc la rampe `--ui` (main.css).
  const glyph = icon(iconKind, '1em')
  const frames = [inkFrame(card.id, 4, 0)]
  if (r.traits > 1) {
    frames.push(inkFrame(card.id, 9, 11))
  }
  return `
    <div class="relative aspect-[5/7] w-[calc(var(--ui)*9.5)] overflow-hidden rounded ${r.body} transition-transform ${selected ? 'scale-105' : 'scale-95 opacity-70'}">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
        ${frames.map((d, i) => `<path d="${d}" fill="none" class="${r.stroke}" stroke-width="${i === 0 ? 1.2 : 0.8}" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`).join('')}
      </svg>
      <div class="absolute left-[0.5em] top-[0.5em] text-[calc(var(--ui)*0.85)] opacity-80">${glyph}</div>
      <div class="absolute bottom-[0.5em] right-[0.5em] rotate-180 text-[calc(var(--ui)*0.85)] opacity-80">${glyph}</div>
      <div class="flex h-full flex-col items-center justify-center gap-[calc(var(--ui)*0.5)] px-[calc(var(--ui)*1)] text-center">
        <span class="text-[calc(var(--ui)*1.85)]">${glyph}</span>
        <h3 class="ui-sm leading-tight">${t(`upgrade.${card.id}.name`)}</h3>
        <p class="ui-xs leading-snug opacity-75">${t(`upgrade.${card.id}.desc`)}</p>
        <span class="ui-2xs mt-[0.3em] tracking-[0.2em] opacity-60">${t(`rarity.${card.rarity}`)}</span>
      </div>
    </div>
  `
}
```

**La règle des unités, et le piège qu'elle évite.** `#ui` ne déclare qu'une *custom property* — `--ui` n'est pas un `font-size`. Un `em` posé sur un bloc dont **aucun ancêtre** ne fixe de `font-size` réel retombe donc sur le défaut du navigateur (16 px), figé, indépendant de la résolution : le texte grandirait pendant que les espacements resteraient immobiles, et la carte se déformerait selon l'écran.

D'où deux cas, à distinguer à chaque fois :

- **Le bloc porte une taille de police** (un utilitaire `ui-*`, ou un `text-[calc(var(--ui)*n)]`) → un `em` y est correct et se lit bien : `left-[0.5em]` sur les pictogrammes de coin, `mt-[0.3em]` sur la ligne de rareté.
- **Le bloc n'en porte aucune** → il faut `calc(var(--ui)*n)`. C'est le cas du bloc de contenu de la carte ci-dessus, et de tous les conteneurs de mise en page de la tâche 8.

Les tailles de police, elles, passent toujours par la rampe ou par un `calc(var(--ui)*n)` explicite — jamais par un `em`, qui composerait avec le parent.

- [ ] **Step 4 : convertir l'écran de choix**

Dans `src/ui/screens/upgrade.ts`, remplacer la classe du conteneur :

```ts
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*1.3)] bg-ink-deep/85 text-paper backdrop-blur-sm'
```

et le corps de `render` :

```ts
  const render = (wave: number): void => {
    el.innerHTML = `
      <div class="text-center">
        <div class="ui-2xs tracking-[0.3em] opacity-45">${t('upgrade.waveCleared', { n: wave })}</div>
        <h2 class="ui-2xl mt-[0.4em] tracking-wide">${t('upgrade.title')}</h2>
      </div>
      <div class="flex items-center gap-[calc(var(--ui)*1.1)]">${cards.map((c, i) => `<div data-nav-index="${i}" class="cursor-pointer">${renderCard(c, i === nav.index)}</div>`).join('')}</div>
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('upgrade.hint')}</div>
    `
```

Le reste de la fonction (`bindItemActivation` et son commentaire) est inchangé.

- [ ] **Step 5 : vérifier à l'œil**

Run: `npm run dev`

1. Survivre à une vague pour ouvrir l'écran de choix.
2. Redimensionner la fenêtre de ~800×450 à plein écran : les cartes et leurs textes grandissent **continûment**, sans palier visible.
3. À la plus grande taille, les descriptions sont nettement plus lisibles qu'avant ; les trois cartes tiennent côte à côte sans déborder.
4. Le HUD (score, temps, vague, jauge de vague) est **strictement inchangé** — comparer avec `git stash` si besoin.

- [ ] **Step 6 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 7 : commit**

```bash
git add src/styles/main.css src/ui/icons.ts src/ui/components/card.ts src/ui/screens/upgrade.ts
git commit -m "feat(ui): une rampe typographique fluide, et des cartes qui grandissent avec l'écran"
```

---

## Task 8 : les autres écrans sur la rampe

**Files:**
- Modify: `src/ui/screens/pause.ts:33-35,52-61`
- Modify: `src/ui/screens/menu.ts:35-36,43-72`
- Modify: `src/ui/screens/settings.ts:38-39,62-64,118-129`
- Modify: `src/ui/screens/gameover.ts:22-23,38-51`

**Interfaces:**
- Consumes: les utilitaires `ui-*` et `--ui` (tâche 7)
- Produces: rien de nouveau

- [ ] **Step 1 : la pause**

Dans `src/ui/screens/pause.ts`, la classe du conteneur :

```ts
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*1.3)] bg-ink-deep/80 text-paper backdrop-blur-sm'
```

et le corps de `render` :

```ts
  const render = (): void => {
    el.innerHTML = `
      <h2 class="ui-2xl tracking-wide">${t('pause.title')}</h2>
      <div class="flex flex-col items-center gap-[calc(var(--ui)*0.4)]">
        ${ENTRIES.map((entry, i) => {
          const active = i === nav.index
          return `<div data-nav-index="${i}" class="ui-lg flex cursor-pointer items-center gap-[0.4em] tracking-[0.15em] transition-opacity ${active ? 'opacity-100' : 'opacity-45'}">${renderNavMarker(active)}<span>${t(LABEL_KEY[entry])}</span></div>`
        }).join('')}
      </div>
    `
    // `innerHTML` détruit les nœuds précédents (et leurs écouteurs), voir `bindItemActivation`.
    bindItemActivation(el, nav, activate)
  }
```

- [ ] **Step 2 : le menu**

Dans `src/ui/screens/menu.ts`, la classe du conteneur :

```ts
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*1.8)] bg-ink-deep text-paper'
```

`renderMain` :

```ts
  // `font-display` (Fh Ink) réservé au titre « INK POINT » ; tout le reste en `font-ui` (Kalam).
  const renderMain = (): string => `
    <h1 class="font-display text-[calc(var(--ui)*2.9)] tracking-wide">${t('game.title')}</h1>
    <div class="flex flex-col items-center gap-[calc(var(--ui)*0.4)]">
      ${ENTRIES.map((entry, i) => {
        const active = i === nav.index
        return `<div data-nav-index="${i}" class="ui-lg flex cursor-pointer items-center gap-[0.4em] tracking-[0.15em] transition-opacity ${active ? 'opacity-100' : 'opacity-45'}">${renderNavMarker(active)}<span>${t(ENTRY_LABEL_KEY[entry])}</span></div>`
      }).join('')}
    </div>
    <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.hint')}</div>
  `
```

`renderUpgrades` — **la grille doit suivre la nouvelle taille de carte**, sans quoi les rangées se chevauchent et les cartes débordent sur leurs voisines. Remplacer le commentaire et le bloc :

```ts
  // Pistes calées sur la taille de `renderCard` (largeur `9,5 × --ui`, hauteur
  // déduite de son `aspect-[5/7]`, soit `13,3 × --ui`), jamais laissées libres :
  // — `auto-rows-[…]` : sans hauteur de rangée explicite, les rangées
  //   implicites se calculaient sur le seul contenu texte des cartes, plus
  //   court que la carte elle-même, et chaque rangée chevauchait la suivante ;
  // — `grid-cols-[repeat(auto-fill,…)]` plutôt que `grid-cols-4` : à quatre
  //   colonnes imposées, une fenêtre étroite réduit chaque piste sous la
  //   largeur de la carte, qui déborde alors sur sa voisine.
  // Le plafond de `41 × --ui` tient quatre cartes et leurs trois écarts sur une
  // ligne — sans lui, un grand écran en alignerait neuf, bord à bord ; les
  // 80vw gardent une marge de chaque côté quand l'écran est plus étroit.
  // Ces trois valeurs sont solidaires de `renderCard` : la changer sans les
  // suivre casse la grille en silence.
  const renderUpgrades = (): string => `
    <h2 class="ui-2xl tracking-wide">${t('menu.upgrades')}</h2>
    <div class="grid max-h-[70vh] max-w-[min(80vw,calc(var(--ui)*41))] auto-rows-[calc(var(--ui)*13.3)] grid-cols-[repeat(auto-fill,calc(var(--ui)*9.5))] content-start justify-center gap-[calc(var(--ui)*0.8)] overflow-y-auto p-[calc(var(--ui)*0.4)]">
      ${UPGRADES.map((card) => renderCard(card, false)).join('')}
    </div>
    <button type="button" data-menu-back class="ui-sm cursor-pointer rounded border border-paper/40 px-[1em] py-[0.25em] tracking-[0.15em] opacity-70 transition-opacity hover:opacity-100">${t('menu.back')}</button>
    <div class="ui-xs tracking-[0.18em] opacity-35">${t('menu.backHint')}</div>
  `
```

- [ ] **Step 3 : les réglages**

Dans `src/ui/screens/settings.ts`, la classe du conteneur :

```ts
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*1.3)] bg-ink-deep text-paper'
```

la ligne de réglage (autour de la ligne 62) :

```ts
      <div data-nav-index="${index}" class="ui-sm flex w-[calc(var(--ui)*17)] cursor-pointer items-center justify-between tracking-[0.1em] ${active ? 'opacity-100' : 'opacity-50'}">
        <span class="flex items-center gap-[0.4em]">${renderNavMarker(active)}<span>${label}</span></span>
        <span class="flex items-center gap-[0.6em]">${controls}<span>${value}</span></span>
```

et le bloc de rendu principal (autour des lignes 118-129) :

```ts
      <h2 class="ui-2xl tracking-wide">${t('settings.title')}</h2>
      <div class="flex flex-col gap-[calc(var(--ui)*0.8)]">
```

```ts
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('settings.hint')}</div>
```

- [ ] **Step 4 : l'écran de fin**

Dans `src/ui/screens/gameover.ts`, la classe du conteneur :

```ts
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*0.6)] bg-ink-deep/85 text-paper backdrop-blur-sm'
```

et le bloc de rendu :

```ts
      <div class="ui-2xs tracking-[0.3em] opacity-45">${t('game.title')}</div>
      <h2 class="text-[calc(var(--ui)*2)] tracking-wide">${t('gameover.title')}</h2>
```

Les quatre lignes suivantes prennent respectivement `ui-xs` (à la place de `text-xs` puis `text-[11px]`) :

```ts
      <div class="ui-xs tracking-[0.12em] opacity-70">${t('gameover.stats', {
```

```ts
      <div class="ui-xs tracking-[0.12em] opacity-45">${t('gameover.best', { n: formatScore(stats.best) })}</div>
      <div data-action="restart" class="ui-xs mt-[0.8em] cursor-pointer tracking-[0.18em] opacity-45 transition-opacity hover:opacity-80">${t('gameover.restart')}</div>
      <div data-action="menu" class="ui-xs cursor-pointer tracking-[0.18em] opacity-45 transition-opacity hover:opacity-80">${t('gameover.menu')}</div>
```

Le score lui-même (`renderNumber`, non listé ci-dessus) garde sa taille : c'est le seul élément de cet écran calé sur le HUD.

- [ ] **Step 5 : vérifier à l'œil, écran par écran**

Run: `npm run dev`

À 800×450 **puis** en plein écran sur le plus grand écran disponible :
1. **Menu** — le titre, les trois entrées et l'indice grandissent ensemble ; rien ne déborde.
2. **Menu → Améliorations** — la grille de cartes ne chevauche aucune rangée, ne déborde aucune colonne, et plafonne à quatre cartes par ligne.
3. **Réglages** — les lignes restent alignées, la colonne de valeurs ne se décale pas.
4. **Pause** — les trois entrées sont plus grandes qu'avant.
5. **Écran de fin** — le titre et les statistiques grandissent, le score reste calé.

- [ ] **Step 6 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 7 : commit**

```bash
git add src/ui/screens/pause.ts src/ui/screens/menu.ts src/ui/screens/settings.ts src/ui/screens/gameover.ts
git commit -m "feat(ui): passer menu, pause, réglages et écran de fin sur la rampe typographique"
```

---

## Task 9 : la Volée de plumes — simulation

**Files:**
- Modify: `src/sim/data/powerups.ts` (types, listes, ids, poids, `POWERUP_BASE`, constantes `HAZARD_*`)
- Modify: `src/sim/components/index.ts` (après `Orbiting`)
- Modify: `src/sim/upgrades/stats.ts`
- Create: `src/sim/systems/seeker.ts`
- Modify: `src/sim/step.ts`
- Test: `src/sim/systems/seeker.test.ts`

**Interfaces:**
- Consumes: `POWERUP_BASE`, `RunStats`, `SimWorld`
- Produces:
  - `PowerUpKind` gagne `'volley'` ; `POWERUP_ID.volley = 9` ; `HAZARD_QUILL = 8`
  - `RunStats` gagne `volleyCount: number` (défaut `POWERUP_BASE.volley.count`)
  - `Seeker` : composant `{ target: Types.i32, speed: Types.f32, turnRate: Types.f32, relaunches: Types.ui8 }`
  - `launchVolley(world: SimWorld, stats: RunStats, x: number, y: number): void`
  - `seekerSystem(world: SimWorld): SimWorld`

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `src/sim/systems/seeker.test.ts` :

```ts
import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Facing, Hazard, Position, Seeker } from '../components'
import { HAZARD_BLAST, HAZARD_QUILL, POWERUP_BASE } from '../data/powerups'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '../world'
import { deathSystem } from './death'
import { lifetimeSystem } from './lifetime'
import { launchVolley, seekerSystem } from './seeker'

const hazardsIn = defineQuery([Hazard, Position])

const setup = (): SimWorld => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  return w
}

const ofKind = (w: SimWorld, kind: number): number[] =>
  hazardsIn(w).filter((eid) => Hazard.kind[eid] === kind && !hasComponent(w, Doomed, eid))

const quills = (w: SimWorld): number[] => ofKind(w, HAZARD_QUILL)
const blasts = (w: SimWorld): number[] => ofKind(w, HAZARD_BLAST)

/**
 * Un mini-pas de simulation : les trois systèmes qui décident du sort d'une
 * plume, dans l'ordre de `step.ts`. Sans `lifetimeSystem`, aucune plume
 * n'expirerait jamais et le test du sursis écoulé passerait pour une
 * mauvaise raison (la sortie d'arène).
 */
const run = (w: SimWorld, steps: number): void => {
  for (let i = 0; i < steps; i++) {
    seekerSystem(w)
    lifetimeSystem(w)
    deathSystem(w)
    w.time += FIXED_DT
  }
}

describe('launchVolley', () => {
  it('lance autant de plumes que les stats en demandent', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    expect(quills(w)).toHaveLength(POWERUP_BASE.volley.count)
  })

  it('suit le compte des stats, pas la constante de base', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    const stats: RunStats = { ...createRunStats(), volleyCount: 5 }
    launchVolley(w, stats, 400, 300)
    expect(quills(w)).toHaveLength(5)
  })

  // Trois plumes sur un même ennemi quand trois sont disponibles gâcherait la
  // volée : elles doivent se répartir.
  it('vise des ennemis distincts quand il y en a assez', () => {
    const w = setup()
    const a = spawnEnemy(w, { type: 'point', x: 500, y: 300, materializeMs: 0 })
    const b = spawnEnemy(w, { type: 'point', x: 300, y: 300, materializeMs: 0 })
    const c = spawnEnemy(w, { type: 'point', x: 400, y: 200, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    const cibles = quills(w).map((eid) => Seeker.target[eid])
    expect(new Set(cibles)).toEqual(new Set([a, b, c]))
  })

  // Deux plumes sur une même cible valent mieux qu'une plume gâchée.
  it('ne perd aucune plume quand il y a moins d’ennemis que de plumes', () => {
    const w = setup()
    const seul = spawnEnemy(w, { type: 'point', x: 600, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    const lancees = quills(w)
    expect(lancees).toHaveLength(POWERUP_BASE.volley.count)
    for (const eid of lancees) {
      expect(Seeker.target[eid]).toBe(seul)
    }
  })

  it('part quand même sans aucun ennemi, en éventail', () => {
    const w = setup()
    launchVolley(w, createRunStats(), 400, 300)
    const lancees = quills(w)
    expect(lancees).toHaveLength(POWERUP_BASE.volley.count)
    expect(new Set(lancees.map((eid) => Facing.angle[eid])).size).toBe(POWERUP_BASE.volley.count)
    for (const eid of lancees) {
      expect(Seeker.target[eid]).toBe(-1)
    }
  })

  // Le pointillé est inoffensif ET hors d'atteinte partout ailleurs dans le jeu.
  it('ne cible jamais un ennemi en matérialisation', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 420, y: 300, materializeMs: 5_000 })
    const loin = spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    for (const eid of quills(w)) {
      expect(Seeker.target[eid]).toBe(loin)
    }
  })
})

describe('seekerSystem', () => {
  it('rapproche la plume de sa cible', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    const eid = quills(w)[0]!
    const avant = Math.hypot(700 - Position.x[eid]!, 300 - Position.y[eid]!)
    run(w, 10)
    const apres = Math.hypot(700 - Position.x[eid]!, 300 - Position.y[eid]!)
    expect(apres).toBeLessThan(avant)
  })

  // Le virage est progressif : une plume doit pouvoir manquer sa cible et se
  // rabattre, pas la coller comme un aimant.
  it('ne tourne jamais de plus que son taux de virage sur un pas', () => {
    const w = setup()
    // Cible pile derrière la plume : l'écart de cap demandé vaut π.
    spawnEnemy(w, { type: 'point', x: 100, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    const eid = quills(w)[0]!
    const avant = Facing.angle[eid]!
    seekerSystem(w)
    const ecart = Math.abs(Math.atan2(Math.sin(Facing.angle[eid]! - avant), Math.cos(Facing.angle[eid]! - avant)))
    expect(ecart).toBeLessThanOrEqual(POWERUP_BASE.volley.turnRate * FIXED_DT + 1e-6)
  })

  it('reprend une cible quand la sienne meurt', () => {
    const w = setup()
    const proche = spawnEnemy(w, { type: 'point', x: 500, y: 300, materializeMs: 0 })
    const autre = spawnEnemy(w, { type: 'point', x: 400, y: 100, materializeMs: 0 })
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)
    const eid = quills(w)[0]!
    expect(Seeker.target[eid]).toBe(proche)
    addComponentDoomedThenReap(w, proche)
    seekerSystem(w)
    expect(Seeker.target[eid]).toBe(autre)
  })

  it('pose une explosion à l’impact et retire la plume', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 430, y: 300, materializeMs: 0 })
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)
    const eid = quills(w)[0]!
    run(w, 30)
    expect(entityExists(w, eid) && !hasComponent(w, Doomed, eid)).toBe(false)
    expect(blasts(w).length).toBeGreaterThan(0)
  })

  // Une explosion sans impact mentirait sur ce qui vient de tuer.
  it('expire sans explosion quand elle n’a jamais rencontré personne', () => {
    const w = setup()
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)
    run(w, 400)
    expect(quills(w)).toHaveLength(0)
    expect(blasts(w)).toHaveLength(0)
  })

  it('disparaît en sortant de l’arène plutôt que de voler hors de la page', () => {
    const w = setup()
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 795, 300)
    const eid = quills(w)[0]!
    Facing.angle[eid] = 0
    run(w, 20)
    expect(entityExists(w, eid) && !hasComponent(w, Doomed, eid)).toBe(false)
  })

  it('relance une plume à l’impact quand la règle est active, une seule fois', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 430, y: 300, materializeMs: 0 })
    spawnEnemy(w, { type: 'point', x: 430, y: 500, materializeMs: 0 })
    const stats: RunStats = { ...createRunStats(), volleyCount: 1, rules: new Set(['nestedQuills']) }
    launchVolley(w, stats, 400, 300)
    run(w, 30)
    const restantes = quills(w)
    expect(restantes).toHaveLength(1)
    expect(Seeker.relaunches[restantes[0]!]).toBe(0)
  })
})
```

Ajouter ce helper juste sous les `const` du haut du fichier :

```ts
/** Tue un ennemi comme le ferait une zone mortelle, puis applique la mort. */
function addComponentDoomedThenReap(w: SimWorld, eid: number): void {
  addComponent(w, Doomed, eid)
  deathSystem(w)
}
```

et compléter l'import bitECS : `import { addComponent, defineQuery, entityExists, hasComponent } from 'bitecs'`.

- [ ] **Step 2 : lancer et constater l'échec**

Run: `npx vitest run src/sim/systems/seeker.test.ts`
Expected: FAIL — `./seeker` introuvable, `HAZARD_QUILL` et `Seeker` non exportés.

- [ ] **Step 3 : les données**

Dans `src/sim/data/powerups.ts` :

```ts
export type PowerUpKind = 'blast' | 'freeze' | 'bramble' | 'blotter' | 'dash' | 'halo' | 'volley'

export const POWERUP_KINDS: readonly PowerUpKind[] = [
  'blast',
  'freeze',
  'bramble',
  'blotter',
  'dash',
  'halo',
  'volley',
]
```

Ajouter à `POWERUP_WEIGHT` : `volley: 4,` — plein poids offensif, au-dessus du Halo comme les autres.

Ajouter à `POWERUP_ID` : `volley: 9,`

Étendre `POWERUP_BY_ID` (l'indice 8 reste `null`, il n'est jamais réattribué) :

```ts
export const POWERUP_BY_ID: readonly (PowerUpKind | null)[] = [
  null,
  'blast',
  'freeze',
  'bramble',
  null,
  'blotter',
  'dash',
  'halo',
  null,
  'volley',
]
```

Ajouter la constante de zone, après `HAZARD_BRAMBLE` :

```ts
/** Plume en vol de la Volée. N'est PAS dans `LETHAL` : c'est son explosion qui tue. */
export const HAZARD_QUILL = 8
```

Ajouter à `POWERUP_BASE`, après `dash` :

```ts
  /**
   * Volée de plumes. Les plumes ne tuent pas au passage : à l'impact elles
   * posent une explosion réduite et disparaissent, pour que ce que le joueur
   * voit reste exactement ce qui tue (spec §3.1).
   *
   * `turnRate` est en rad/ms comme `bramble.angularRate` : à 0,006 la plume
   * met ~520 ms à faire demi-tour, assez pour manquer une cible qui coupe sa
   * trajectoire — un téléguidage parfait n'aurait aucune lecture.
   */
  volley: {
    count: 3,
    speed: 340,
    turnRate: 0.006,
    lifeMs: 2600,
    quillRadius: 5,
    /** Explosion d'impact : la Bombe fait 150, celle-ci se lit comme sa petite sœur. */
    blastRadius: 60,
    /** Même croissance que la Bombe : une explosion doit se lire pareil, quelle que soit sa taille. */
    blastGrowth: 320,
    blastLingerMs: 120,
  },
```

- [ ] **Step 4 : le composant**

Dans `src/sim/components/index.ts`, après `Orbiting` :

```ts
/**
 * Plume de la Volée : elle vire vers `target` à `turnRate` rad/ms et avance à
 * `speed` px/s le long de son `Facing`.
 *
 * `target` est un `i32` et non un `Types.eid` (un ui32) précisément pour
 * pouvoir valoir **-1**, « aucune cible » : l'entité 0 est une entité valide
 * chez bitECS, un défaut à 0 désignerait donc le joueur.
 *
 * `relaunches` porte le budget de « Plumes gigognes » sur l'entité, pas dans
 * les stats : deux volées lancées à la suite ne doivent pas partager le leur.
 */
export const Seeker = defineComponent({
  target: Types.i32,
  speed: Types.f32,
  turnRate: Types.f32,
  relaunches: Types.ui8,
})
```

- [ ] **Step 5 : la stat**

Dans `src/sim/upgrades/stats.ts`, ajouter le champ à l'interface, après `dashRadius` :

```ts
  volleyCount: number
```

et au retour de `createRunStats` :

```ts
    volleyCount: POWERUP_BASE.volley.count,
```

- [ ] **Step 6 : le système**

Créer `src/sim/systems/seeker.ts` :

```ts
import { addComponent, addEntity, defineQuery, entityExists, hasComponent, Not } from 'bitecs'

import {
  Collider,
  Doomed,
  Enemy,
  Facing,
  Hazard,
  Lifetime,
  Materializing,
  Position,
  PrevPosition,
  Seeker,
} from '../components'
import { HAZARD_BLAST, HAZARD_QUILL, POWERUP_BASE } from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * La Volée de plumes.
 *
 * Les plumes ne portent **pas** de `Collider` : `integrationSystem` interroge
 * `[Position, PrevPosition, Velocity, Collider, …]` et *bloque aux murs* ce
 * qu'il déplace. En rester dehors leur laisse gouverner leur propre
 * déplacement, exactement comme `brambleSystem` le fait pour ses épines, sans
 * introduire d'exception dans un système que tout le reste traverse.
 *
 * Elles ne sont pas non plus dans `LETHAL` (voir `hazards.ts`) : une plume ne
 * tue pas au passage, elle pose une explosion à l'impact et disparaît. C'est
 * cette explosion qui tue, donc ce que le joueur voit est exactement ce qui
 * tue (spec §3.1).
 */

const quills = defineQuery([Seeker, Hazard, Position, PrevPosition, Facing])
const preys = defineQuery([Enemy, Position, Collider, Not(Materializing), Not(Doomed)])

/** « Aucune cible ». Voir le commentaire de `Seeker` : 0 est une entité valide. */
const NO_TARGET = -1

function isPrey(world: SimWorld, eid: number): boolean {
  return (
    eid >= 0 &&
    entityExists(world, eid) &&
    hasComponent(world, Enemy, eid) &&
    !hasComponent(world, Materializing, eid) &&
    !hasComponent(world, Doomed, eid)
  )
}

/**
 * Les proies vivantes triées de la plus proche à la plus lointaine de (x, y).
 *
 * `sort` est stable et l'ordre d'itération d'une requête bitECS est
 * déterministe : deux mondes identiques rendent la même liste, ex æquo
 * compris. Rien ici ne consomme `world.rng`.
 */
function preysByDistance(world: SimWorld, x: number, y: number): number[] {
  const distSq = (eid: number): number => {
    const dx = Position.x[eid]! - x
    const dy = Position.y[eid]! - y
    return dx * dx + dy * dy
  }
  return [...preys(world)].sort((a, b) => distSq(a) - distSq(b))
}

/** La proie la plus proche de (x, y), ou `NO_TARGET` s'il n'y en a aucune. */
function nearestPrey(world: SimWorld, x: number, y: number): number {
  return preysByDistance(world, x, y)[0] ?? NO_TARGET
}

function spawnQuill(
  world: SimWorld,
  x: number,
  y: number,
  angle: number,
  target: number,
  relaunches: number,
): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, PrevPosition, eid)
  addComponent(world, Facing, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  addComponent(world, Seeker, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  PrevPosition.x[eid] = x
  PrevPosition.y[eid] = y
  Facing.angle[eid] = angle
  Hazard.kind[eid] = HAZARD_QUILL
  Hazard.radius[eid] = POWERUP_BASE.volley.quillRadius
  Hazard.maxRadius[eid] = POWERUP_BASE.volley.quillRadius
  // Zéro, pas le taux de virage : `hazardSystem` lit `growthRate` sur toute
  // entité `Hazard` et fait grossir le rayon dès qu'il est positif.
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = POWERUP_BASE.volley.lifeMs
  Seeker.target[eid] = target
  Seeker.speed[eid] = POWERUP_BASE.volley.speed
  Seeker.turnRate[eid] = POWERUP_BASE.volley.turnRate
  Seeker.relaunches[eid] = relaunches
  return eid
}

/** L'explosion d'impact : une Bombe en réduction, mêmes réglages de lecture. */
function spawnQuillBlast(world: SimWorld, x: number, y: number): void {
  const { blastRadius, blastGrowth, blastLingerMs } = POWERUP_BASE.volley
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = HAZARD_BLAST
  Hazard.radius[eid] = 6
  Hazard.maxRadius[eid] = blastRadius
  Hazard.growthRate[eid] = blastGrowth
  Lifetime.remaining[eid] = (blastRadius / blastGrowth) * 1000 + blastLingerMs
}

/**
 * Lance une volée depuis (x, y).
 *
 * Trois cas, tranchés ici plutôt que laissés au hasard de l'implémentation :
 * — assez d'ennemis : une cible distincte par plume, les plus proches d'abord ;
 * — moins d'ennemis que de plumes : le surplus reprend le plus proche. Deux
 *   plumes sur une même cible valent mieux qu'une plume gâchée ;
 * — aucun ennemi : les plumes partent quand même, en éventail devant le
 *   joueur, et réacquerront une cible dès qu'un ennemi se matérialisera.
 */
export function launchVolley(world: SimWorld, stats: RunStats, x: number, y: number): void {
  const count = Math.max(1, Math.floor(stats.volleyCount))
  const relaunches = stats.rules.has('nestedQuills') ? 1 : 0
  const ranked = preysByDistance(world, x, y)
  // Éventail centré sur le regard du joueur, utilisé seulement faute de cible.
  const facing = world.playerEid >= 0 ? (Facing.angle[world.playerEid] ?? 0) : 0
  const spread = Math.PI / 3

  for (let i = 0; i < count; i++) {
    const target = ranked.length === 0 ? NO_TARGET : (ranked[i] ?? ranked[0]!)
    const angle =
      target === NO_TARGET
        ? facing + (count === 1 ? 0 : spread * (i / (count - 1) - 0.5))
        : Math.atan2(Position.y[target]! - y, Position.x[target]! - x)
    spawnQuill(world, x, y, angle, target, relaunches)
  }
}

export function seekerSystem(world: SimWorld): SimWorld {
  const dtMs = FIXED_DT * world.timeScale
  const dt = dtMs / 1000

  // Photographie fixe : bitECS rend le tableau interne, pas une copie, et une
  // relance (« Plumes gigognes ») y pousserait une plume traitée dans la même
  // passe selon l'ordre interne de la bibliothèque. Même piège que
  // `spawnAfterburn` dans `lifetime.ts`.
  for (const eid of [...quills(world)]) {
    // Sans PrevPosition à jour, le rendu ne peut pas interpoler ces zones
    // mobiles : elles avanceraient par saccades d'un pas de simulation.
    PrevPosition.x[eid] = Position.x[eid]!
    PrevPosition.y[eid] = Position.y[eid]!

    let target = Seeker.target[eid]!
    if (!isPrey(world, target)) {
      target = nearestPrey(world, Position.x[eid]!, Position.y[eid]!)
      Seeker.target[eid] = target
    }

    if (target !== NO_TARGET) {
      const desired = Math.atan2(
        Position.y[target]! - Position.y[eid]!,
        Position.x[target]! - Position.x[eid]!,
      )
      // Écart rabattu dans (-π, π] : sans ce repli, un écart de 350° ferait
      // virer la plume dans le mauvais sens sur presque un tour complet.
      const raw = desired - Facing.angle[eid]!
      const delta = Math.atan2(Math.sin(raw), Math.cos(raw))
      const maxTurn = Seeker.turnRate[eid]! * dtMs
      Facing.angle[eid] = Facing.angle[eid]! + Math.max(-maxTurn, Math.min(maxTurn, delta))
    }

    const angle = Facing.angle[eid]!
    const speed = Seeker.speed[eid]!
    const x = Position.x[eid]! + Math.cos(angle) * speed * dt
    const y = Position.y[eid]! + Math.sin(angle) * speed * dt
    Position.x[eid] = x
    Position.y[eid] = y

    // Sortie d'arène : la plume n'a pas de `Collider`, rien ne la bloque aux
    // murs. La laisser filer dessinerait une plume qui vole hors de la page
    // jusqu'à l'expiration de son sursis.
    if (x < 0 || y < 0 || x > world.arena.width || y > world.arena.height) {
      addComponent(world, Doomed, eid)
      continue
    }

    const hit = contactAt(world, x, y, Hazard.radius[eid]!)
    if (hit === NO_TARGET) {
      continue
    }

    // L'ennemi touché n'est pas marqué ici : c'est l'explosion qui tue, et
    // `hazardSystem` tourne juste après dans le pas (voir step.ts).
    spawnQuillBlast(world, x, y)
    addComponent(world, Doomed, eid)

    const left = Seeker.relaunches[eid]!
    if (left > 0) {
      const next = nearestPrey(world, x, y)
      const angleOut =
        next === NO_TARGET
          ? angle
          : Math.atan2(Position.y[next]! - y, Position.x[next]! - x)
      spawnQuill(world, x, y, angleOut, next, left - 1)
    }
  }

  return world
}

/**
 * La première proie en contact avec un disque de rayon `r` centré en (x, y),
 * ou `NO_TARGET`. Teste toutes les proies, pas seulement la cible : une plume
 * qui frôle un autre ennemi en chemin doit exploser là, pas le traverser.
 */
function contactAt(world: SimWorld, x: number, y: number, r: number): number {
  for (const eid of preys(world)) {
    const reach = r + Collider.radius[eid]!
    const dx = Position.x[eid]! - x
    const dy = Position.y[eid]! - y
    if (dx * dx + dy * dy <= reach * reach) {
      return eid
    }
  }
  return NO_TARGET
}
```

- [ ] **Step 7 : brancher dans le pas**

Dans `src/sim/step.ts`, ajouter l'import `import { seekerSystem } from './systems/seeker'` et l'appel juste après `brambleSystem(world)` :

```ts
  brambleSystem(world)
  // Avec brambleSystem, et pour la même raison : ce sont des déplacements que
  // `integrationSystem` ne fait pas (ces entités n'ont pas de `Collider`).
  // Avant `hazardSystem`, pour que l'explosion posée par une plume qui vient
  // d'atteindre sa cible soit testée dès ce pas — même exigence que
  // `dashWakeSystem` juste au-dessus.
  seekerSystem(world)
  hazardSystem(world, stats)
```

- [ ] **Step 8 : relancer**

Run: `npx vitest run src/sim/systems/seeker.test.ts`
Expected: PASS

- [ ] **Step 9 : vérifier que le typage réclame le reste**

Run: `npm run typecheck`
Expected: **FAIL attendu** — `POWERUP_ICONS` (`src/ui/icons.ts`), `DRAWERS` (`src/render/views/pickup.ts`) et `powerupVoices` (`src/audio/sounds.ts`) sont des `Record<PowerUpKind, …>` ou portent une garde `never` : ils réclament une entrée `volley`. C'est le filet du projet qui fonctionne — il est levé à la tâche 10.

Pour permettre un commit vert dès maintenant, faire la tâche 10 **avant** de commiter, ou commiter les deux tâches ensemble. Ne pas ajouter d'entrée bidon ici.

- [ ] **Step 10 : suite de tests (le typecheck reste rouge jusqu'à la tâche 10)**

Run: `npm test && npm run lint`
Expected: PASS

---

## Task 10 : la Volée de plumes — activation, image et son

**Files:**
- Modify: `src/sim/powerups/activate.ts`
- Modify: `src/ui/icons.ts`
- Modify: `src/render/views/pickup.ts`
- Modify: `src/render/views/hazard.ts`
- Modify: `src/audio/sounds.ts`

**Interfaces:**
- Consumes: `launchVolley` (tâche 9), `HAZARD_QUILL`, `POWERUP_BASE.volley`
- Produces: le genre `'volley'` est jouable de bout en bout

- [ ] **Step 1 : l'activation**

Dans `src/sim/powerups/activate.ts`, ajouter l'import `import { launchVolley } from '../systems/seeker'` et la branche, après `case 'dash'` :

```ts
    case 'volley':
      // Depuis la pastille et non depuis le joueur : c'est un jet, pas un
      // effet centré sur soi comme la Ronce. Les deux points coïncident au
      // ramassage, mais l'intention doit se lire dans le code.
      launchVolley(world, stats, x, y)
      break
```

- [ ] **Step 2 : le pictogramme**

Dans `src/ui/icons.ts`, ajouter à `POWERUP_ICONS` :

```ts
  // Trois barbes divergentes : la volée se lit à sa multiplicité, pas au
  // dessin d'une plume unique qu'on confondrait avec la Ruée.
  volley:
    '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 34l16-16"/><path d="M14 44l20-20"/><path d="M24 46l16-16"/></g><path d="M40 12l6 6-6 6-6-6z" fill="currentColor"/>',
```

- [ ] **Step 3 : le tracé Pixi de la pastille**

Dans `src/render/views/pickup.ts`, ajouter la fonction et l'entrée du registre :

```ts
/** Mêmes tracés que `POWERUP_ICONS.volley` (icons.ts), à garder en phase à la main. */
function drawVolley(gfx: Graphics): void {
  gfx.moveTo(...P(12, 34)).lineTo(...P(28, 18))
  gfx.moveTo(...P(14, 44)).lineTo(...P(34, 24))
  gfx.moveTo(...P(24, 46)).lineTo(...P(40, 30))
  gfx.stroke({ color: INK.paper, width: 1.6, cap: 'round' })

  gfx
    .moveTo(...P(40, 12))
    .lineTo(...P(46, 18))
    .lineTo(...P(40, 24))
    .lineTo(...P(34, 18))
    .fill({ color: INK.paper })
}
```

```ts
const DRAWERS: Record<PowerUpKind, (gfx: Graphics) => void> = {
  blast: drawBlast,
  freeze: drawFreeze,
  bramble: drawBramble,
  blotter: drawBlotter,
  dash: drawDash,
  halo: drawHalo,
  volley: drawVolley,
}
```

- [ ] **Step 4 : le tracé Pixi de la plume en vol**

Dans `src/render/views/hazard.ts`, ajouter `HAZARD_QUILL` à l'import venant de `@/sim/data/powerups`, une couleur, et le tracé.

Couleur (dans `COLORS`) :

```ts
  [HAZARD_QUILL]: INK.paper,
```

Fonction de tracé, à placer près des autres :

```ts
/**
 * La plume en vol : un fer de lance orienté par son `Facing`, avec une barbe
 * traînante. Volontairement plus étroite que son rayon de contact — c'est la
 * seule zone du jeu qui ne tue pas par elle-même (son explosion s'en charge),
 * donc la règle « le dessin contient ce qui tue » ne s'y applique pas.
 */
function drawQuill(gfx: Graphics, radius: number, color: number, angle: number): void {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const tip = radius * 2.2
  const back = radius * 1.4
  const half = radius * 0.7

  gfx
    .moveTo(cos * tip, sin * tip)
    .lineTo(-sin * half - cos * back, cos * half - sin * back)
    .lineTo(sin * half - cos * back, -cos * half - sin * back)
    .fill({ color })

  // Barbe traînante : sans elle, la plume se lit comme un simple triangle et
  // son sens de vol devient ambigu à petite taille.
  gfx
    .moveTo(-cos * back, -sin * back)
    .lineTo(-cos * back * 2.4, -sin * back * 2.4)
    .stroke({ color, width: 1, alpha: 0.4 })
}
```

La brancher dans `update`, **juste après le bloc `HAZARD_BRAMBLE`** et avant la chaîne `if (kind === HAZARD_BLOTTER) … else if …`. La fonction devient :

```ts
    update({ x, y, radius, kind, lifeRatio, time, remainingMs, angle }) {
      container.x = x
      container.y = y
      gfx.clear()

      const color = COLORS[kind] ?? INK.paper

      if (kind === HAZARD_BRAMBLE) {
        // `angle ?? 0` : les épines portent toujours `Facing`, ce repli ne devrait jamais s'activer.
        drawBramble(gfx, radius, color, angle ?? 0, remainingMs, time)
        return
      }

      if (kind === HAZARD_QUILL) {
        // `angle !== null` plutôt qu'un repli à 0 : sans `Facing`, la vue doit
        // s'abstenir de dessiner une plume plutôt que d'en pointer une au
        // hasard — c'est la règle que le type `angle: number | null` impose
        // déjà en tête de ce fichier.
        if (angle !== null) {
          drawQuill(gfx, radius, color, angle)
        }
        return
      }

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
    },
```

- [ ] **Step 5 : la voix**

Dans `src/audio/sounds.ts`, ajouter dans `powerupVoices`, avant le `default` :

```ts
    case 'volley':
      // Trois départs rapprochés, un par plume : la volée s'entend comme une
      // rafale, pas comme un tir unique.
      return [
        { source: 'noise', freq: 2200, filterHz: 2200, durationMs: 90, gain: 0.2 },
        { source: 'noise', freq: 2000, filterHz: 2000, durationMs: 90, gain: 0.16, delayMs: 45 },
        { source: 'noise', freq: 1800, filterHz: 1800, durationMs: 90, gain: 0.13, delayMs: 90 },
      ]
```

- [ ] **Step 6 : le typecheck doit repasser au vert**

Run: `npm run typecheck`
Expected: PASS — les trois tables réclamées à la tâche 9 sont complètes.

- [ ] **Step 7 : vérifier à l'œil**

Run: `npm run dev`

1. Jouer jusqu'à ramasser une Volée (poids 4, elle sort vite).
2. Le pictogramme au sol est distinguable des six autres.
3. Trois plumes partent, virent vers des ennemis **différents**, et explosent à l'impact.
4. L'explosion se lit comme une petite Bombe, et c'est bien elle qui tue.
5. Une plume qui manque tout finit par disparaître, **sans** explosion.
6. La plume est orientée dans son sens de vol.

- [ ] **Step 8 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 9 : commit (les tâches 9 et 10 ensemble)**

```bash
git add src/sim/data/powerups.ts src/sim/components/index.ts src/sim/upgrades/stats.ts src/sim/systems/seeker.ts src/sim/systems/seeker.test.ts src/sim/step.ts src/sim/powerups/activate.ts src/ui/icons.ts src/render/views/pickup.ts src/render/views/hazard.ts src/audio/sounds.ts
git commit -m "feat(sim): la Volée de plumes, qui tue par ses explosions et non par ses plumes"
```

---

## Task 11 : la Bavure — simulation

**Files:**
- Modify: `src/sim/data/powerups.ts`
- Modify: `src/sim/components/index.ts` (après `Seeker`)
- Modify: `src/sim/upgrades/stats.ts`
- Modify: `src/sim/systems/hazards.ts` (l'ensemble `LETHAL`)
- Create: `src/sim/systems/ricochet.ts`
- Modify: `src/sim/step.ts`
- Test: `src/sim/systems/ricochet.test.ts`

**Interfaces:**
- Consumes: `POWERUP_BASE`, `RunStats`, `SimWorld`
- Produces:
  - `PowerUpKind` gagne `'splatter'` ; `POWERUP_ID.splatter = 10` ; `HAZARD_SPLATTER = 9`
  - `RunStats` gagne `splatterLifeMs: number` (défaut `POWERUP_BASE.splatter.lifeMs`)
  - `Ricochet` : composant `{ splitsLeft: Types.ui8 }`
  - `launchSplatter(world: SimWorld, stats: RunStats, x: number, y: number): void`
  - `ricochetSystem(world: SimWorld): SimWorld`

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `src/sim/systems/ricochet.test.ts` :

```ts
import { defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Facing, Hazard, Lifetime, Position, Ricochet } from '../components'
import { HAZARD_SPLATTER, POWERUP_BASE } from '../data/powerups'
import { spawnPlayer } from '../spawn'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '../world'
import { launchSplatter, ricochetSystem } from './ricochet'

const hazardsIn = defineQuery([Hazard, Position])

const setup = (): SimWorld => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  Facing.angle[w.playerEid] = 0
  return w
}

const drops = (w: SimWorld): number[] =>
  hazardsIn(w).filter((eid) => Hazard.kind[eid] === HAZARD_SPLATTER && !hasComponent(w, Doomed, eid))

const run = (w: SimWorld, steps: number): void => {
  for (let i = 0; i < steps; i++) {
    ricochetSystem(w)
    w.time += FIXED_DT
  }
}

describe('launchSplatter', () => {
  it('pose une goutte unique dans la direction du regard', () => {
    const w = setup()
    Facing.angle[w.playerEid] = Math.PI / 2
    launchSplatter(w, createRunStats(), 400, 300)
    const posees = drops(w)
    expect(posees).toHaveLength(1)
    expect(Facing.angle[posees[0]!]).toBeCloseTo(Math.PI / 2, 4)
  })

  it('lit sa durée dans les stats, pas dans la constante de base', () => {
    const w = setup()
    const stats: RunStats = { ...createRunStats(), splatterLifeMs: 9_000 }
    launchSplatter(w, stats, 400, 300)
    expect(Lifetime.remaining[drops(w)[0]!]).toBe(9_000)
  })

  it('n’arme le dédoublement que si la règle est prise', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 400, 300)
    expect(Ricochet.splitsLeft[drops(w)[0]!]).toBe(0)

    const w2 = setup()
    launchSplatter(w2, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 400, 300)
    expect(Ricochet.splitsLeft[drops(w2)[0]!]).toBe(1)
  })
})

describe('ricochetSystem', () => {
  it('ne laisse jamais la goutte sortir de l’arène', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 400, 300)
    const eid = drops(w)[0]!
    Facing.angle[eid] = 0.7
    const r = Hazard.radius[eid]!
    run(w, 2_000)
    for (const drop of drops(w)) {
      expect(Position.x[drop]!).toBeGreaterThanOrEqual(r - 1e-3)
      expect(Position.x[drop]!).toBeLessThanOrEqual(800 - r + 1e-3)
      expect(Position.y[drop]!).toBeGreaterThanOrEqual(r - 1e-3)
      expect(Position.y[drop]!).toBeLessThanOrEqual(600 - r + 1e-3)
    }
  })

  it('inverse la composante horizontale sur un mur vertical', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 790, 300)
    const eid = drops(w)[0]!
    Facing.angle[eid] = 0
    run(w, 5)
    expect(Math.cos(Facing.angle[eid]!)).toBeLessThan(0)
    expect(Math.sin(Facing.angle[eid]!)).toBeCloseTo(0, 3)
  })

  it('inverse les deux composantes dans un coin', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 795, 595)
    const eid = drops(w)[0]!
    Facing.angle[eid] = Math.PI / 4
    run(w, 5)
    expect(Math.cos(Facing.angle[eid]!)).toBeLessThan(0)
    expect(Math.sin(Facing.angle[eid]!)).toBeLessThan(0)
  })

  it('avance à sa vitesse nominale', () => {
    const w = setup()
    launchSplatter(w, createRunStats(), 100, 300)
    const eid = drops(w)[0]!
    Facing.angle[eid] = 0
    const avant = Position.x[eid]!
    ricochetSystem(w)
    const parcouru = Position.x[eid]! - avant
    expect(parcouru).toBeCloseTo((POWERUP_BASE.splatter.speed * FIXED_DT) / 1000, 3)
  })

  // Garder la goutte d'origine sur son cap et ne dévier que la nouvelle
  // donnerait une paire dont une seule branche a vraiment été dirigée : le
  // rebond se lirait comme un bug.
  it('dédouble symétriquement au premier rebond', () => {
    const w = setup()
    launchSplatter(w, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 790, 300)
    const eid = drops(w)[0]!
    Facing.angle[eid] = 0
    run(w, 5)
    const apres = drops(w)
    expect(apres).toHaveLength(2)
    const [a, b] = apres.map((e) => Facing.angle[e]!)
    const ecart = Math.abs(Math.atan2(Math.sin(a! - b!), Math.cos(a! - b!)))
    expect(ecart).toBeCloseTo(POWERUP_BASE.splatter.splitAngle, 3)
  })

  // Sans ce plafond, chaque rebond doublerait la population : la carte
  // deviendrait un déni de service sur elle-même.
  it('ne redédouble jamais les gouttes issues d’un dédoublement', () => {
    const w = setup()
    launchSplatter(w, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 790, 300)
    Facing.angle[drops(w)[0]!] = 0
    run(w, 2_000)
    expect(drops(w)).toHaveLength(2)
    for (const eid of drops(w)) {
      expect(Ricochet.splitsLeft[eid]).toBe(0)
    }
  })

  it('donne à la goutte née d’un dédoublement le sursis restant de sa mère', () => {
    const w = setup()
    launchSplatter(w, { ...createRunStats(), rules: new Set(['splitSplatter']) }, 790, 300)
    const mere = drops(w)[0]!
    Facing.angle[mere] = 0
    const restant = Lifetime.remaining[mere]!
    run(w, 5)
    for (const eid of drops(w)) {
      expect(Lifetime.remaining[eid]).toBeCloseTo(restant, 3)
    }
  })
})
```

- [ ] **Step 2 : lancer et constater l'échec**

Run: `npx vitest run src/sim/systems/ricochet.test.ts`
Expected: FAIL — `./ricochet` introuvable, `HAZARD_SPLATTER` et `Ricochet` non exportés.

- [ ] **Step 3 : les données**

Dans `src/sim/data/powerups.ts` :

```ts
export type PowerUpKind =
  | 'blast'
  | 'freeze'
  | 'bramble'
  | 'blotter'
  | 'dash'
  | 'halo'
  | 'volley'
  | 'splatter'

export const POWERUP_KINDS: readonly PowerUpKind[] = [
  'blast',
  'freeze',
  'bramble',
  'blotter',
  'dash',
  'halo',
  'volley',
  'splatter',
]
```

Ajouter à `POWERUP_WEIGHT` : `splatter: 3,` — sous les offensifs à plein poids, au-dessus du Halo : elle travaille seule pendant qu'on esquive ailleurs, elle n'a pas à sortir aussi souvent qu'une Bombe.

Ajouter à `POWERUP_ID` : `splatter: 10,` et à la fin de `POWERUP_BY_ID` : `'splatter',`

Ajouter la constante de zone :

```ts
/** Goutte de Bavure en vol. Contrairement à la plume, elle EST mortelle : elle rejoint `LETHAL`. */
export const HAZARD_SPLATTER = 9
```

Ajouter à `POWERUP_BASE` :

```ts
  /**
   * Bavure : une goutte lancée dans la direction du regard, qui rebondit sur
   * les murs et tue au contact. Le seul power-up qui continue à travailler
   * pendant que le joueur esquive ailleurs.
   */
  splatter: {
    speed: 300,
    radius: 11,
    lifeMs: 4200,
    /** Écart de cap TOTAL entre les deux gouttes d'« Éclaboussure », en rad (~29°) : chacune dévie de la moitié. */
    splitAngle: 0.5,
  },
```

- [ ] **Step 4 : le composant**

Dans `src/sim/components/index.ts`, après `Seeker` :

```ts
/**
 * Goutte de Bavure : elle rebondit sur les murs au lieu d'y être plaquée.
 *
 * Comme la plume, elle ne porte pas de `Collider` — c'est ce qui la tient hors
 * de `integrationSystem`, qui bloque aux murs ce qu'il déplace.
 *
 * `splitsLeft` porte le budget d'« Éclaboussure » sur l'entité et retombe à 0
 * au premier rebond : sans ce plafond, chaque rebond doublerait la population.
 */
export const Ricochet = defineComponent({ splitsLeft: Types.ui8 })
```

- [ ] **Step 5 : la stat**

Dans `src/sim/upgrades/stats.ts`, ajouter à l'interface après `volleyCount` :

```ts
  splatterLifeMs: number
```

et au retour de `createRunStats` :

```ts
    splatterLifeMs: POWERUP_BASE.splatter.lifeMs,
```

- [ ] **Step 6 : rendre la goutte mortelle**

Dans `src/sim/systems/hazards.ts`, ajouter `HAZARD_SPLATTER` à l'import et à l'ensemble :

```ts
const LETHAL = new Set([
  HAZARD_BLAST,
  HAZARD_TRAIL,
  HAZARD_BRAMBLE,
  HAZARD_AFTERBURN,
  HAZARD_SPLATTER,
])
```

- [ ] **Step 7 : le système**

Créer `src/sim/systems/ricochet.ts` :

```ts
import { addComponent, addEntity, defineQuery } from 'bitecs'

import { Facing, Hazard, Lifetime, Position, PrevPosition, Ricochet } from '../components'
import { HAZARD_SPLATTER, POWERUP_BASE } from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * La Bavure : une goutte d'encre qui rebondit sur les murs et tue au contact.
 *
 * Comme la plume (`seeker.ts`), elle ne porte **pas** de `Collider` :
 * `integrationSystem` bloquerait sinon la goutte contre le mur au lieu de la
 * laisser rebondir. En rester dehors lui laisse gouverner son déplacement,
 * sans introduire d'exception dans un système que tout le reste traverse.
 *
 * Elle est en revanche dans `LETHAL` (`hazards.ts`) : contrairement à la
 * plume, elle tue par elle-même, et le disque affiché est le disque qui tue.
 */

const drops = defineQuery([Ricochet, Hazard, Position, PrevPosition, Facing, Lifetime])

function spawnDrop(
  world: SimWorld,
  x: number,
  y: number,
  angle: number,
  lifeMs: number,
  splitsLeft: number,
): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, PrevPosition, eid)
  addComponent(world, Facing, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  addComponent(world, Ricochet, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  PrevPosition.x[eid] = x
  PrevPosition.y[eid] = y
  Facing.angle[eid] = angle
  Hazard.kind[eid] = HAZARD_SPLATTER
  Hazard.radius[eid] = POWERUP_BASE.splatter.radius
  Hazard.maxRadius[eid] = POWERUP_BASE.splatter.radius
  // Zéro : `hazardSystem` fait grossir le rayon dès que `growthRate` est positif.
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = lifeMs
  Ricochet.splitsLeft[eid] = splitsLeft
  return eid
}

/**
 * Lance une goutte depuis (x, y), dans la direction du regard du joueur.
 * Comme la Ruée et non comme le Gel : c'est un geste orienté, pas une zone
 * posée sous les pieds.
 */
export function launchSplatter(world: SimWorld, stats: RunStats, x: number, y: number): void {
  const angle = world.playerEid >= 0 ? (Facing.angle[world.playerEid] ?? 0) : 0
  const splits = stats.rules.has('splitSplatter') ? 1 : 0
  spawnDrop(world, x, y, angle, stats.splatterLifeMs, splits)
}

export function ricochetSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale

  // Photographie fixe : bitECS rend le tableau interne, et un dédoublement y
  // pousserait une goutte traitée dans la même passe selon l'ordre interne de
  // la bibliothèque. Même piège que `spawnAfterburn` dans `lifetime.ts`.
  for (const eid of [...drops(world)]) {
    // Sans PrevPosition à jour, le rendu ne peut pas interpoler : la goutte
    // avancerait par saccades d'un pas de simulation.
    PrevPosition.x[eid] = Position.x[eid]!
    PrevPosition.y[eid] = Position.y[eid]!

    const angle = Facing.angle[eid]!
    let ux = Math.cos(angle)
    let uy = Math.sin(angle)
    const speed = POWERUP_BASE.splatter.speed
    let x = Position.x[eid]! + ux * speed * dt
    let y = Position.y[eid]! + uy * speed * dt

    const r = Hazard.radius[eid]!
    let bounced = false
    if (x < r) {
      x = r
      ux = -ux
      bounced = true
    } else if (x > world.arena.width - r) {
      x = world.arena.width - r
      ux = -ux
      bounced = true
    }
    if (y < r) {
      y = r
      uy = -uy
      bounced = true
    } else if (y > world.arena.height - r) {
      y = world.arena.height - r
      uy = -uy
      bounced = true
    }

    Position.x[eid] = x
    Position.y[eid] = y

    if (!bounced) {
      continue
    }

    const reflected = Math.atan2(uy, ux)
    Facing.angle[eid] = reflected

    if (Ricochet.splitsLeft[eid]! <= 0) {
      continue
    }

    // Les deux gouttes s'écartent SYMÉTRIQUEMENT du cap réfléchi : garder la
    // mère sur son cap et ne dévier que la fille donnerait une paire dont une
    // seule branche a vraiment été dirigée, et le rebond se lirait comme un bug.
    const half = POWERUP_BASE.splatter.splitAngle / 2
    Ricochet.splitsLeft[eid] = 0
    Facing.angle[eid] = reflected - half
    spawnDrop(world, x, y, reflected + half, Lifetime.remaining[eid]!, 0)
  }

  return world
}
```

- [ ] **Step 8 : brancher dans le pas**

Dans `src/sim/step.ts`, ajouter l'import et l'appel juste après `seekerSystem(world)` :

```ts
  seekerSystem(world)
  ricochetSystem(world)
  hazardSystem(world, stats)
```

- [ ] **Step 9 : relancer**

Run: `npx vitest run src/sim/systems/ricochet.test.ts`
Expected: PASS

- [ ] **Step 10 : le typecheck réclame image et son (attendu)**

Run: `npm run typecheck`
Expected: **FAIL attendu** sur `POWERUP_ICONS`, `DRAWERS` et `powerupVoices`, qui réclament `splatter`. Levé à la tâche 12.

Run: `npm test && npm run lint`
Expected: PASS

---

## Task 12 : la Bavure — activation, image et son

**Files:**
- Modify: `src/sim/powerups/activate.ts`
- Modify: `src/ui/icons.ts`
- Modify: `src/render/views/pickup.ts`
- Modify: `src/render/views/hazard.ts`
- Modify: `src/audio/sounds.ts`

**Interfaces:**
- Consumes: `launchSplatter` (tâche 11), `HAZARD_SPLATTER`
- Produces: le genre `'splatter'` est jouable de bout en bout

- [ ] **Step 1 : l'activation**

Dans `src/sim/powerups/activate.ts`, ajouter `import { launchSplatter } from '../systems/ricochet'` et la branche après `case 'volley'` :

```ts
    case 'splatter':
      launchSplatter(world, stats, x, y)
      break
```

- [ ] **Step 2 : le pictogramme**

Dans `src/ui/icons.ts`, ajouter à `POWERUP_ICONS` :

```ts
  // Une goutte pleine et sa trajectoire brisée : ce qui distingue la Bavure
  // des autres zones, c'est qu'elle voyage et qu'elle rebondit.
  splatter:
    '<circle cx="20" cy="22" r="7" fill="currentColor"/><path d="M26 27l12 10-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>',
```

- [ ] **Step 3 : le tracé Pixi de la pastille**

Dans `src/render/views/pickup.ts` :

```ts
/** Mêmes tracés que `POWERUP_ICONS.splatter` (icons.ts), à garder en phase à la main. */
function drawSplatter(gfx: Graphics): void {
  const [cx, cy] = P(20, 22)
  gfx.circle(cx, cy, 7 * S).fill({ color: INK.paper })
  gfx
    .moveTo(...P(26, 27))
    .lineTo(...P(38, 37))
    .lineTo(...P(30, 45))
    .stroke({ color: INK.paper, width: 1.6, cap: 'round', join: 'round', alpha: 0.6 })
}
```

```ts
const DRAWERS: Record<PowerUpKind, (gfx: Graphics) => void> = {
  blast: drawBlast,
  freeze: drawFreeze,
  bramble: drawBramble,
  blotter: drawBlotter,
  dash: drawDash,
  halo: drawHalo,
  volley: drawVolley,
  splatter: drawSplatter,
}
```

- [ ] **Step 4 : le tracé Pixi de la goutte en vol**

Dans `src/render/views/hazard.ts`, ajouter `HAZARD_SPLATTER` à l'import, la couleur, et le tracé.

```ts
  [HAZARD_SPLATTER]: INK.paper,
```

```ts
/**
 * La goutte de Bavure. Contrairement à la plume, elle tue par elle-même : le
 * disque plein DOIT couvrir tout `radius`, sans quoi une bande mortelle
 * resterait invisible (la règle « le dessin contient ce qui tue », spec §3.1).
 * Les bavures autour ne font que déborder, jamais rétrécir.
 */
function drawSplatterDrop(gfx: Graphics, radius: number, color: number, time: number): void {
  gfx.circle(0, 0, radius).fill({ color })

  // Trois éclaboussures satellites, en orbite lente : une goutte parfaitement
  // ronde se lit comme une bille, pas comme de l'encre.
  const spin = time * 0.0013
  for (let i = 0; i < 3; i++) {
    const a = spin + (i / 3) * Math.PI * 2
    const d = radius * 1.15
    gfx.circle(Math.cos(a) * d, Math.sin(a) * d, radius * 0.32).fill({ color, alpha: 0.65 })
  }
}
```

La brancher dans `update`, **juste après le bloc `HAZARD_QUILL`** posé à la tâche 10. `time` est déjà un paramètre de `update` — il sert au tourbillon du Buvard, et c'est du temps de simulation, donc l'orbite des éclaboussures gèle pendant un hitstop comme tout le reste.

```ts
      if (kind === HAZARD_QUILL) {
        if (angle !== null) {
          drawQuill(gfx, radius, color, angle)
        }
        return
      }

      if (kind === HAZARD_SPLATTER) {
        drawSplatterDrop(gfx, radius, color, time)
        return
      }

      if (kind === HAZARD_BLOTTER) {
```

- [ ] **Step 5 : la voix**

Dans `src/audio/sounds.ts`, ajouter dans `powerupVoices` avant le `default` :

```ts
    case 'splatter':
      // Un « ploc » mat qui descend : de l'encre qui tombe, pas une détonation.
      return [{ source: 'tone', freq: 380, freqEnd: 190, durationMs: 180, gain: 0.24 }]
```

- [ ] **Step 6 : le typecheck repasse au vert**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7 : vérifier à l'œil**

Run: `npm run dev`

1. Ramasser une Bavure : la goutte part **dans la direction du regard**.
2. Elle rebondit sur les quatre murs sans jamais les traverser ni s'y coller.
3. Elle tue au contact, et sa trajectoire reste lisible.
4. Aucun clignotement au rebond (l'interpolation coupe le coin, elle ne saute pas).
5. Le pictogramme au sol se distingue des sept autres.

- [ ] **Step 8 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 9 : commit (les tâches 11 et 12 ensemble)**

```bash
git add src/sim/data/powerups.ts src/sim/components/index.ts src/sim/upgrades/stats.ts src/sim/systems/hazards.ts src/sim/systems/ricochet.ts src/sim/systems/ricochet.test.ts src/sim/step.ts src/sim/powerups/activate.ts src/ui/icons.ts src/render/views/pickup.ts src/render/views/hazard.ts src/audio/sounds.ts
git commit -m "feat(sim): la Bavure, seule zone qui continue à travailler pendant qu'on esquive"
```

---

## Task 13 : les quatre cartes des nouveaux power-ups

**Files:**
- Modify: `src/sim/data/upgrades.ts`
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `RunStats.volleyCount` (tâche 9), `RunStats.splatterLifeMs` (tâche 11), les règles `nestedQuills` et `splitSplatter` déjà lues par `launchVolley` et `launchSplatter`
- Produces: quatre `UpgradeDef` — `volley-count`, `nested-quills`, `splatter-life`, `splatter-split`

- [ ] **Step 1 : ajouter les deux communes**

Dans `src/sim/data/upgrades.ts`, section « Communes », après `dash-radius` :

```ts
  {
    id: 'volley-count',
    rarity: 'common',
    stackable: true,
    requires: 'volley',
    apply: (s) => {
      s.volleyCount += 1
    },
  },
  {
    id: 'splatter-life',
    rarity: 'common',
    stackable: true,
    requires: 'splatter',
    apply: (s) => {
      s.splatterLifeMs += 1500
    },
  },
```

- [ ] **Step 2 : ajouter les deux rares**

Section « Rares », après `lasting-bramble` :

```ts
  {
    id: 'nested-quills',
    rarity: 'rare',
    stackable: false,
    requires: 'volley',
    apply: (s) => {
      s.rules.add('nestedQuills')
    },
  },
  {
    id: 'splatter-split',
    rarity: 'rare',
    stackable: false,
    requires: 'splatter',
    apply: (s) => {
      s.rules.add('splitSplatter')
    },
  },
```

- [ ] **Step 3 : lancer les tests i18n et constater l'échec attendu**

Run: `npx vitest run src/i18n/upgrades.test.ts`
Expected: FAIL — huit clés manquantes, quatre par locale.

- [ ] **Step 4 : les clés françaises**

Dans `src/i18n/locales/fr.json`, ajouter avant `"upgrade.second-ink.name"` :

```json
  "upgrade.volley-count.name": "Volée nourrie",
  "upgrade.volley-count.desc": "Une plume de plus par volée",
  "upgrade.nested-quills.name": "Plumes gigognes",
  "upgrade.nested-quills.desc": "Chaque impact relance une plume",
  "upgrade.splatter-life.name": "Bavure tenace",
  "upgrade.splatter-life.desc": "La bavure rebondit plus longtemps",
  "upgrade.splatter-split.name": "Éclaboussure",
  "upgrade.splatter-split.desc": "La bavure se dédouble au premier rebond",
```

- [ ] **Step 5 : les clés anglaises**

Dans `src/i18n/locales/en.json`, au même endroit :

```json
  "upgrade.volley-count.name": "Fuller Volley",
  "upgrade.volley-count.desc": "One more quill per volley",
  "upgrade.nested-quills.name": "Nested Quills",
  "upgrade.nested-quills.desc": "Every impact launches another quill",
  "upgrade.splatter-life.name": "Stubborn Splatter",
  "upgrade.splatter-life.desc": "The splatter bounces for longer",
  "upgrade.splatter-split.name": "Spatter",
  "upgrade.splatter-split.desc": "The splatter splits on its first bounce",
```

- [ ] **Step 6 : relancer les tests i18n**

Run: `npx vitest run src/i18n/upgrades.test.ts src/i18n/parity.test.ts`
Expected: PASS

- [ ] **Step 7 : vérifier à l'œil**

Run: `npm run dev`

1. Ramasser une Volée, survivre à la vague : « Volée nourrie » et « Plumes gigognes » peuvent apparaître dans le tirage.
2. Prendre « Volée nourrie » deux fois : la volée suivante lance bien 5 plumes.
3. Prendre « Plumes gigognes » : chaque impact relance une plume, **une seule fois** (pas de cascade).
4. Même vérification pour « Bavure tenace » et « Éclaboussure ».
5. Aucune carte des nouveaux power-ups n'apparaît **avant** d'avoir ramassé le power-up correspondant.

- [ ] **Step 8 : suite complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 9 : commit**

```bash
git add src/sim/data/upgrades.ts src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(sim): quatre cartes pour la Volée et la Bavure"
```

---

## Task 14 : mettre le README à jour

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: rien de code

- [ ] **Step 1 : la limite connue sur les valeurs d'équilibrage**

Dans `README.md`, section « Known limitations », remplacer la première puce par :

```markdown
- Balance values in `src/sim/data/` are first-pass estimates; see
  `docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md` §11 for the open
  playtest questions. Two offensive power-ups (Quill Volley, Splatter) were added
  on 2026-08-02 without touching the difficulty curve — see
  `docs/superpowers/specs/2026-08-02-correctifs-decompte-et-deux-power-ups-design.md` §10.
```

- [ ] **Step 2 : vérifier**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS

- [ ] **Step 3 : commit**

```bash
git add README.md
git commit -m "docs: signaler les deux power-ups ajoutés sans réglage de difficulté"
```

---

## Revue finale

- [ ] **Une partie complète, de bout en bout**

Run: `npm run build && npm run preview`

1. Aucune erreur console.
2. Jouer jusqu'à la vague 5 au moins : les huit genres de pastille sauf le Buvard apparaissent ; **aucun Buvard**.
3. Ramasser une Ronce et se jeter dans un ennemi : aucune mort.
4. Reprendre après pause et après carte : décompte à chaque fois.
5. La carte « Onde de choc » n'apparaît jamais.
6. Redimensionner en cours de partie : les écrans suivent, le HUD ne bouge pas.

- [ ] **Vérifier qu'aucun `git add -A` n'a été utilisé**

Run: `git log --oneline -14 && git status --porcelain`
Expected: 14 commits sur les tâches ci-dessus, et un arbre propre — aucun fichier étranger emporté au passage.
