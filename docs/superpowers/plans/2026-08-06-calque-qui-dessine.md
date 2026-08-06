# « Le calque dessine son trait » — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes sont des cases à cocher (`- [ ]`).

**But :** retirer du sac une carte devenue inerte, et faire du calque de « Papier calque » un trait dessiné plutôt qu'un point qui suit.

**Architecture :** deux changements indépendants. Le premier ferme une fuite dans `isEligible` (`sim/upgrades/draw.ts`), où le relâchement du garde `requires` laisse passer les cartes des genres désactivés. Le second fait peindre au fantôme de `tracingSystem` un ruban de `HAZARD_INK_TRAIL` le long du segment qu'il vient de parcourir, à cadence **en pixels de trajet** et non en millisecondes. Le rendu n'est pas touché : `HAZARD_INK_TRAIL` sait déjà se dessiner et sécher.

**Pile technique :** TypeScript, bitECS, Vitest. Aucune dépendance nouvelle.

**Spécification :** `docs/superpowers/specs/2026-08-06-calque-qui-dessine-design.md`

## Contraintes globales

- **Français partout** : commentaires, noms de tests, messages d'assertion. C'est la langue de tout le dépôt.
- **Sujets de commit sans accents**, format conventionnel (`fix(sim): ...`, `feat(sim): ...`) — c'est la forme des commits existants.
- **`git add` fichier par fichier, jamais `git add -A`** : plusieurs sessions partagent ce dépôt et des fichiers non suivis qui ne vous appartiennent pas peuvent apparaître pendant votre travail.
- **Ne jamais pousser vers `origin`.** Les commits restent locaux.
- **Interdits dans `sim/`** : `Math.hypot`, `Math.sin`, `Math.cos`, `Math.random`, `Date.now`, `**`. Utiliser `hypot` (et consorts) de `sim/math.ts` et `world.rng`. `sim/purity.test.ts` le garde et rougira sinon.
- **Après toute modification sous `sim/`** : `npm run version:sim` depuis `front/`, sinon `sim/version.test.ts` rougit. C'est un vrai garde, pas une formalité : un replay enregistré sous l'ancienne empreinte serait rejoué sous une simulation différente et rendrait un score faux.
- **Toutes les commandes se lancent depuis `front/`** : `npm test`, `npm run lint`, `npm run typecheck`, `npm run version:sim`.
- `sim/math.golden.json` ne doit **pas** être régénéré : ce lot ne touche pas `sim/math.ts`.

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `sim/upgrades/draw.ts` | ajoute le rejet des cartes d'un genre désactivé dans `isEligible` | 1 |
| `sim/upgrades/draw.test.ts` | le test du rejet, dérivé de `POWERUP_DISABLED` | 1 |
| `front/src/i18n/locales/fr.json` | renomme « Papier assoiffé » en « Buvard large » | 1 |
| `front/src/i18n/locales/en.json` | renomme « Thirsty Paper » en « Wide Blotter » | 1 |
| `sim/components/index.ts` | `Tracing` gagne `stepAccPx` | 2 |
| `sim/data/powerups.ts` | les trois réglages du ruban ; commentaire d'`HAZARD_INK_TRAIL` | 2 |
| `sim/systems/tracing.ts` | `spawnTrail` et `paintTrail`, appelés après le déplacement du fantôme | 2 |
| `sim/systems/tracing.test.ts` | les tests du ruban | 2 |
| `front/src/render/views/hazard.test.ts` | la tache du calque naît humide | 2 |
| `sim/version.generated.ts` | régénéré | 1 et 2 |

Aucun fichier de rendu n'est modifié, et `sim/step.ts` non plus : `tracingSystem` y est déjà appelé.

---

## Task 1 — la carte inerte cesse d'être offerte

**Fichiers :**
- Modifier : `sim/upgrades/draw.ts` (import en tête, `isEligible`)
- Modifier : `sim/upgrades/draw.test.ts` (import, un test neuf, un commentaire à corriger)
- Modifier : `front/src/i18n/locales/fr.json:137`
- Modifier : `front/src/i18n/locales/en.json:137`
- Régénérer : `sim/version.generated.ts`

