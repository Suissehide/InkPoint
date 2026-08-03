# Le givre lâche avant de lâcher — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Annoncer la fin d'un gel en faisant remonter la couleur d'espèce de l'ennemi en trois paliers sur les 700 dernières millisecondes, pour que le joueur puisse rompre son approche avant que le disque ne redevienne mortel.

**Architecture:** Tout se passe dans `src/render/`. `Frozen.remaining` porte déjà l'information ; le rendu n'en lit aujourd'hui qu'un booléen. Le booléen `frozen` de la vue ennemie devient un scalaire `frostAmount` — la part de givre dans la couleur du corps — alimenté par une fonction pure à seuils, `thawFrostAmount`. Trois valeurs discrètes plutôt qu'un dégradé : l'œil attrape les transitions et pas les gradients, et trois valeurs veulent dire trois clés de cache donc deux redessins par dégel. **Aucun fichier de `sim/` n'est modifié.**

**Tech Stack:** TypeScript strict, PixiJS v8 (`Graphics`), bitECS (lecture seule depuis le rendu), Vitest en environnement `node`, Biome.

## Global Constraints

- **`sim/` n'est pas touché.** Ni `Frozen`, ni ses durées, ni la contagion. En particulier **aucun `Frozen.total` n'est ajouté** : le signal est un seuil absolu, pas un ratio.
- **Pas de `!` dans `src/render/`.** L'assertion non-nulle est réservée à `sim/`. Les accès à un tableau de composant passent par le helper `at()` de `stage.ts`.
- **Ce qui est affiché est ce qui tue.** Rien dans ce plan ne change une silhouette ni un rayon : seule la couleur du remplissage bouge.
- **Commentaires en français**, comme tout le dépôt.
- **Conventional Commits**, imposés par Husky + commitlint. Scope `render` pour tout le plan. Sujets sans accents, comme les commits récents.
- **Ne jamais `git add -A`** : d'autres sessions travaillent dans le même dépôt. Chaque commit liste ses fichiers.
- Commandes, depuis `front/` : `npm test`, `npm run typecheck`, `npm run lint`. Un fichier seul : `npx vitest run src/render/views/enemy.test.ts`.

**Spec de référence :** `docs/superpowers/specs/2026-08-04-degel-imminent-design.md`

## Structure des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| `front/src/render/views/enemy.ts` | `thawFrostAmount` et ses seuils ; `enemyBodyColor` prend un scalaire ; le champ `frostAmount` de la vue et la clé de cache | 1, 2, 3 |
| `front/src/render/views/enemy.test.ts` | seuils, couleurs des paliers, blanchiment, redessins | 1, 2, 3 |
| `front/src/render/stage.ts` | lit `Frozen.remaining` et passe `frostAmount` à la vue | 3 |

Rien d'autre. Pas de nouvelle encre dans `ink.ts` — la couleur qui revient est celle de l'espèce, déjà dans `ENEMY_COLOR`.

---

### Task 1 : Les trois paliers

Une fonction pure, seule dépositaire des seuils. Elle n'est encore appelée par personne à la fin de cette tâche : c'est voulu, elle se teste seule.

