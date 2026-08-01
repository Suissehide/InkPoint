# Épines, lisibilité et difficulté — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les épines de la Ronce lisibles comme des épines, densifier la réglure de la page, raréfier la Ronce, et retirer le plafond de la courbe de difficulté.

**Architecture:** Quatre changements indépendants, tous dans des fichiers de données ou de rendu. Aucune logique de simulation n'est touchée : seules trois constantes de géométrie, un poids de tirage, un espacement de tracé et deux courbes changent de valeur ou de forme. La contrainte qui gouverne la tâche 1 est l'invariant du dépôt « ce qui est affiché contient ce qui tue ».

**Tech Stack:** TypeScript strict, PixiJS v8, bitECS, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-01-epines-lisibilite-difficulte-design.md`

## Global Constraints

- **Langue.** Commentaires, messages de commit et noms de tests en **français**.
- **Commits.** Conventional Commits, imposés par husky + commitlint. Portées ici : `sim`, `render`, `data`.
- **Ne jamais `git add -A`.** Une autre session travaille dans le même worktree, avec des fichiers de `src/sim/` modifiés et non commités. Chaque commit liste ses fichiers explicitement.
- **Ne jamais pousser** vers `origin` sans accord explicite.
- **`src/render/` n'a pas droit à `!`** (assertion non-nulle) — réservé à `src/sim/`.
- **`noUncheckedIndexedAccess` est actif** : tout accès indexé est `T | undefined`.
- **Palette :** uniquement `INK` (`src/render/ink.ts`). Aucune couleur en dur.
- **Vérification après chaque tâche :** `npm test && npm run lint && npm run typecheck`.
- **Base au démarrage :** 380 tests verts.

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
| --- | --- | --- |
| `src/sim/data/powerups.ts` | Géométrie de la couronne (`count`, `thornRadius`) ; poids de tirage | 1, 2 |
| `src/sim/data/powerups.test.ts` | Invariant de perméabilité de la couronne | 1 |
| `src/render/views/hazard.ts` | Tracé de l'épine : disque de vérité + éclat | 1 |
| `src/render/page.ts` | Espacement de la réglure | 3 |
| `src/sim/data/difficulty.ts` | Les deux courbes qui perdent leur plafond | 4 |
| `src/sim/data/difficulty.test.ts` | Invariants des courbes (deux tests existants à réécrire) | 4 |

---

### Task 1: Affûter les épines de la Ronce

L'éclat de l'épine est aujourd'hui un **cerf-volant à quatre sommets** — pointe, deux flancs perpendiculaires au milieu de l'axe, arrière. C'est cette silhouette losangée qui la fait lire comme une bulle. Elle devient un triangle à trois sommets, sur une couronne plus fine et plus dense.

L'invariant du dépôt : **ce qui est affiché contient ce qui tue**. Le disque de `thornRadius` *est* la zone de collision testée par `sim/systems/hazards.ts` ; il reste dessiné, simplement plus discret. C'est lui qui porte l'invariant, pas l'éclat.

**Files:**
- Modify: `src/sim/data/powerups.ts` (entrée `bramble` de `POWERUP_BASE`)
- Modify: `src/render/views/hazard.ts`
- Test: `src/sim/data/powerups.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `POWERUP_BASE.bramble.count = 7`, `POWERUP_BASE.bramble.thornRadius = 8`. `orbitRadius` reste à 40.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `src/sim/data/powerups.test.ts` :

```ts
describe('perméabilité de la couronne de Ronce', () => {
  // Tout est dérivé des constantes réelles, jamais recopié : un futur réglage
  // de `count`, `orbitRadius` ou `thornRadius` qui refermerait la couronne
  // doit faire échouer ce test plutôt que passer inaperçu.
  const { count, orbitRadius, thornRadius } = POWERUP_BASE.bramble
  /** Distance entre les centres de deux épines voisines. */
  const ecart = 2 * orbitRadius * Math.sin(Math.PI / count)
  /** Largeur que deux épines voisines barrent à un ennemi de rayon `r`. */
  const barre = (r: number): number => 2 * (thornRadius + r)

  it('laisse encore se faufiler le Point et l’Éclat', () => {
    expect(ecart).toBeGreaterThan(barre(ENEMIES.point.radius))
    expect(ecart).toBeGreaterThan(barre(ENEMIES.shard.radius))
  })

  it('arrête toujours le Bloc', () => {
    expect(ecart).toBeLessThan(barre(ENEMIES.blot.radius))
  })
})
```

