# Ronce d'encre et tirage pondéré — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurer la couronne d'épines retirée quelques heures plus tôt, sous le nom « Ronce d'encre », et remplacer le tirage uniforme des pastilles par un tirage pondéré qui raréfie le Halo.

**Architecture:** La couronne est restaurée depuis git (`d0c80e5^`) plutôt que réécrite — c'est le code qui avait été relu et validé. Tout son vocabulaire est renommé au passage. Le tirage pondéré vit dans `sim/systems/pickup.ts` et reste déterministe (`world.rng`).

**Tech Stack:** TypeScript strict, bitECS, Pixi.js 8, Vitest (environnement `node`, **sans DOM ni WebGL**), Biome.

## Global Constraints

- **`src/sim/` est déterministe et pur** : pas de `pixi.js`/`render/`/`ui/`/`app/`, pas de `window`/`document`/`performance`/`localStorage`, **pas de `Math.random()`** — tout aléa passe par `world.rng`. Les non-null assertions (`!`) y sont autorisées et idiomatiques.
- **`src/render/` n'a PAS droit à `!`** ; `stage.ts` expose un lecteur indexé sûr `at(...)`.
- Toute clé i18n ajoutée doit l'être dans **les deux** locales (`parity.test.ts`), et `src/i18n/upgrades.test.ts` exige que chaque carte ait `name` + `desc` et qu'aucune clé orpheline ne survive.
- `src/sim/data/powerups.test.ts` impose l'aller-retour `POWERUP_BY_ID[POWERUP_ID[k]] === k` et l'accord `POWERUP_KINDS` / `Object.keys(POWERUP_ID)`.
- Commentaires et messages de commit **en français**. Convention : `type(scope): sujet`.
- Avant chaque commit : `npm run lint && npm run typecheck && npm test`.
- Stage explicitement les fichiers touchés, **jamais `git add -A`**.

---

### Task 1: Restaurer la couronne sous le nom « Ronce d'encre »

**Files:**
- Create: `src/sim/systems/bramble.ts`, `src/sim/systems/bramble.test.ts`
- Modify: `src/sim/data/powerups.ts`, `src/sim/components/index.ts`, `src/sim/powerups/activate.ts`, `src/sim/powerups/activate.test.ts`, `src/sim/step.ts`, `src/sim/systems/hazards.ts`, `src/sim/upgrades/stats.ts`, `src/sim/data/upgrades.ts`, `src/render/views/hazard.ts`, `src/render/stage.ts`, `src/render/views/pickup.ts`, `src/ui/icons.ts`, `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`

**Le point de départ : tout est dans git.** Le retrait est le commit `d0c80e5`. `git show d0c80e5^:<chemin>` donne n'importe quel fichier tel qu'il était juste avant, et `git show d0c80e5` montre exactement ce qui a été enlevé. **Restaure depuis là plutôt que de réécrire** : ce code a été relu, corrigé (deux tours de revue) et validé, notamment sur un point subtil décrit plus bas.

**Le renommage, appliqué partout :**

| Avant | Après |
|---|---|
| power-up `trail` | `bramble` |
| `HAZARD_SPIKE` | `HAZARD_BRAMBLE` |
| `spikes.ts` / `spikeSystem` / `spikeAngle` | `bramble.ts` / `brambleSystem` / `brambleAngle` |
| `POWERUP_BASE.trail` | `POWERUP_BASE.bramble` |
| `stats.trailDurationMs` | `stats.brambleDurationMs` |
| `drawSpike`, `SPIKE_*` | `drawBramble`, `BRAMBLE_*` |
| cartes `trail-duration`, `lasting-trail` | `bramble-duration`, `lasting-bramble` |