**Files:**
- Modify: `front/src/render/views/enemy.ts` (ajouter après `enemyBodyColor`, vers la l. 48)
- Test: `front/src/render/views/enemy.test.ts` (ajouter un `describe` après celui d'`enemyBodyColor`)

**Interfaces:**
- Consumes: rien.
- Produits pour les tâches suivantes :
  - `export function thawFrostAmount(remainingMs: number): number` — rend `1`, `0.5` ou `0.12`
  - `export const THAW_LOOSE_MS = 700`
  - `export const THAW_GONE_MS = 220`

- [ ] **Step 1: Écrire le test qui échoue**

Dans `front/src/render/views/enemy.test.ts`, ajouter `thawFrostAmount` à l'import depuis `./enemy` (Biome trie : il vient après `telegraphRingRadius`), puis ce bloc à la suite du `describe('enemyBodyColor', …)` :

```ts
describe('thawFrostAmount', () => {
  it('laisse le givre plein tant que le degel est loin', () => {
    expect(thawFrostAmount(4000)).toBe(1)
    expect(thawFrostAmount(701)).toBe(1)
  })

  it('delave le givre a partir du seuil d’alerte, seuil compris', () => {
    expect(thawFrostAmount(700)).toBe(0.5)
    expect(thawFrostAmount(221)).toBe(0.5)
  })

  it('rend presque toute sa couleur a l’ennemi sur la fin', () => {
    expect(thawFrostAmount(220)).toBe(0.12)
    expect(thawFrostAmount(0)).toBe(0.12)
  })

  it('ne remonte jamais quand le temps restant descend', () => {
    let precedent = Number.POSITIVE_INFINITY
    for (let ms = 1000; ms >= 0; ms -= 10) {
      const part = thawFrostAmount(ms)
      expect(part).toBeLessThanOrEqual(precedent)
      precedent = part
    }
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Depuis `front/` : `npx vitest run src/render/views/enemy.test.ts`
Attendu : ÉCHEC à la compilation du module — `thawFrostAmount` n'est pas exporté par `./enemy`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `front/src/render/views/enemy.ts`, juste après `enemyBodyColor` :

```ts
/**
 * Seuils de l'alerte de dégel, en millisecondes restantes sur `Frozen.remaining`.
 *
 * 700 ms laissent le temps de rompre une approche ; 220 ms, soit treize images,
 * sont l'avertissement de dernier recours. Les gels les plus courts que produise
 * la contagion — 300 ms, le plancher de `RULE_TUNING.freezeSpreadFloorMs` —
 * naissent donc directement au palier intermédiaire, et c'est exact : ce gel-là
 * ne vaut rien, le montrer bleu vif serait une promesse fausse.
 */
export const THAW_LOOSE_MS = 700
export const THAW_GONE_MS = 220

/**
 * Part de givre qu'il reste à afficher, par paliers. Trois valeurs et pas un
 * dégradé, pour deux raisons qui vont dans le même sens : l'œil attrape les
 * transitions et pas les gradients — une teinte qui glisse sur 700 ms au milieu
 * d'une mêlée, à 6 px de rayon, ne se remarque pas — et trois valeurs ne font
 * que trois clés de cache du corps, donc deux redessins par dégel au lieu d'un
 * par image et par ennemi gelé.
 *
 * Appelée pour un ennemi effectivement gelé ; un ennemi libre vaut 0 sans
 * passer par ici.
 */
export function thawFrostAmount(remainingMs: number): number {
  if (remainingMs > THAW_LOOSE_MS) {
    return 1
  }
  if (remainingMs > THAW_GONE_MS) {
    return 0.5
  }
  return 0.12
}
```

- [ ] **Step 4: Lancer le test pour le voir passer**

Depuis `front/` : `npx vitest run src/render/views/enemy.test.ts`
Attendu : SUCCÈS, les quatre nouveaux cas compris.

- [ ] **Step 5: Commit**

```bash
git add front/src/render/views/enemy.ts front/src/render/views/enemy.test.ts
git commit -m "feat(render): les trois paliers du degel"
```

---

### Task 2 : `enemyBodyColor` prend un scalaire

Le booléen `frozen` n'était qu'un `frostAmount` à deux valeurs. On le remplace par le scalaire **sans changer aucune couleur affichée** : la vue continue d'appeler la fonction avec `frozen ? 1 : 0`. Aucun comportement ne bouge dans cette tâche ; elle prépare la suivante et corrige un commentaire faux.

**Files:**
- Modify: `front/src/render/views/enemy.ts:40-48` (le bloc de documentation et la signature d'`enemyBodyColor`), et son appel l. ~208
- Test: `front/src/render/views/enemy.test.ts` (le `describe('enemyBodyColor', …)`)

**Interfaces:**
- Consumes: rien de la tâche 1 — les deux sont indépendantes.
- Produit : `export function enemyBodyColor(type: EnemyType, frostAmount: number, whiten: number): number`. L'ancienne signature `(type, frozen: boolean, whiten)` disparaît ; `frostAmount = 1` rend exactement `INK.frost` et `0` exactement la couleur d'espèce, donc les deux anciens cas sont préservés au bit près.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `front/src/render/views/enemy.test.ts`, remplacer le `describe('enemyBodyColor', …)` existant en entier (l. 47-66 ; c'est le seul endroit du fichier qui appelle la fonction) par celui-ci. Les trois premiers cas sont les anciens, réécrits avec `0` et `1` à la place de `false` et `true` ; l'ancien « blanchit complètement à la mort, gelé ou non » est absorbé par le dernier, qui couvre les mêmes deux valeurs plus les deux paliers intermédiaires :

```ts
describe('enemyBodyColor', () => {
  /** Somme des écarts composante par composante entre deux couleurs. */
  function ecart(a: number, b: number): number {
    return (
      Math.abs(((a >> 16) & 0xff) - ((b >> 16) & 0xff)) +
      Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)) +
      Math.abs((a & 0xff) - (b & 0xff))
    )
  }

  it('donne a l’Eclat une encre a lui', () => {
    expect(enemyBodyColor('shard', 0, 0)).toBe(INK.shard)
    expect(enemyBodyColor('shard', 0, 0)).not.toBe(enemyBodyColor('point', 0, 0))
  })

  it('laisse le Point et le Blot en rouge', () => {
    expect(enemyBodyColor('point', 0, 0)).toBe(INK.danger)
    expect(enemyBodyColor('blot', 0, 0)).toBe(INK.danger)
  })

  it('fait passer le gel avant l’espece : un Eclat gele est bleu comme les autres', () => {
    expect(enemyBodyColor('shard', 1, 0)).toBe(INK.frost)
    expect(enemyBodyColor('shard', 1, 0)).toBe(enemyBodyColor('point', 1, 0))
  })

  it('rapproche le corps de sa couleur d’espece a chaque palier', () => {
    const gele = ecart(enemyBodyColor('point', 1, 0), INK.danger)
    const delave = ecart(enemyBodyColor('point', 0.5, 0), INK.danger)
    const presque = ecart(enemyBodyColor('point', 0.12, 0), INK.danger)
    expect(delave).toBeLessThan(gele)
    expect(presque).toBeLessThan(delave)
    // Pas zero : le dernier palier garde un reste de givre, sinon rien ne
    // distingue plus un ennemi qui va repartir d'un ennemi qui tue deja.
    expect(presque).toBeGreaterThan(0)
  })

  it('blanchit par-dessus le givre, quel que soit le palier', () => {
    for (const part of [1, 0.5, 0.12, 0]) {
      expect(enemyBodyColor('point', part, 1)).toBe(INK.paper)
    }
  })
})
```

Les autres cas du fichier qui appellent `enemyBodyColor` — s'il y en a hors de ce `describe` — passent de `false`/`true` à `0`/`1` de la même façon. Les vérifier avec `grep -n "enemyBodyColor" front/src/render/views/enemy.test.ts`.

- [ ] **Step 2: Lancer le test pour le voir échouer**

Depuis `front/` : `npx vitest run src/render/views/enemy.test.ts`
Attendu : ÉCHEC. `enemyBodyColor('point', 0.5, 0)` reçoit un `number` là où la signature attend un `boolean` ; en TypeScript strict, Vitest échoue à la transformation du fichier.

- [ ] **Step 3: Écrire l'implémentation minimale**

Dans `front/src/render/views/enemy.ts`, remplacer le bloc de documentation et la fonction (l. 40-48) par :

```ts
/**
 * Couleur du corps : la part de givre `frostAmount` mélangée à la couleur
 * d'espèce, puis le blanchiment de la mort par-dessus.
 *
 * **L'ordre des deux mélanges compte.** Le blanchiment s'applique en second,
 * sur la base quelle qu'elle soit : un ennemi tué en plein dégel blanchit comme
 * les autres, et `whiten = 1` rend `paper` à tous les paliers.
 *
 * Le gel l'emporte sur l'espèce tant qu'il tient : quand un ennemi est
 * immobilisé, c'est l'information utile à cet instant. Et quand il approche du
 * dégel, sa couleur d'espèce remonte par paliers (`thawFrostAmount`) — c'est
 * l'avertissement. Un ennemi gelé ne tue pas : `collisionSystem` exclut `Frozen`
 * d'`activeEnemies`, et le toucher le tue lui. Voir sa teinte revenir avant lui,
 * c'est donc voir la menace revenir avant la menace.
 */
