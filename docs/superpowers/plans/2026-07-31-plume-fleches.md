# Retrait du Trait d'encre, Plume élargie, sillage en flèches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sortir le Trait d'encre et sa couronne de piques du jeu, porter la ruée de la Plume à 480 px dans un couloir de 140 px, et redessiner son sillage en chevrons qui donnent la direction sans cesser d'être exactement la zone mortelle.

**Architecture:** Tout ce qui tue reste une entité `Hazard` dans `src/sim/` ; `src/render/` la dessine telle qu'elle est. Le chevron est inscrit dans le disque mortel réel, jamais dessiné à sa place.

**Tech Stack:** TypeScript strict, bitECS, Pixi.js 8 (`Graphics`), Vitest (environnement `node`, **sans DOM ni WebGL**), Biome.

**Spec :** `docs/superpowers/specs/2026-07-31-plume-fleches-design.md`

## Global Constraints

- **`src/sim/` est déterministe et pur** : pas de `pixi.js`/`render/`/`ui/`/`app/`, pas de `window`/`document`/`performance`/`localStorage`, **pas de `Math.random()`**. Les non-null assertions (`!`) y sont autorisées et idiomatiques.
- **`src/render/` n'a PAS droit à `!`** — Biome ne désactive la règle que pour `src/sim/**`. `stage.ts` expose un lecteur indexé sûr `at(...)` pour les composants.
- Biome `noUnusedImports` / `noUnusedVariables` sont des **erreurs**.
- Toute clé i18n retirée doit l'être dans **les deux** locales (`parity.test.ts`).
- **Les identifiants numériques ne sont jamais renumérotés** : l'indice libéré reçoit `null` dans `POWERUP_BY_ID`.
- Commentaires et messages de commit **en français**. Convention : `type(scope): sujet`.
- Avant chaque commit : `npm run lint && npm run typecheck && npm test`.
- **Stage explicitement les fichiers touchés, jamais `git add -A`.**

---

### Task 1: Retirer le Trait d'encre et sa couronne

**Files:**
- Delete: `src/sim/systems/spikes.ts`, `src/sim/systems/spikes.test.ts`
- Modify: `src/sim/data/powerups.ts`, `src/sim/powerups/activate.ts`, `src/sim/powerups/activate.test.ts`, `src/sim/step.ts`, `src/sim/components/index.ts`, `src/sim/systems/hazards.ts`, `src/sim/upgrades/stats.ts`, `src/sim/data/upgrades.ts`, `src/render/views/hazard.ts`, `src/render/stage.ts`, `src/render/views/pickup.ts`, `src/ui/icons.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`

**Interfaces:**
- Consumes: rien.
- Produces: `PowerUpKind` perd `'trail'` ; `RunStats` perd `trailDurationMs` ; `HAZARD_SPIKE` et `Orbiting` n'existent plus. **`HAZARD_TRAIL` reste** — c'est le sillage de la ruée.

- [ ] **Step 1: Retirer le power-up de la table de données**

Dans `src/sim/data/powerups.ts` : retirer `'trail'` de `PowerUpKind` et de `POWERUP_KINDS`, la ligne `trail: 3` de `POWERUP_ID`, l'entrée `trail: { … }` de `POWERUP_BASE`, et la constante `HAZARD_SPIKE` avec son commentaire. Dans `POWERUP_BY_ID`, remplacer `'trail'` (indice 3) par `null`.

Étendre le commentaire au-dessus de `POWERUP_ID` au troisième trou — il énumère aujourd'hui « 4 : Rature, 8 : Séchage » et doit devenir « 3 : Trait d'encre, 4 : Rature, 8 : Séchage ».

- [ ] **Step 2: Retirer l'activation, le système et le composant**