Le fichier importe aujourd'hui `{ POWERUP_BY_ID, POWERUP_ID, POWERUP_KINDS, type PowerUpKind } from './powerups'`. Y ajouter `POWERUP_BASE`, et ajouter une ligne `import { ENEMIES } from './enemies'`.

- [ ] **Step 2: Lancer le test pour le voir passer, puis le rendre falsifiable**

Run: `npx vitest run src/sim/data/powerups.test.ts`
Expected: PASS — avec les valeurs actuelles (6 / 40 / 11) l'écart vaut 40 px, le Point est barré à 36 et le Bloc à 50.

Ce test passe **avant** le changement : c'est voulu, il décrit un invariant qui doit survivre au réglage, pas un comportement nouveau. Vérifie qu'il est réellement falsifiable en passant temporairement `count` à `12` dans `powerups.ts` : le premier `it` doit échouer (écart 20,7 px, en dessous des 36 du Point). Remets `6` ensuite.

- [ ] **Step 3: Resserrer la couronne**

Dans `src/sim/data/powerups.ts`, entrée `bramble` : `count: 6` → `count: 7`, `thornRadius: 11` → `thornRadius: 8`. `orbitRadius` reste à `40`.

Remplacer le commentaire qui documente le calcul — il porte les anciens chiffres et mentirait :

```ts
    /**
     * `count` décide si la couronne a des trous : deux épines voisines ont
     * leurs centres distants de `2 · orbitRadius · sin(π / count)`, et elles
     * barrent `2 · (thornRadius + r)` à un ennemi de rayon `r`. À 7 épines de
     * 8 px sur une orbite de 40, l'écart (34,7 px) laisse passer un Point
     * (30) ou un Éclat (28) mais pas un Bloc (44) — la rotation rattrape ceux
     * qui se faufilent. Resserrer davantage referme la couronne : à 9 épines
     * sur une orbite de 34, l'écart tombe à 23 px et plus rien ne passe, ce
     * qui ferait de la Ronce un bouclier absolu. `powerups.test.ts` garde cet
     * invariant.
     */
```

- [ ] **Step 4: Vérifier que la perméabilité tient**

Run: `npx vitest run src/sim/data/powerups.test.ts`
Expected: PASS — écart 34,7 px, Point barré à 30, Éclat à 28, Bloc à 44.

- [ ] **Step 5: Transformer l'éclat en triangle**

Dans `src/render/views/hazard.ts`, ajuster deux ratios (le troisième ne bouge pas) :

```ts
const BRAMBLE_TIP_RATIO = 1 // pointe : touche le bord du disque, jamais au-delà
const BRAMBLE_HALF_WIDTH_RATIO = 0.72 // demi-largeur de la base, perpendiculaire à l'axe
const BRAMBLE_BACK_RATIO = 0.5 // base, en retrait du centre
```

Puis remplacer le tracé de l'éclat. Le code actuel place les deux flancs perpendiculairement **au centre** de l'entité, ce qui produit un losange :

```ts
  gfx
    .moveTo(tipX, tipY)
    .lineTo(sideX, sideY)
    .lineTo(backX, backY)
    .lineTo(-sideX, -sideY)
    .closePath()
    .fill({ color, alpha: 0.9 * pulse })
```

Le nouveau ramène les deux coins **à l'arrière**, ce qui produit un triangle :

```ts
  // Triangle à trois sommets : la pointe, et deux coins de base alignés sur
  // l'arrière. Le losange d'avant plaçait ses flancs au milieu de l'axe, d'où
  // une silhouette de bulle plutôt que d'épine.
  gfx
    .moveTo(tipX, tipY)
    .lineTo(backX + sideX, backY + sideY)
    .lineTo(backX - sideX, backY - sideY)
    .closePath()
    .fill({ color, alpha: 0.9 * pulse })
```