export function enemyBodyColor(
  type: EnemyType,
  frostAmount: number,
  whiten: number,
): number {
  return mixColor(mixColor(ENEMY_COLOR[type], INK.frost, frostAmount), INK.paper, whiten)
}
```

Puis, dans `update`, l'unique appel (l. ~208) devient — le champ `frozen` de l'interface ne change pas dans cette tâche :

```ts
const color = enemyBodyColor(type, frozen ? 1 : 0, whiten)
```

- [ ] **Step 4: Lancer les tests et le typecheck**

Depuis `front/` :
- `npx vitest run src/render/views/enemy.test.ts` → SUCCÈS
- `npm run typecheck` → aucune erreur (`stage.ts` n'appelle pas `enemyBodyColor`, seule la vue le fait)

- [ ] **Step 5: Commit**

```bash
git add front/src/render/views/enemy.ts front/src/render/views/enemy.test.ts
git commit -m "refactor(render): la couleur du corps prend une part de givre"
```

---

### Task 3 : Le dégel se voit

La tâche qui change ce qui est à l'écran : la vue reçoit un scalaire, `stage.ts` lit `Frozen.remaining` et le convertit en paliers.

**Files:**
- Modify: `front/src/render/views/enemy.ts` (le champ `frozen` de l'interface `EnemyView`, l. ~16 ; la déstructuration l. ~144 ; la clé de cache l. ~197 ; l'appel de la l. ~208)
- Modify: `front/src/render/stage.ts:39` (import), `stage.ts:338` (lecture), `stage.ts:357` (passage à la vue)
- Test: `front/src/render/views/enemy.test.ts` (la fixture `solide()` et le `describe('createEnemyView : la clé de cache du corps', …)`)

**Interfaces:**
- Consumes: `thawFrostAmount(remainingMs)` (tâche 1), `enemyBodyColor(type, frostAmount, whiten)` (tâche 2).
- Produit : le champ `frozen: boolean` de `EnemyView.update` devient `frostAmount: number`. C'est le seul appelant, `stage.ts`, qui le fournit.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `front/src/render/views/enemy.test.ts`, la fixture `solide()` passe de `frozen: false` à `frostAmount: 0` :

```ts
    materializeProgress: 1,
    frostAmount: 0,
    whiten: 0,