Dans `src/sim/powerups/activate.ts`, supprimer tout le bloc `case 'trail': { … }` ainsi que les imports devenus inutiles (`HAZARD_SPIKE`, `Orbiting`, et `PrevPosition` s'il ne sert plus dans ce fichier).

Supprimer `src/sim/systems/spikes.ts` et `src/sim/systems/spikes.test.ts`, et retirer l'import et l'appel de `spikeSystem` dans `src/sim/step.ts`.

Dans `src/sim/components/index.ts`, supprimer le composant `Orbiting` et sa docstring.

Dans `src/sim/systems/hazards.ts`, retirer `HAZARD_SPIKE` de l'import et de l'ensemble `LETHAL`, qui redevient :

```ts
const LETHAL = new Set([HAZARD_BLAST, HAZARD_TRAIL, HAZARD_AFTERBURN])
```

- [ ] **Step 3: Retirer le stat et les deux cartes**

Dans `src/sim/upgrades/stats.ts`, supprimer `trailDurationMs` de l'interface et de `createRunStats`.

Dans `src/sim/data/upgrades.ts`, supprimer les objets d'`id` `'trail-duration'` (commune) et `'lasting-trail'` (rare).

Dans les deux locales, supprimer les quatre clés `upgrade.trail-duration.{name,desc}` et `upgrade.lasting-trail.{name,desc}`.

- [ ] **Step 4: Retirer le rendu de la couronne**

Dans `src/render/views/hazard.ts` : supprimer la fonction `drawSpike`, les constantes `SPIKE_TIP_RATIO`, `SPIKE_HALF_WIDTH_RATIO`, `SPIKE_BACK_RATIO`, `SPIKE_SHRINK_MIN`, `SPIKE_SHRINK_RANGE`, la branche `if (kind === HAZARD_SPIKE) { … return }`, l'entrée `[HAZARD_SPIKE]` de `COLORS` et l'import de `HAZARD_SPIKE`. Vérifier si `POWERUP_BASE` est encore utilisé dans ce fichier — s'il ne l'est plus, retirer son import aussi.

**Ne pas toucher** au champ `angle` de l'interface `update` ni à `remainingMs` : la Task 3 réutilise `angle` pour le chevron. En revanche, dans `src/render/stage.ts`, le calcul d'angle propre aux piques (le `Math.atan2` par rapport au joueur, et la variable d'origine qu'il utilise) disparaît — le remplacer temporairement par `angle: 0`, que la Task 3 rebranchera sur `Facing`.

- [ ] **Step 5: Retirer l'icône et le pictogramme**

Dans `src/ui/icons.ts`, supprimer l'entrée `trail` de `POWERUP_ICONS`. Dans `src/render/views/pickup.ts`, supprimer `drawTrail` et son entrée de `DRAWERS`.

- [ ] **Step 6: Adapter les tests**

Dans `src/sim/powerups/activate.test.ts`, supprimer le cas qui vérifie que `trail` crée une couronne de piques, et les imports devenus inutiles.

Si un test de `src/sim/upgrades/draw.test.ts` nomme une carte supprimée ou compte le pool, le corriger **en le rendant vrai**, pas en supprimant l'assertion.

- [ ] **Step 7: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS. Grepper ensuite `src/` pour `trail`, `Trail`, `SPIKE`, `Spike`, `Orbiting` : les seuls survivants légitimes sont `HAZARD_TRAIL`, `dashWakeSystem` et le fichier `dash-wake*` (le sillage de la ruée), plus le commentaire des identifiants.

```bash
git add src/sim/data/powerups.ts src/sim/powerups/activate.ts src/sim/powerups/activate.test.ts src/sim/step.ts src/sim/components/index.ts src/sim/systems/hazards.ts src/sim/upgrades/stats.ts src/sim/data/upgrades.ts src/render/views/hazard.ts src/render/stage.ts src/render/views/pickup.ts src/ui/icons.ts src/i18n/locales/en.json src/i18n/locales/fr.json
git rm src/sim/systems/spikes.ts src/sim/systems/spikes.test.ts
git commit -m "feat(powerups): retirer le Trait d'encre et sa couronne de piques"
```

---

### Task 2: La Plume passe à 480 px sur 140 de large

**Files:**
- Modify: `src/sim/data/powerups.ts`, `src/sim/data/upgrades.ts`
- Test: `src/sim/systems/dash-wake.test.ts`, `src/sim/systems/dash-kill.test.ts` (si une valeur y est codée en dur)

**Interfaces:**
- Consumes: la table allégée par la Task 1.
- Produces: `POWERUP_BASE.dash.durationMs = 665`, `.radius = 70` ; la carte `dash-radius` multiplie par 1,15.

- [ ] **Step 1: Régler la Plume**

Dans `src/sim/data/powerups.ts`, remplacer l'entrée `dash` de `POWERUP_BASE` et sa docstring :

```ts
  /**
   * 274 px de course dans un couloir de 80 px ne suffisaient pas à casser un
   * encerclement. À 665 ms et vitesse inchangée (720 px/s), la ruée couvre
   * ≈ 480 px, soit 30 % de la largeur d'arène, dans un couloir de 140 px.
   *
   * La vitesse ne bouge pas volontairement : elle fixe la densité du sillage
   * (un segment tous les 21,6 px à `wakeIntervalMs`), et l'augmenter aurait
   * obligé à resserrer la cadence pour garder un couloir continu.
   */
  dash: { speed: 720, durationMs: 665, radius: 70, wakeIntervalMs: 30, wakeLifeMs: 800 },
```

- [ ] **Step 2: Ramener la carte de largeur à +15 %**

Dans `src/sim/data/upgrades.ts`, la carte `dash-radius` :

```ts
    apply: (s) => {
      // +15 % et non +30 % : la carte est cumulable, et sur la nouvelle base de
      // 70 deux exemplaires donnaient un rayon de 118, soit un couloir de
      // 236 px — un sixième de l'arène balayé d'un coup. À 15 %, deux cartes
      // donnent 92 (184 px), une progression relative comparable à celle
      // qu'elle avait sur l'ancienne base de 40.
      s.dashRadius *= 1.15
    },
```

Mettre à jour la description dans les deux locales : `"+15% dash width"` / `"+15% de largeur de ruée"`.

- [ ] **Step 3: Vérifier que rien ne code les anciennes valeurs en dur**

Lancer la suite et lire les échecs éventuels. `dash-kill.test.ts` place ses ennemis à des distances choisies pour un rayon de 40 (30 px « dedans », 200 px « dehors ») : **30 px reste dedans et 200 px reste dehors à un rayon de 70**, donc les deux cas gardent leur sens — mais vérifie-le plutôt que de le supposer, et si un test devient trivialement vrai (l'ennemi « hors de portée » désormais dedans), corrige la distance pour qu'il teste encore une frontière.

`dash-wake.test.ts` compte 33 segments sur 60 pas : ce compte dépend de `wakeIntervalMs` (inchangé) et non de la durée, donc il doit passer tel quel.

- [ ] **Step 4: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`

```bash
git add src/sim/data/powerups.ts src/sim/data/upgrades.ts src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(powerups): porter la ruée à 480 px dans un couloir de 140"
```

---

### Task 3: Le sillage devient une flèche

**Files:**
- Modify: `src/sim/systems/dash-wake.ts`, `src/sim/systems/dash-wake.test.ts`, `src/render/stage.ts`, `src/render/views/hazard.ts`

**Interfaces:**
- Consumes: `Facing` de `@/sim/components` (composant existant, `{ angle: Types.f32 }`).
- Produces: chaque segment de sillage porte `Facing` ; le rendu dessine un chevron inscrit dans le disque mortel.

- [ ] **Step 1: Écrire le test**

Dans `src/sim/systems/dash-wake.test.ts`, ajouter :

```ts
  it("oriente le segment dans le sens de la ruée", () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 1000
    // Ruée vers le haut-droite : angle attendu -π/4.
    Dashing.vx[w.playerEid] = 500
    Dashing.vy[w.playerEid] = -500

    dashWakeSystem(w, stats)
    w.time += FIXED_DT
    dashWakeSystem(w, stats)

    const eids = wakeEids(w)
    expect(eids.length).toBeGreaterThan(0)
    for (const eid of eids) {
      expect(hasComponent(w, Facing, eid)).toBe(true)
      expect(Facing.angle[eid]).toBeCloseTo(-Math.PI / 4, 4)
    }
  })
```

Ajouter `Facing` à l'import de `../components` et `hasComponent` à celui de `bitecs`.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/sim/systems/dash-wake.test.ts`
Expected: FAIL — le segment ne porte pas `Facing`.

- [ ] **Step 3: Poser la direction sur le segment**

Dans `src/sim/systems/dash-wake.ts`, ajouter `Facing` à l'import de `../components`, puis après `Lifetime.remaining[eid] = …` :

```ts
  // La direction de la ruée, portée par `Facing` — un composant qui existe déjà
  // et ne contient qu'un angle. Surtout pas un champ de `Hazard` « qui a l'air
  // libre » : c'est exactement l'erreur commise avec `growthRate`, que
  // `hazardSystem` lisait en fait sur toutes les zones. Le rendu s'en sert pour
  // pointer le chevron dans le sens de la course.
  addComponent(world, Facing, eid)
  Facing.angle[eid] = Math.atan2(Dashing.vy[player]!, Dashing.vx[player]!)
```

- [ ] **Step 4: Transmettre l'angle au rendu**

Dans `src/render/stage.ts`, remplacer le `angle: 0` laissé par la Task 1 :

```ts
          angle: hasComponent(world, Facing, eid) ? at(Facing.angle, eid) : 0,
```

en important `Facing` depuis `@/sim/components` (`hasComponent` et `at` sont déjà en place dans ce fichier).

- [ ] **Step 5: Dessiner le chevron**

Dans `src/render/views/hazard.ts`, ajouter au-dessus de `createHazardView` :

```ts
// Géométrie du chevron, en fraction de `radius` — le rayon du disque mortel
// réel. Toutes dérivées de `radius` pour que le chevron reste par construction
// inscrit dans le disque : les ailes sont à √(0,45² + 0,62²) = 0,766 · radius
// du centre, la pointe touche le bord sans le dépasser.
const CHEVRON_TIP_RATIO = 1
const CHEVRON_WING_BACK_RATIO = 0.45
const CHEVRON_WING_HALF_RATIO = 0.62
const CHEVRON_NOTCH_RATIO = 0.1

/**
 * Un segment de sillage : le disque mortel réel (exactement le cercle testé
 * par la collision), avec un chevron inscrit dedans qui donne le sens de la
 * ruée. Le disque n'est pas une décoration — un chevron seul laisserait une
 * bande mortelle invisible sur ses flancs, et l'allonger pour la couvrir
 * annoncerait du danger là où il n'y en a pas. Le disque dit la vérité, le
 * chevron donne la lecture (spec §4.2).
 *
 * `visible` est le plancher de visibilité propre au sillage : la fenêtre de
 * fondu partagée vaut 400 ms contre 800 ms de vie, si bien que la seconde
 * moitié de la vie d'un segment était quasi transparente — et toujours
 * mortelle. Un segment reste lisible tant qu'il tue.
 */
function drawWake(gfx: Graphics, radius: number, color: number, angle: number, lifeRatio: number): void {
  const visible = 0.25 + 0.75 * lifeRatio

  gfx.circle(0, 0, radius).fill({ color, alpha: 0.18 * visible })
  gfx.circle(0, 0, radius).stroke({ color, width: 1.5, alpha: 0.4 * visible })

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const tip = radius * CHEVRON_TIP_RATIO
  const back = radius * CHEVRON_WING_BACK_RATIO
  const half = radius * CHEVRON_WING_HALF_RATIO
  const notch = radius * CHEVRON_NOTCH_RATIO

  // Coordonnées nommées plutôt que des tuples indexés : `src/render/` n'a pas
  // droit à `!`, et indexer un tableau littéral l'exigerait sous
  // `noUncheckedIndexedAccess`.
  const tipX = cos * tip
  const tipY = sin * tip
  const wingX = -cos * back
  const wingY = -sin * back
  const sideX = -sin * half
  const sideY = cos * half
  const notchX = -cos * notch
  const notchY = -sin * notch

  gfx
    .moveTo(tipX, tipY)
    .lineTo(wingX + sideX, wingY + sideY)
    .lineTo(notchX, notchY)
    .lineTo(wingX - sideX, wingY - sideY)
    .closePath()
    .fill({ color, alpha: 0.75 * visible })
}
```

Puis remplacer la branche `else if (kind === HAZARD_TRAIL) { … }` de `update` par :

```ts
      } else if (kind === HAZARD_TRAIL) {
        drawWake(gfx, radius, color, angle, lifeRatio)
```

- [ ] **Step 6: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — dont le nouveau cas de `dash-wake.test.ts`.

```bash
git add src/sim/systems/dash-wake.ts src/sim/systems/dash-wake.test.ts src/render/stage.ts src/render/views/hazard.ts
git commit -m "feat(render): dessiner le sillage de la ruée en chevrons"
```

---

## Vérification manuelle finale

Lancer `npm run dev` et vérifier (spec §6) :

1. Le Trait d'encre n'apparaît plus au sol et ses deux cartes ne sortent plus au choix d'amélioration.
2. La ruée traverse près d'un tiers de l'arène en balayant un large couloir.
3. Le sillage se lit comme une suite de flèches pointées dans le sens de la course, et tout ce qui est dessiné tue.
4. Deux « Plume large » élargissent nettement le couloir sans le rendre absurde.