Les coins de base sont à `√(0,5² + 0,72²) ≈ 0,88 · radius` du centre, donc le triangle reste inscrit dans le disque. Ce n'est pas ce qui satisfait l'invariant — le disque dessiné s'en charge — mais un éclat qui déborderait du disque qu'il décore serait laid.

- [ ] **Step 6: Effacer le disque de vérité sans le supprimer**

Toujours dans `drawBramble`, baisser les deux opacités du disque pour qu'il cesse d'écraser la pointe :

```ts
  gfx.circle(0, 0, radius).fill({ color, alpha: 0.09 * pulse })
  gfx.circle(0, 0, radius).stroke({ color, width: 1, alpha: 0.18 * pulse })
```

Ne supprime pas ces deux lignes : elles sont ce qui rend la zone mortelle visible, et sans elles la bande entre le flanc du triangle et le bord du cercle tuerait sans rien afficher.

- [ ] **Step 7: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Vérifier à l'œil**

Run: `npm run dev`, jouer jusqu'à ramasser une Ronce.
Expected : les épines se lisent comme des pointes triangulaires, pas comme des bulles ; le disque reste perceptible sans dominer ; un Point ou un Éclat peut encore se faufiler entre deux épines, un Bloc jamais.

Si tu ne peux pas piloter le jeu depuis un outil navigateur, dis-le franchement dans ton rapport plutôt que de le prétendre — ne bloque pas la tâche pour ça.

- [ ] **Step 9: Commit**

```bash
git add src/sim/data/powerups.ts src/sim/data/powerups.test.ts src/render/views/hazard.ts
git commit -m "feat(render): donner à la Ronce de vraies épines triangulaires"
```

---

### Task 2: Raréfier la Ronce d'encre

**Files:**
- Modify: `src/sim/data/powerups.ts` (`POWERUP_WEIGHT`)

**Interfaces:**
- Consumes: rien.
- Produces: `POWERUP_WEIGHT.bramble = 2`.

- [ ] **Step 1: Baisser le poids**

Dans `src/sim/data/powerups.ts` :

```ts
export const POWERUP_WEIGHT: Record<PowerUpKind, number> = {
  blast: 4,
  freeze: 4,
  // Moitié moins fréquente que les quatre offensifs, sans descendre au niveau
  // du Halo qui reste le power-up rare.
  bramble: 2,
  blotter: 4,
  dash: 4,
  halo: 1.5,
}
```

La Ronce passe de 4/21,5 (18,6 % des pastilles) à 2/19,5 (10,3 %). Le Halo reste le plus rare à 1,5/19,5 (7,7 %).

- [ ] **Step 2: Vérifier qu'aucun test existant ne casse**

Run: `npx vitest run src/sim/systems/pickup.test.ts`
Expected: PASS. Deux tests de ce fichier touchent aux poids et doivent continuer à passer :

- « le Halo est nettement plus rare que les autres » (ligne ~84) compare `POWERUP_WEIGHT.halo` à chaque autre genre. Avec `1.5 < 2`, l'assertion tient — mais l'écart devient mince. Si ce test échoue, ne le neutralise pas : c'est le signal que 2 est trop bas et qu'il faut remonter la Ronce, pas assouplir l'assertion.
- « tire les genres à leur poids, et pas uniformément » (ligne ~93) recalcule le total depuis `POWERUP_KINDS` et n'a aucune valeur en dur : il suit le changement tout seul.

- [ ] **Step 3: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/sim/data/powerups.ts
git commit -m "feat(data): raréfier la Ronce d'encre de moitié"
```

---

### Task 3: Densifier la réglure de la page

**Files:**
- Modify: `src/render/page.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `RULE_GAP = 20`.

- [ ] **Step 1: Resserrer les lignes**

Dans `src/render/page.ts`, `RULE_GAP` passe de `32` à `20` :

```ts
/** Espacement des lignes de réglure. À 20, le halo de 165 px de rayon en
 *  découvre environ seize — assez pour que le fond se lise comme une page. */
const RULE_GAP = 20
```