```

Puis ajouter ces deux cas à la fin du `describe('createEnemyView : la clé de cache du corps', …)`, à l'intérieur du bloc, après le dernier `it` :

```ts
  it('redessine le corps quand le degel change de palier', () => {
    const view = createEnemyView()
    view.update(solide({ frostAmount: 1 }))
    const redessins = compteurDeRedessins(view)
    view.update(solide({ frostAmount: 0.5 }))
    expect(redessins()).toBeGreaterThan(0)
    view.container.destroy({ children: true })
  })

  it('ne redessine pas le corps tant que le palier tient', () => {
    const view = createEnemyView()
    view.update(solide({ frostAmount: 0.5 }))
    const redessins = compteurDeRedessins(view)
    view.update(solide({ frostAmount: 0.5 }))
    expect(redessins()).toBe(0)
    view.container.destroy({ children: true })
  })
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Depuis `front/` : `npx vitest run src/render/views/enemy.test.ts`
Attendu : ÉCHEC — `frostAmount` n'existe pas dans le type des options d'`update`, qui exige toujours `frozen`.

- [ ] **Step 3: Le champ de la vue devient un scalaire**

Dans `front/src/render/views/enemy.ts`, dans l'interface `EnemyView` (l. ~16), remplacer `frozen: boolean` par :