Noms d'affichage : **fr « Ronce d'encre » / en « Bramble »**. Les deux cartes gardent leur sens : `bramble-duration` (commune, +900 ms, `requires: 'bramble'`) et `lasting-bramble` (rare, durée ×2, `requires: 'bramble'`). Reprends leurs libellés d'avant le retrait en remplaçant « traînée » par la ronce — le texte disait « La traînée dure plus longtemps », ce qui était déjà faux pour une couronne d'épines.

- [ ] **Step 1: Restaurer les valeurs et les identifiants**

Dans `src/sim/data/powerups.ts`, restaure l'entrée `POWERUP_BASE.trail` d'avant le retrait sous le nom `bramble` (`git show d0c80e5^:src/sim/data/powerups.ts`), avec ses réglages **inchangés** : `durationMs: 5000`, `count: 6`, `orbitRadius: 40`, `spikeRadius: 11`, `angularRate: 0.0016`, `warnMs: 900`. Le long commentaire sur `count` (qui explique par le calcul pourquoi 6 et pas 7 — les trous entre les piques) doit revenir tel quel : c'est un raisonnement chiffré qu'on ne veut pas refaire.

Ajoute `'bramble'` à `PowerUpKind` et `POWERUP_KINDS`, et **réutilise l'identifiant 3** dans `POWERUP_ID` (`POWERUP_BY_ID[3]` repasse de `null` à `'bramble'`). C'est le même power-up restauré sous un autre nom, rien ne persiste les identifiants hors d'une run, et lui en donner un neuf laisserait un trou pour rien. Mets à jour le commentaire des identifiants : les trous restants sont 4 (Rature) et 8 (Séchage).

Restaure `HAZARD_SPIKE` sous le nom `HAZARD_BRAMBLE`, valeur **7** (libre).

- [ ] **Step 2: Restaurer le composant, le système et son test**

Restaure le composant `Orbiting` dans `src/sim/components/index.ts` (`git show d0c80e5^:src/sim/components/index.ts`), avec sa docstring — **y compris le champ `rate`**, qui porte le taux angulaire. Ce champ existe parce qu'une première version rangeait ce taux dans `Hazard.growthRate` « qui a l'air libre » : `hazardSystem` le lit en réalité sur toutes les zones et faisait entrer les piques dans sa branche de croissance. Le commentaire qui l'explique doit revenir avec.