`MARGIN_X` (58) ne bouge pas : c'est la marge verticale du cahier, pas une réglure, et son abscisse n'a rien à voir avec la densité des lignes.

- [ ] **Step 2: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS. Aucun test ne porte sur `RULE_GAP` — c'est une constante de tracé, non exportée, et `src/render/` n'est pas testé directement dans ce dépôt (seules ses fonctions pures le sont).

- [ ] **Step 3: Vérifier à l'œil**

Run: `npm run dev`, lancer une partie.
Expected : environ seize lignes visibles dans le halo au lieu d'une dizaine ; la marge rouge est inchangée ; la réglure ne frémit pas (elle est hors du boil).

Si tu ne peux pas lancer le jeu depuis un outil navigateur, dis-le dans ton rapport.

- [ ] **Step 4: Commit**

```bash
git add src/render/page.ts
git commit -m "feat(render): densifier la réglure pour que le fond se lise comme une page"
```

---

### Task 4: Retirer le plafond de la difficulté

Deux courbes perdent leur asymptote. Toutes les autres restent inchangées — en particulier `enemyMaxSpeed`, plafonnée à 150 px/s sous les 240 px/s du joueur : la laisser monter rendrait la mort imparable plutôt que méritée.

**Deux tests existants vont échouer** et doivent être réécrits, pas contournés : ils affirment aujourd'hui l'existence des plafonds qu'on supprime.

**Files:**
- Modify: `src/sim/data/difficulty.ts`
- Test: `src/sim/data/difficulty.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `formationSize(elapsedSec: number): number` et `formationInterval(elapsedSec: number): number` conservent leurs signatures ; seules leurs courbes changent.

- [ ] **Step 1: Réécrire les deux tests existants**

Dans `src/sim/data/difficulty.test.ts`, remplacer le test « la taille des formations va de 8 à 15, en entiers » par :

```ts
  it('la taille des formations part de 8 et monte sans plafond, en entiers', () => {
    expect(formationSize(0)).toBe(8)
    expect(Number.isInteger(formationSize(123))).toBe(true)
    // Sans plafond : aucune valeur tardive ne plafonne sur une valeur précoce.
    expect(formationSize(1200)).toBeGreaterThan(formationSize(600))
    expect(formationSize(100_000)).toBeGreaterThan(formationSize(1200))
  })

  it('la taille des formations est monotone croissante', () => {
    for (let t = 0; t < 1200; t += 10) {
      expect(formationSize(t + 10)).toBeGreaterThanOrEqual(formationSize(t))
    }
  })

  it("la taille des formations atteint l'envergure de l'arène vers dix minutes", () => {
    // Les formations qui traversent utilisent un espacement fixe de 34 px
    // (sim/systems/waves.ts) : une ligne de n ennemis couvre (n − 1) · 34.
    // C'est ce seuil qui produit les « lignes sur toute la largeur », sans
    // aucune formation nouvelle.
    expect((formationSize(620) - 1) * 34).toBeGreaterThanOrEqual(ARENA.width)
    expect((formationSize(300) - 1) * 34).toBeLessThan(ARENA.width)
  })
```

et le test « l'intervalle des formations décroît de 12 s vers 6 s » par :

```ts
  it("l'intervalle des formations part de 12 s et décroît sans plancher", () => {
    expect(formationInterval(0)).toBeCloseTo(12, 1)
    expect(formationInterval(1800)).toBeLessThan(formationInterval(600))
  })

  it("l'intervalle des formations reste strictement positif, même très tard", () => {
    // Un plancher à zéro ferait naître une infinité de formations par seconde.
    expect(formationInterval(1_000_000)).toBeGreaterThan(0)
  })

  it('les deux courbes restent finies et positives avant t = 0', () => {
    expect(formationSize(-50)).toBe(8)
    expect(formationInterval(-50)).toBeCloseTo(12, 1)
  })
```

Le test « l'intervalle des formations est monotone décroissant » existant reste tel quel.

Compléter l'import de tête du fichier avec `ARENA` depuis `@/sim/world`.

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/sim/data/difficulty.test.ts`
Expected: FAIL — les courbes actuelles plafonnent à 15 et à 6 s, donc `formationSize(1200) > formationSize(600)` et `formationInterval(1800) < formationInterval(600)` sont faux.