**Interfaces :**
- Consomme : `POWERUP_DISABLED: ReadonlySet<PowerUpKind>` exporté par `sim/data/powerups.ts`.
- Produit : rien que la tâche 2 utilise. Les deux tâches sont indépendantes.

**Contexte.** Le Buvard est dans `POWERUP_DISABLED`, mais la carte `blotter-radius` est toujours dans `UPGRADES` et multiplie `stats.blotterRadius`, que plus aucun système en jeu ne lit. `requiresGateHolds` (`sim/upgrades/draw.ts:70`) relâche **tout** le garde `requires` dès que le vivier non mythique tombe sous trois cartes — le cas d'une vague 1 sans pastille ramassée. Mesuré avant correctif : 220 graines sur 1000 offrent la carte à la vague 1.

- [ ] **Étape 1 : écrire le test qui échoue**

Dans `sim/upgrades/draw.test.ts`, remplacer la ligne d'import des power-ups :

```ts
import { POWERUP_KINDS } from '../data/powerups'
```

par :

```ts
import { POWERUP_DISABLED, POWERUP_KINDS } from '../data/powerups'
```

Puis ajouter ce test **juste après** `it("n'améliore jamais un power-up jamais rencontré", ...)`, qui se termine par `})` autour de la ligne 55 :

```ts
  /**
   * La suite du même garde, par l'autre bout. `requiresGateHolds` fait céder la
   * règle de saveur quand elle affame l'offre — c'est voulu — mais un genre
   * **désactivé** n'est pas de la saveur : sa carte est inerte, elle ne peut
   * rien améliorer. Avant ce filtre, 220 graines sur 1000 offraient « Buvard
   * large » à la vague 1, dont l'effet (`stats.blotterRadius`) n'est plus lu
   * par aucun système en jeu.
   *
   * L'assertion porte sur `POWERUP_DISABLED`, jamais sur `'blotter'` : le
   * prochain genre mis en pause hérite du test sans que personne n'y pense.
   */
  it('ne propose jamais une carte qui améliore un genre désactivé', () => {
    const state = baseState({ seenPowerups: new Set() })
    for (let seed = 1; seed <= 1000; seed++) {
      for (const card of drawUpgrades(createRng(seed), state)) {
        const inerte = card.requires !== undefined && POWERUP_DISABLED.has(card.requires)
        expect(inerte, `graine ${seed} : ${card.id}`).toBe(false)
      }
    }
  })
```

- [ ] **Étape 2 : lancer le test pour le voir échouer**

Depuis `front/` :

```bash
npx vitest run ../sim/upgrades/draw.test.ts -t 'genre désactivé'
```