```ts
    /** Part de givre dans le corps : 1 gelé, 0 libre, paliers de `thawFrostAmount` sur la fin du gel. */
    frostAmount: number
```

Dans la déstructuration de `update` (l. ~144), `frozen,` devient `frostAmount,`.

Dans la clé de cache (l. ~197), `|${frozen}|` devient `|${frostAmount.toFixed(2)}|` — trois valeurs possibles, donc trois clés :

```ts
      const key = `${radius.toFixed(1)}|${type}|${materializeProgress.toFixed(2)}|${frostAmount.toFixed(2)}|${whiten.toFixed(2)}|${facet}`
```

Et l'appel de la l. ~208 perd son ternaire :

```ts
      const color = enemyBodyColor(type, frostAmount, whiten)
```

- [ ] **Step 4: Lancer les tests de la vue**

Depuis `front/` : `npx vitest run src/render/views/enemy.test.ts`
Attendu : SUCCÈS, les deux nouveaux cas compris.

- [ ] **Step 5: Brancher `stage.ts`**

Dans `front/src/render/stage.ts`, l'import de la l. 39 accueille la fonction (Biome trie, elle vient après `shardAim`) :

```ts
import { createEnemyView, type EnemyView, shardAim, thawFrostAmount } from './views/enemy'
```

À la l. 338, le booléen reste — il sert plus bas à exclure les Éclats gelés des fantômes violets, pour une raison qui n'a rien à voir avec la couleur — et gagne une lecture à côté :

```ts
        // Lu une seule fois : sert la couleur du corps et l'exclusion des
        // fantômes plus bas.
        const frozen = hasComponent(world, Frozen, eid)
        // Le givre s'efface par paliers sur la fin du gel : la couleur d'espèce
        // qui remonte annonce que l'ennemi va repartir. `remaining` décroît en
        // `FIXED_DT × timeScale`, donc l'alerte s'étire d'elle-même au ralenti.
        const frostAmount = frozen ? thawFrostAmount(at(Frozen.remaining, eid)) : 0
```

À la l. ~357, dans l'objet passé à `view.update`, `frozen,` devient `frostAmount,`.

- [ ] **Step 6: Vérifier l'ensemble**

Depuis `front/` :
- `npm run typecheck` → aucune erreur
- `npm test` → toute la suite au vert
- `npm run lint` → aucun diagnostic

Ne pas passer à l'étape suivante avant d'avoir vu les trois sorties.

- [ ] **Step 7: Commit**

```bash
git add front/src/render/views/enemy.ts front/src/render/views/enemy.test.ts front/src/render/stage.ts
git commit -m "feat(render): annoncer le degel par la couleur qui revient"
```

---

## Vérification en jeu

Les tests couvrent les seuils, les couleurs et le cache ; ils ne disent pas si le signal **se voit**. Après la tâche 3, depuis `front/` : `npm run dev`, ramasser une carte Gel, la déclencher dans une foule, et regarder la fin des gels.

Ce qu'on doit constater :

1. Le corps reste franchement bleu la majeure partie du gel — aucun changement par rapport à avant.
2. Un palier intermédiaire nettement visible, puis un dernier tiers où le rouge (ou le violet de l'Éclat) est presque revenu, avant que l'ennemi ne bouge.
3. Sur une foule gelée par contagion, les ennemis ne changent pas de palier tous en même temps : leurs `remaining` diffèrent d'un saut de contagion à l'autre.

Si les paliers se lisent mal, les deux réglages à bouger sont `THAW_LOOSE_MS` / `THAW_GONE_MS` (le tempo) et les trois valeurs de retour de `thawFrostAmount` (la profondeur). Ils sont au même endroit et ne demandent aucun changement ailleurs.