- [ ] **Step 3: Retirer les deux plafonds**

Dans `src/sim/data/difficulty.ts`, remplacer les deux fonctions :

```ts
/**
 * Effectif d'une formation. En dessous de huit, la figure ne se lit plus comme
 * une forme ; au-dessus, rien ne la borne — la difficulté monte indéfiniment
 * et toute partie finit par une mort (spec §5.1). Vers dix minutes l'effectif
 * atteint 39, seuil auquel une ligne couvre les 1280 px de l'arène : les
 * « lignes sur toute la largeur » arrivent sans formation nouvelle.
 * `waveSystem` borne l'ensemble par `MAX_ENEMIES - alive`.
 */
export function formationSize(elapsedSec: number): number {
  return Math.round(8 + Math.max(0, elapsedSec) / 20)
}

/**
 * Rythme du minuteur des formations, en secondes. Décroissance hyperbolique :
 * elle tend vers zéro sans jamais l'atteindre, là où un plancher à zéro ferait
 * naître une infinité de formations par seconde. 6 s à deux minutes, 2 s à
 * dix, 0,75 s à trente.
 */
export function formationInterval(elapsedSec: number): number {
  return 12 / (1 + Math.max(0, elapsedSec) / 120)
}
```

Le helper `ramp` reste utilisé par les quatre autres courbes : ne le supprime pas.

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run src/sim/data/difficulty.test.ts`
Expected: PASS.

Vérifie au passage les valeurs attendues à la main : `formationSize` vaut 8 à 0 s, 14 à 2 min, 23 à 5 min, 38 à 10 min ; `formationInterval` vaut 12 s à 0, 6 s à 2 min, 3,4 s à 5 min, 2 s à 10 min.

- [ ] **Step 5: Vérifier que rien d'autre ne dépend des plafonds**

Run: `npm test`
Expected: PASS. `src/sim/systems/waves.test.ts` contient un test « respecte le plafond d'ennemis simultanés » qui simule plusieurs milliers de pas : c'est le garde-fou `MAX_ENEMIES` qui le tient, pas les courbes, donc il doit continuer à passer. S'il échoue, c'est un vrai signal — la montée sans plafond aurait débordé le garde-fou — et non un test à ajuster.

- [ ] **Step 6: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Vérifier à l'œil**

Run: `npm run dev`, jouer au-delà de dix minutes si possible.
Expected : les formations grossissent visiblement, une `line` finit par barrer toute la largeur de l'arène, les figures s'enchaînent de plus en plus vite, et le jeu devient intenable sans ramer.

Dix minutes de jeu est long : si tu ne peux pas y arriver, dis-le et contente-toi de vérifier les valeurs des courbes par le calcul.

- [ ] **Step 8: Commit**

```bash
git add src/sim/data/difficulty.ts src/sim/data/difficulty.test.ts
git commit -m "feat(sim): faire monter la difficulté sans plafond"
```

---

## Couverture de la spec

| Section de la spec | Tâche |
| --- | --- |
| §2.1 Invariant « ce qui est affiché contient ce qui tue » | 1 (steps 5, 6) |
| §2.2 `count` 6→7, `thornRadius` 11→8, opacités du disque, ratios de l'éclat | 1 |
| §2.3 Perméabilité préservée, commentaire réécrit, test dérivé des constantes | 1 (steps 1–4) |
| §3 `RULE_GAP` 32→20, `MARGIN_X` inchangé | 3 |
| §4 `POWERUP_WEIGHT.bramble` 4→2 | 2 |
| §5.1 Vitesse et tirage des figures inchangés | 4 (step 3, explicite) |
| §5.2 Les deux courbes sans plafond | 4 |
| §5.3 Le seuil des lignes pleine largeur | 4 (step 1, test dédié) |
| §5.4 Garde-fou `MAX_ENEMIES` | 4 (step 5) |
| §6 Tests | 1, 2, 4 |
| §7 Vérification à l'œil | 1 (step 8), 3 (step 3), 4 (step 7) |