Attendu : ÉCHEC, `graine 3 : blotter-radius` (ou une autre graine — l'important est que le message nomme `blotter-radius`).

- [ ] **Étape 3 : fermer la fuite**

Dans `sim/upgrades/draw.ts`, remplacer la première ligne d'import :

```ts
import type { PowerUpKind } from '../data/powerups'
```

par :

```ts
import { POWERUP_DISABLED, type PowerUpKind } from '../data/powerups'
```

Puis, dans `isEligible`, insérer ce bloc **après** le test sur `mythicTaken` et **avant** le test sur `applyRequires` :

```ts
  // Au-dessus du relâchement de `requiresGateHolds`, et non dedans. Le garde
  // `requires` est une règle de saveur qui cède quand elle affame l'offre ; un
  // genre désactivé n'est pas de la saveur, sa carte est **inerte**. Une offre
  // remplie par deux cartes réelles vaut mieux qu'une offre de trois dont une
  // ne fait rien.
  //
  // Dérivé de `POWERUP_DISABLED` plutôt que de supprimer la carte : c'est ce
  // qui garde la propriété que `powerups.ts` revendique — retirer une ligne de
  // cet ensemble remet le genre **et** ses cartes en jeu, d'un seul geste.
  if (card.requires && POWERUP_DISABLED.has(card.requires)) {
    return false
  }
```

- [ ] **Étape 4 : corriger le commentaire devenu exact**

Dans `sim/upgrades/draw.test.ts`, le bloc de commentaire au-dessus de `it("n'inonde pas l'offre de mythiques quand aucune pastille n'a été ramassée", ...)` annonce « 14 des 18 cartes inéligibles ». Le compte était faux (19 cartes, 15 inéligibles) depuis l'ajout d'« Onde de rupture » ; il redevient juste maintenant que la carte inerte sort du vivier. Remplacer la phrase :

```
   * laisse `seenPowerups` vide, donc 14 des 18 cartes inéligibles. Les quatre
```

par :

```
   * laisse `seenPowerups` vide, donc 14 des 18 cartes tirables inéligibles —
   * 18 et non 19, la carte du Buvard étant écartée en amont avec son genre. Les quatre
```

- [ ] **Étape 5 : renommer la carte en français**

Dans `front/src/i18n/locales/fr.json`, remplacer la ligne 137 :

```json
  "upgrade.blotter-radius.name": "Papier assoiffé",
```

par :

```json
  "upgrade.blotter-radius.name": "Buvard large",
```

La ligne `desc` ne bouge pas. L'identifiant `blotter-radius` ne bouge pas non plus : les clés i18n en sont dérivées, et il nomme déjà exactement l'effet.

- [ ] **Étape 6 : renommer la carte en anglais**

Dans `front/src/i18n/locales/en.json`, remplacer la ligne 137 :

```json
  "upgrade.blotter-radius.name": "Thirsty Paper",
```

par :

```json
  "upgrade.blotter-radius.name": "Wide Blotter",
```

Le nom entrait en collision avec « Le papier boit » / *« Thirsty Paper »* (`thirsty-paper`), la mythique. Tant que le Buvard dort personne ne les voit ensemble ; le jour où il revient, les deux peuvent sortir dans la même main.

- [ ] **Étape 7 : lancer le test pour le voir passer**

```bash
npx vitest run ../sim/upgrades/draw.test.ts
```

Attendu : 13 tests passés. Si un autre test de ce fichier rougit, ne pas changer sa graine pour en trouver une complaisante — le vivier a changé, c'est la conclusion du test qu'il faut relire.

- [ ] **Étape 8 : régénérer l'empreinte et lancer la suite complète**

```bash
npm run version:sim
npm test
```

Attendu : toute la suite au vert, `sim/version.test.ts` compris.

- [ ] **Étape 9 : style et types**

```bash
npm run lint
npm run typecheck
```

Attendu : aucune erreur. `npm run format` corrige ce que `lint` signale de mécanique.

- [ ] **Étape 10 : commiter**

```bash
git add sim/upgrades/draw.ts sim/upgrades/draw.test.ts sim/version.generated.ts \
        front/src/i18n/locales/fr.json front/src/i18n/locales/en.json
git commit -m "fix(sim): ne plus offrir la carte d'un power-up desactive"
```

---

## Task 2 — le calque peint son trait

**Fichiers :**
- Modifier : `sim/components/index.ts` (`Tracing`, autour de la ligne 120)
- Modifier : `sim/data/powerups.ts` (commentaire d'`HAZARD_INK_TRAIL` ligne 108 ; `RULE_TUNING.tracingPaper` ligne 311)
- Modifier : `sim/systems/tracing.ts`
- Modifier : `sim/systems/tracing.test.ts`
- Modifier : `front/src/render/views/hazard.test.ts`
- Régénérer : `sim/version.generated.ts`

**Interfaces :**
- Consomme : `Tracing` (marqueur, devient porteur de `stepAccPx: Types.f32`), `HAZARD_INK_TRAIL: number`, `Lifetime { remaining: f32 }`, `hypot(x, y): number` de `sim/math.ts`.
- Produit : `RULE_TUNING.tracingPaper.trailStepPx`, `.trailRadius`, `.trailLifeMs` — lus par `sim/systems/tracing.ts`, `sim/systems/tracing.test.ts` et `front/src/render/views/hazard.test.ts`.

**Contexte.** Le calque est un disque de 14 px sans `Lifetime` qui rejoue la position du joueur d'il y a 2,5 s. Sa puissance est constante alors que l'arène se remplit : c'est ça qu'on corrige, pas son rayon. Il va désormais semer des taches de `HAZARD_INK_TRAIL` — le même genre que la trace de Bavure et que « Le papier boit » — le long du segment qu'il parcourt à chaque pas.

- [ ] **Étape 1 : ajouter le champ au composant**

Dans `sim/components/index.ts`, remplacer :

```ts
export const Tracing = defineComponent()
```

par :

```ts
export const Tracing = defineComponent({
  /**
   * Distance parcourue par le calque depuis sa dernière tache, en px. Vit sur
   * l'entité comme `Ricochet.wakeAccMs` et non sur le monde : c'est une
   * propriété du fantôme, pas de la partie.
   */
  stepAccPx: Types.f32,
})
```

Le bloc de commentaire qui précède `Tracing` ne bouge pas.

- [ ] **Étape 2 : ajouter les réglages du ruban**

Dans `sim/data/powerups.ts`, remplacer l'entrée `tracingPaper` de `RULE_TUNING` (ligne 311 et suivantes) — commentaire compris — par :

```ts
  /**
   * Papier calque : le fantôme rejoue la position du joueur d'il y a `delayMs`,
   * dans un disque de `radius`, et peint un ruban d'encre derrière lui.
   *
   * 2500 ms rend le calque jouable plutôt que collant : à un délai court il
   * suit le joueur partout, à un délai long le joueur a oublié son propre
   * trajet. 14 px contre 9 au joueur : le calque doit se lire comme une tache,
   * pas comme un double exact.
   */
  tracingPaper: {
    delayMs: 2500,
    radius: 14,
    /**
     * Le ruban, en `HAZARD_INK_TRAIL`. Ces trois chiffres se lisent ensemble.
     *
     * La cadence est en **pixels de trajet**, pas en millisecondes, et c'est la
     * seule différence de fond avec la trace de Bavure : la goutte va à vitesse
     * constante, donc temps et distance y sont la même grandeur, alors que le
     * calque rejoue le joueur — dont `moveSpeed` monte de 12 % par « Pas léger »
     * cumulable et tombe à zéro à l'arrêt. Une cadence au temps empilerait des
     * taches sur un pixel quand on s'arrête, et ouvrirait des trous en course.
     *
     * Étanchéité : `tracing.ts` vide son accumulateur autant de fois qu'il le
     * faut **dans le même pas**, en interpolant sur le segment, donc l'espacement
     * vaut exactement 10 px contre 26 que couvrent deux taches voisines. L'écart
     * entre cadence nominale et espacement réel qui oblige la Bavure à décaler
     * ses taches perpendiculairement n'a pas d'équivalent ici : le calque n'a ni
     * décalage ni tremblé, et ne tire donc rien dans `world.rng`. Une bavure est
     * une salissure, un calque une copie propre — l'irrégularité vient déjà de
     * la main du joueur, et le rendu donne à chaque tache sa forme depuis sa
     * position.
     *
     * 800 ms à 240 px/s donne un ruban de ~192 px sur 26, une vingtaine de
     * taches vivantes. Celui de la Bavure fait 330 sur 40 et c'est une carte
     * *commune* : celui-ci reste plus petit exprès, il accompagne toute la run
     * là où l'autre dure 6,5 s. **`trailLifeMs` est le seul de ces trois
     * chiffres qu'un playtest doit bouger** — les deux autres tiennent
     * l'étanchéité ensemble, et se déplacent tous les deux ou pas du tout.
     *
     * 800 est aussi au-dessus d'`INK_TRAIL_DRY_MS` (700, côté rendu) : en
     * dessous, la tache naîtrait déjà à demi sèche et le ruban perdrait sa
     * tête. `hazard.test.ts` garde l'inégalité.
     */
    trailStepPx: 10,
    trailRadius: 13,
    trailLifeMs: 800,
  },
```

- [ ] **Étape 3 : mettre à jour le commentaire du genre de zone**

Toujours dans `sim/data/powerups.ts`, `HAZARD_INK_TRAIL` (ligne 108) nomme deux semeurs et il y en a trois. Remplacer :

```
 * Le genre ne nomme personne, volontairement : la trace de la Bavure l'a créé,
 * mais « Le papier boit » y sème les siennes avec d'autres réglages
 * (`RULE_TUNING.thirstyPaper`) et le même dessin. Ce qui varie d'une tache à
 * l'autre tient entièrement dans `Hazard.radius` et `Lifetime`.
```

par :

```
 * Le genre ne nomme personne, volontairement : la trace de la Bavure l'a créé,
 * mais « Le papier boit » (`RULE_TUNING.thirstyPaper`) et le ruban de « Papier
 * calque » (`RULE_TUNING.tracingPaper`) y sèment les leurs avec d'autres
 * réglages et le même dessin. Ce qui varie d'une tache à l'autre tient
 * entièrement dans `Hazard.radius` et `Lifetime`.
```

- [ ] **Étape 4 : écrire les tests qui échouent**

Dans `sim/systems/tracing.test.ts`, remplacer les deux lignes d'import des données :

```ts
import { HAZARD_TRACING, RULE_TUNING } from '../data/powerups'
```

par :

```ts
import { HAZARD_INK_TRAIL, HAZARD_TRACING, RULE_TUNING } from '../data/powerups'
```

Ajouter, juste après la ligne `const ghostQuery = defineQuery([Tracing, Hazard, Position])` :

```ts
/** Les taches du ruban : `Hazard` + `Lifetime`, filtrées sur le genre. */
const trailQuery = defineQuery([Hazard, Lifetime, Position])
```

et, juste après `const ghosts = (w: SimWorld): number[] => [...ghostQuery(w)]` :

```ts
const trails = (w: SimWorld): number[] =>
  [...trailQuery(w)].filter((eid) => Hazard.kind[eid] === HAZARD_INK_TRAIL)
```

Puis ajouter ces six tests **à la fin** du `describe('tracingSystem', ...)`, avant son `})` final. Note : `step()` n'appelle pas `lifetimeSystem`, donc aucune tache n'expire pendant ces tests — c'est voulu, on mesure la géométrie du ruban, pas sa mortalité.

```ts
  it('peint un ruban de taches derrière lui', () => {
    const w = setup()
    const stats = statsAvecCarte()

    // 4 px par image : le calque parcourt le même trajet 2,5 s plus tard.
    for (let i = 0; i <= DELAY_FRAMES + 30; i++) {
      step(w, stats, 200 + i * 4, 300)
    }

    const ruban = trails(w)
    expect(ruban.length).toBeGreaterThan(0)
    for (const t of ruban) {
      expect(Hazard.radius[t]).toBe(RULE_TUNING.tracingPaper.trailRadius)
      expect(Lifetime.remaining[t]).toBe(RULE_TUNING.tracingPaper.trailLifeMs)
    }
    // La tête, elle, ne meurt toujours pas : c'est la seule zone du jeu sans
    // `Lifetime`, et le ruban ne doit pas la contaminer.
    expect(hasComponent(w, Lifetime, ghosts(w)[0]!)).toBe(false)
  })

  /**
   * L'invariant que la boucle interpolée de `paintTrail` existe pour tenir :
   * quelle que soit la vitesse, deux taches voisines sont espacées de
   * `trailStepPx`, jamais d'un pas de simulation entier. Une implémentation qui
   * n'émettrait qu'une tache par pas laisserait ici des trous de 45 px —
   * largement de quoi laisser passer un Éclat, et invisible à vitesse normale.
   */
  it('espace ses taches en pixels de trajet, pas en pas de simulation', () => {
    const w = setup()
    const stats = statsAvecCarte()

    const SAUT = 45
    for (let i = 0; i <= DELAY_FRAMES + 20; i++) {
      step(w, stats, 200 + i * SAUT, 300)
    }

    const xs = trails(w)
      .map((t) => Position.x[t]!)
      .sort((a, b) => a - b)
    expect(xs.length).toBeGreaterThan(20)
    for (let i = 1; i < xs.length; i++) {
      expect(
        xs[i]! - xs[i - 1]!,
        `trou de ${xs[i]! - xs[i - 1]!} px entre ${xs[i - 1]} et ${xs[i]}`,
      ).toBeLessThanOrEqual(RULE_TUNING.tracingPaper.trailStepPx + 0.001)
    }
  })

  it('ne peint rien tant que le joueur ne bouge pas', () => {
    const w = setup()
    const stats = statsAvecCarte()

    for (let i = 0; i <= DELAY_FRAMES + 60; i++) {
      step(w, stats, 200, 300)
    }

    // Le calque existe — l'historique couvre l'instant demandé — mais il n'a
    // parcouru aucune distance. Une cadence au temps aurait empilé ici une
    // soixantaine de taches sur un seul pixel.
    expect(ghosts(w)).toHaveLength(1)
    expect(trails(w)).toHaveLength(0)
  })

  /**
   * Ce que le ruban apporte, et que la tête seule ne pouvait pas : tuer ce qui
   * marche sur le trajet **après** son passage. C'est la persistance qui est
   * sous test, pas la largeur — le ruban (13 px) est plus étroit que la tête (14).
   */
  it('tue ce qui entre dans le ruban après le passage de la tête', () => {
    const w = setup()
    const stats = statsAvecCarte()

    for (let i = 0; i <= DELAY_FRAMES + 30; i++) {
      step(w, stats, 200 + i * 4, 300)
    }

    const tete = Position.x[ghosts(w)[0]!]!
    // 60 px derrière la tête : bien au-delà des 14 + 7 px qu'elle couvre sur un
    // Point, et en plein sur une portion peinte quelques images plus tôt.
    const enemy = spawnEnemy(w, { type: 'point', x: tete - 60, y: 300, materializeMs: 0 })
    hazardSystem(w)

    expect(hasComponent(w, Doomed, enemy)).toBe(true)
  })

  it("laisse intact ce qui longe le ruban sans y entrer", () => {
    const w = setup()
    const stats = statsAvecCarte()

    // Contre-épreuve du test précédent : à 100 px du trajet, hors d'atteinte de
    // la tête comme du ruban. Sans elle, « tout meurt » passerait.
    const enemy = spawnEnemy(w, { type: 'point', x: 260, y: 420, materializeMs: 0 })

    for (let i = 0; i <= DELAY_FRAMES + 30; i++) {
      step(w, stats, 200 + i * 4, 300)
      hazardSystem(w)
    }

    expect(hasComponent(w, Doomed, enemy)).toBe(false)
  })

  it('pose des taches qui se recouvrent, quels que soient les réglages', () => {
    const { trailStepPx, trailRadius } = RULE_TUNING.tracingPaper
    // Deux taches voisines couvrent 2 × trailRadius le long du trajet. Les
    // espacer davantage ouvrirait un couloir vivant au milieu du ruban, et
    // l'espacement est exact — `paintTrail` interpole, il n'arrondit pas au pas.
    expect(trailStepPx).toBeLessThan(2 * trailRadius)
  })
```

- [ ] **Étape 5 : lancer les tests pour les voir échouer**

```bash
npx vitest run ../sim/systems/tracing.test.ts
```

Attendu : ÉCHEC sur les **trois** tests qui observent un ruban qui n'existe pas encore — `peint un ruban de taches derrière lui`, `espace ses taches en pixels de trajet`, `tue ce qui entre dans le ruban après le passage de la tête`.

Les trois autres passent déjà, et c'est normal : `ne peint rien tant que le joueur ne bouge pas` et `laisse intact ce qui longe le ruban` sont des contre-épreuves, `pose des taches qui se recouvrent` lit les réglages posés à l'étape 2. Ce sont des gardes, pas des moteurs — ne pas chercher à les faire rougir.

- [ ] **Étape 6 : écrire l'implémentation**

Dans `sim/systems/tracing.ts`, remplacer les deux lignes d'import du haut :

```ts
import { Hazard, Position, PrevPosition, Tracing } from '../components'
import { HAZARD_TRACING, RULE_TUNING } from '../data/powerups'
```

par :

```ts
import { Hazard, Lifetime, Position, PrevPosition, Tracing } from '../components'
import { HAZARD_INK_TRAIL, HAZARD_TRACING, RULE_TUNING } from '../data/powerups'
import { hypot } from '../math'
```

`hypot` vient de `sim/math.ts` et **jamais** de `Math` : `purity.test.ts` interdit `Math.hypot` dans `sim/`, parce que le moteur n'en spécifie pas exactement le résultat et qu'un replay doit rejouer au bit près.

Dans `spawnGhost`, ajouter cette ligne juste après `Hazard.growthRate[eid] = 0` :

```ts
  // Remis à zéro explicitement : bitECS recycle les emplacements d'entités, et
  // un reliquat du calque d'une partie précédente décalerait la première tache.
  // Même piège que `PrevPosition` ci-dessus.
  Tracing.stepAccPx[eid] = 0
```

Ajouter ces deux fonctions **après** `spawnGhost` et **avant** `tracingSystem` :

```ts
/**
 * Une tache du ruban. Pas de `PrevPosition` : l'encre posée ne bouge plus, et
 * `stage.ts` n'interpole que ce qui en porte.
 */
function spawnTrail(world: SimWorld, x: number, y: number): number {
  const { trailRadius, trailLifeMs } = RULE_TUNING.tracingPaper
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = HAZARD_INK_TRAIL
  Hazard.radius[eid] = trailRadius
  Hazard.maxRadius[eid] = trailRadius
  // Zéro : `hazardSystem` fait grossir le rayon dès que `growthRate` est positif.
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = trailLifeMs
  return eid
}

/**
 * Sème le ruban le long du segment que le calque vient de parcourir.
 *
 * La boucle vide l'accumulateur autant de fois qu'il le faut **dans le même
 * pas**, en interpolant chaque tache sur le segment : l'espacement vaut donc
 * exactement `trailStepPx`, que le joueur marche ou qu'il file. C'est ce qui
 * dispense le calque du décalage perpendiculaire dont la Bavure a besoin — son
 * accumulateur à elle ne se vide qu'une fois par pas, donc son espacement réel
 * dépasse sa cadence nominale et le ruban pourrait s'ouvrir.
 *
 * Un segment de longueur nulle ne pose rien : un joueur immobile ne doit pas
 * empiler des taches sur un pixel.
 */
function paintTrail(
  world: SimWorld,
  eid: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  const { trailStepPx } = RULE_TUNING.tracingPaper
  const dx = toX - fromX
  const dy = toY - fromY
  const length = hypot(dx, dy)
  if (length === 0) {
    return
  }

  let acc = Tracing.stepAccPx[eid]!
  let done = 0
  while (acc + (length - done) >= trailStepPx) {
    done += trailStepPx - acc
    acc = 0
    const t = done / length
    spawnTrail(world, fromX + dx * t, fromY + dy * t)
  }
  Tracing.stepAccPx[eid] = acc + (length - done)
}
```

Enfin, dans `tracingSystem`, remplacer le bloc de mise à jour du fantôme existant :

```ts
  // Sans PrevPosition à jour, le rendu ne peut pas interpoler : le calque
  // avancerait par saccades d'un pas de simulation.
  PrevPosition.x[existing] = Position.x[existing]!
  PrevPosition.y[existing] = Position.y[existing]!
  Position.x[existing] = target.x
  Position.y[existing] = target.y

  return world
```

par :

```ts
  const fromX = Position.x[existing]!
  const fromY = Position.y[existing]!

  // Sans PrevPosition à jour, le rendu ne peut pas interpoler : le calque
  // avancerait par saccades d'un pas de simulation.
  PrevPosition.x[existing] = fromX
  PrevPosition.y[existing] = fromY
  Position.x[existing] = target.x
  Position.y[existing] = target.y

  // Après le déplacement, sur le segment réellement parcouru. Rien à l'image de
  // naissance : `spawnGhost` retourne plus haut, il n'y a pas encore de segment.
  paintTrail(world, existing, fromX, fromY, target.x, target.y)

  return world
```

Mettre enfin à jour l'en-tête du fichier : la phrase « un fantôme du trajet du joueur d'il y a `delayMs` le suit et tue ce qu'il touche » devient « un fantôme du trajet du joueur d'il y a `delayMs` le suit, tue ce qu'il touche et peint derrière lui un ruban d'encre qui tue aussi ».

- [ ] **Étape 7 : lancer les tests pour les voir passer**

```bash
npx vitest run ../sim/systems/tracing.test.ts
```

Attendu : 16 tests passés (les 10 existants, plus les 6 de l'étape 4).

- [ ] **Étape 8 : écrire le test de rendu qui échoue**

Dans `front/src/render/views/hazard.test.ts`, remplacer la première ligne d'import :

```ts
import { POWERUP_BASE } from '@sim/data/powerups'
```

par :

```ts
import { POWERUP_BASE, RULE_TUNING } from '@sim/data/powerups'
```

Puis ajouter ce test dans le `describe('les réglages de la trace', ...)`, après celui qui existe :

```ts
  /**
   * Le calque peint le même genre de tache que la Bavure, avec sa propre vie.
   * Sous `INK_TRAIL_DRY_MS` (700), sa tache naîtrait déjà à demi sèche : le
   * ruban perdrait sa tête, et on ne lirait plus où le trait est frais. C'est
   * un lien réel entre un réglage de simulation et une constante de vue, et il
   * n'a que ce test pour le tenir.
   */
  it('laisse naître humide la tache du calque aussi', () => {
    const vie = RULE_TUNING.tracingPaper.trailLifeMs
    expect(inkTrailWetness(vie)).toBe(1)
    expect(inkTrailWetness(vie * 0.5)).toBeLessThan(0.95)
  })
```

- [ ] **Étape 9 : lancer le test de rendu**

```bash
npx vitest run src/render/views/hazard.test.ts
```

Attendu : tous passés. Ce test-ci passe du premier coup une fois `trailLifeMs` en place (étape 2) — c'est un garde contre une baisse future du réglage, pas un moteur.

- [ ] **Étape 10 : régénérer l'empreinte et lancer la suite complète**

```bash
npm run version:sim
npm test
```

Attendu : toute la suite au vert. Vérifier en particulier `sim/purity.test.ts` (aucun `Math.hypot` n'a dû se glisser) et `sim/determinism.test.ts`.

- [ ] **Étape 11 : style et types**

```bash
npm run lint
npm run typecheck
```

Attendu : aucune erreur.

- [ ] **Étape 12 : commiter**

```bash
git add sim/components/index.ts sim/data/powerups.ts sim/systems/tracing.ts \
        sim/systems/tracing.test.ts sim/version.generated.ts \
        front/src/render/views/hazard.test.ts
git commit -m "feat(sim): le calque peint un ruban d'encre le long de son trajet"
```

---

## Vérification finale

- [ ] `npm test` depuis `front/` : toute la suite au vert.
- [ ] `npm run lint` et `npm run typecheck` : rien à signaler.
- [ ] `git status --short` : aucun fichier modifié non commité **qui vous appartienne**. Des fichiers non suivis provenant d'une autre session peuvent être présents — les laisser tranquilles.
- [ ] `git log --oneline -2` : les deux commits, dans l'ordre.
- [ ] Lancer le jeu (`npm run dev` depuis `front/`), prendre « Papier calque », vérifier de visu que le ruban se lit comme un trait qui sèche derrière le calque et qu'il ne carrelle pas l'arène. **`trailLifeMs` est le seul chiffre à ajuster** si le ruban tient trop : un ruban trop tenace transforme une boucle serrée en enclos permanent, et la carte cesse de demander quoi que ce soit au joueur.