Restaure `spikes.ts` et `spikes.test.ts` sous `bramble.ts` / `bramble.test.ts`, en renommant `spikeSystem` → `brambleSystem` et `spikeAngle` → `brambleAngle`. Rebranche l'appel dans `src/sim/step.ts` **à la position qu'occupait `spikeSystem`** (l'ordre des systèmes est figé et documenté). Remets `HAZARD_BRAMBLE` dans l'ensemble `LETHAL` de `src/sim/systems/hazards.ts`.

Restaure `stats.brambleDurationMs` (ex-`trailDurationMs`) dans `src/sim/upgrades/stats.ts`, et le `case 'bramble'` d'`activate.ts` avec son test.

- [ ] **Step 3: Le système pose lui-même l'orientation de chaque pique**

**Seul écart volontaire par rapport au code restauré.** Avant le retrait, `stage.ts` calculait l'angle de chaque pique par `Math.atan2(pique − joueur)`. Depuis, le sillage de la ruée porte son orientation dans un composant `Facing` que `stage.ts` lit sans rien calculer.

Fais pareil ici : dans `brambleSystem`, après avoir repositionné une pique, pose `addComponent(world, Facing, eid)` (à la création, dans `activate.ts`) et écris `Facing.angle[eid] = a` — l'angle que le système vient déjà de calculer. `stage.ts` n'a alors **aucun cas particulier à ajouter** : sa ligne `angle: hasComponent(world, Facing, eid) ? at(Facing.angle, eid) : 0` couvre les deux. Supprime toute tentation de réintroduire un `atan2` dans le rendu.

- [ ] **Step 4: Restaurer le rendu**

Restaure `drawSpike` sous le nom `drawBramble` et ses constantes `SPIKE_*` → `BRAMBLE_*` dans `src/render/views/hazard.ts` (`git show d0c80e5^:src/render/views/hazard.ts`), ainsi que l'entrée `COLORS[HAZARD_BRAMBLE]` et la branche de `update`.

**Deux choses à ne surtout pas perdre dans la restauration**, toutes deux issues de corrections de revue :

1. **Le disque de vérité.** La pique dessine d'abord le disque mortel réel à `radius`, en encre légère, puis l'éclat effilé **inscrit dedans**. L'éclat seul laissait une bande mortelle invisible sur ses flancs — le principe directeur du projet est « ce qui est affiché est ce qui tue ».
2. **La pulsation d'avertissement**, sur les dernières `warnMs` (900 ms) : sinusoïdale à 5 Hz, d'amplitude **0,7 + 0,3·sin** et non 0,55 + 0,45·sin. Le creux plus profond rendait la pique optiquement absente alors qu'elle tuait à plein rayon. Le rétrécissement (`shrink`) ne s'applique qu'à l'éclat, **jamais au disque** : la zone mortelle ne rétrécit pas.

C'est ce clignotement que le joueur a explicitement redemandé — vérifie qu'il est bien là.

Restaure aussi l'icône `bramble` dans `src/ui/icons.ts` et le pictogramme de pastille dans `src/render/views/pickup.ts` (ex-`drawTrail` → `drawBramble`), et pense aux commentaires de `pickup.ts` qui comptent les power-ups : ils passent de cinq à six.

- [ ] **Step 5: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS, dont `powerups.test.ts` (aller-retour des identifiants), `upgrades.test.ts` (i18n des cartes) et `parity.test.ts`.

Grep ensuite `src/` pour `spike`, `Spike`, `SPIKE`, `trailDuration` : plus aucune occurrence ne doit survivre — le renommage est le point de cette tâche.

```bash
git add src/sim src/render src/ui/icons.ts src/i18n/locales
git commit -m "feat(powerups): restaurer la couronne d'épines sous le nom Ronce d'encre"
```

---

### Task 2: Tirage pondéré des pastilles

**Files:**
- Modify: `src/sim/data/powerups.ts`, `src/sim/systems/pickup.ts`
- Test: `src/sim/systems/pickup.test.ts`

**Interfaces:**
- Consumes: `POWERUP_KINDS` incluant `'bramble'` (Task 1).
- Produces: `POWERUP_WEIGHT: Record<PowerUpKind, number>` et un tirage pondéré déterministe dans `spawnPickup`.

**Le problème.** `spawnPickup` fait `world.rng.pick(POWERUP_KINDS)` — un tirage uniforme. Trois power-ups ayant été retirés du jeu, la fréquence de chaque survivant a mécaniquement grimpé : le Halo est passé de 12,5 % (8 genres) à 20 % (5 genres), soit **60 % plus fréquent sans qu'aucune décision ne l'ait voulu**. C'est le troisième effet de bord non désiré produit par un retrait ; des poids explicites suppriment la cause, pas le symptôme.

- [ ] **Step 1: Écrire le test**

Dans `src/sim/systems/pickup.test.ts`, ajouter deux cas. Le premier verrouille l'intention, le second la distribution :

```ts
  it('le Halo est nettement plus rare que les autres', () => {
    for (const kind of POWERUP_KINDS) {
      if (kind !== 'halo') {
        expect(POWERUP_WEIGHT.halo).toBeLessThan(POWERUP_WEIGHT[kind])
      }
    }
  })

  it('tire les genres à leur poids, et pas uniformément', () => {
    const w = createWorld({ seed: 7, width: ARENA.width, height: ARENA.height })
    spawnPlayer(w)
    const counts = new Map<PowerUpKind, number>()
    const draws = 4000
    for (let i = 0; i < draws; i++) {
      const eid = spawnPickup(w)
      const kind = POWERUP_BY_ID[Pickup.kind[eid]!]
      if (!kind) {
        throw new Error('genre de pastille inconnu')
      }
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
      removeEntity(w, eid)
    }

    const total = [...POWERUP_KINDS].reduce((s, k) => s + POWERUP_WEIGHT[k], 0)
    for (const kind of POWERUP_KINDS) {
      const expected = POWERUP_WEIGHT[kind] / total
      const actual = (counts.get(kind) ?? 0) / draws
      // Marge large : ce test porte sur la forme de la distribution, pas sur
      // la qualité statistique du générateur. Il doit échouer si les poids ne
      // sont pas appliqués du tout (le Halo remonterait à ~1/6), pas frémir
      // sur du bruit d'échantillonnage.
      expect(Math.abs(actual - expected)).toBeLessThan(0.04)
    }
  })
```

Adapte les imports et le `setup` existants du fichier plutôt que d'en créer de nouveaux. **Vérifie que la marge de 0,04 fait bien échouer le test sur un tirage uniforme** — avec six genres, l'uniforme donne 16,7 % pour le Halo contre ~7 % attendus, soit un écart de 0,10 : il échoue largement. Dis dans ton rapport comment tu l'as confirmé.

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/sim/systems/pickup.test.ts`
Expected: FAIL — `POWERUP_WEIGHT` n'existe pas.

- [ ] **Step 3: Déclarer les poids**

Dans `src/sim/data/powerups.ts`, après `POWERUP_KINDS` :

```ts
/**
 * Poids de tirage d'une pastille. Un tirage uniforme rendait la fréquence de
 * chaque power-up dépendante du *nombre* de genres : retirer la Rature, le
 * Séchage puis le Trait d'encre a fait passer le Halo de 12,5 % à 20 % sans
 * qu'aucune décision ne l'ait voulu — et c'est celui qui empêche de mourir,
 * donc celui dont l'inflation se sent le plus. Des poids explicites coupent ce
 * lien : ajouter ou retirer un genre ne rééquilibre plus le sac tout seul.
 *
 * Le Halo est seul à être raréfié (~7 % contre ~18,6 % chacun pour les cinq
 * autres) : c'est le seul déséquilibre constaté en jeu, et rejuger les autres
 * avant de les avoir vus dans le nouvel équilibre serait deviner.
 */
export const POWERUP_WEIGHT: Record<PowerUpKind, number> = {
  blast: 4,
  freeze: 4,
  bramble: 4,
  blotter: 4,
  dash: 4,
  halo: 1.5,
}
```

- [ ] **Step 4: Tirer au poids**

Dans `src/sim/systems/pickup.ts`, remplacer `world.rng.pick(POWERUP_KINDS)` par un tirage pondéré utilisant `world.rng.next()` — **jamais `Math.random()`**, la simulation doit rester reproductible à graine égale. Une somme cumulée suffit ; commente le fait que le repli sur le dernier genre couvre l'arrondi flottant, il n'est pas décoratif.

- [ ] **Step 5: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS. Vérifie en particulier que `src/sim/determinism.test.ts` passe toujours : le tirage consomme le flux `world.rng`, et le tirage pondéré doit le consommer de façon reproductible.

```bash
git add src/sim/data/powerups.ts src/sim/systems/pickup.ts src/sim/systems/pickup.test.ts
git commit -m "feat(sim): tirer les pastilles au poids plutôt qu'uniformément"
```

---

## Vérification manuelle finale

`npm run dev`, puis :

1. La Ronce d'encre apparaît au sol et fait tourner six épines autour du joueur, qui tuent au contact.
2. Les épines pulsent et se rétractent sur la dernière seconde — l'avertissement de fin.
3. Le Halo se fait nettement plus rare qu'avant.
4. La foule est dense et lente : la Ronce dans une telle foule est peut-être très forte, à juger.
