# « Onde de rupture » — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe case à cocher (`- [ ]`).

**But :** donner au Halo la carte qui lui manque — une rare qui fait poser au Halo brisé une explosion au point de contact, pour qu'il cesse d'être une mort reportée et devienne une situation résolue.

**Architecture :** une carte de données (`UPGRADES`) qui pose une règle dans `RunStats.rules`, lue par `collisionSystem` au moment où le Halo casse. Aucun système nouveau, aucun composant nouveau : la zone posée est une `HAZARD_BLAST` ordinaire, réglée par `RULE_TUNING.haloBurst` et éprouvée par le `hazardSystem` existant au pas suivant.

**Pile technique :** TypeScript, bitECS, Vitest. Simulation dans `sim/`, textes dans `front/src/i18n/`.

**Spec de référence :** `docs/superpowers/specs/2026-08-04-carte-halo-design.md`

## Contraintes globales

- **Ne jamais pousser.** Les commits restent locaux.
- **Ne jamais faire `git add -A`.** Plusieurs sessions travaillent dans le même arbre : ne mettre en index que les fichiers listés dans la tâche, nommés explicitement.
- **Toute modification de `sim/` invalide `SIM_VERSION`.** Lancer `npm run version:sim` depuis `front/` **avant chaque commit** qui touche `sim/`, et inclure `sim/version.generated.ts` dans l'index. Sinon `sim/version.test.ts` échoue.
- **Les commandes npm se lancent depuis `front/`** (`cd front`), c'est le paquet qui porte les scripts.
- **Messages de commit** : conventionnels, en français, **sans accents dans le sujet** (convention observée dans l'historique : `feat(sim): porter l'id d'arene dans le format de replay`).
- **Lint** : `npm run lint` échoue actuellement sur `src/render/views/enemy.ts` et `enemy.test.ts` pour des raisons de formatage **antérieures et étrangères à ce plan**. Ne pas les corriger. Vérifier son propre travail avec `npx biome check <fichiers touchés>`.
- **Valeurs de réglage, à recopier exactement :** `radius: 140`, `growthRate: 320`, `lingerMs: 300`. Identifiant de règle : `haloBurst` (camelCase). Identifiant de carte : `halo-burst` (kebab-case).

---

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `sim/data/powerups.ts` | Ajout de `RULE_TUNING.haloBurst` — les trois chiffres et leur justification | 1 |
| `sim/data/upgrades.ts` | Ajout de la carte `halo-burst` dans le bloc des rares | 1 |
| `front/src/i18n/locales/fr.json` | Nom et description français | 1 |
| `front/src/i18n/locales/en.json` | Nom et description anglais | 1 |
| `sim/data/upgrades.test.ts` | Test de couverture : chaque power-up tirable a une carte | 1 |
| `sim/systems/collision.ts` | Pose de l'explosion à la rupture ; la signature prend `stats` | 2 |
| `sim/step.ts` | L'appel suit la nouvelle signature | 2 |
| `sim/systems/collision.test.ts` | Comportement de la rupture, avec et sans la carte | 2 |
| `sim/version.generated.ts` | Régénéré à chaque tâche (jamais édité à la main) | 1 et 2 |

Deux tâches, et la coupure est celle d'un relecteur : la tâche 1 livre une carte tirable et traduite qui ne **fait** encore rien ; la tâche 2 lui donne son effet. Un relecteur peut accepter l'une et refuser l'autre.

---

## Tâche 1 : la carte, son réglage et ses textes

**Fichiers :**
- Modifier : `sim/data/powerups.ts` (dans `RULE_TUNING`, avant le `} as const` final)
- Modifier : `sim/data/upgrades.ts` (fin du bloc « Rares », juste après la carte `splatter-split`)
- Modifier : `front/src/i18n/locales/fr.json` (après la ligne `"upgrade.splatter-split.desc"`)
- Modifier : `front/src/i18n/locales/en.json` (après la ligne `"upgrade.splatter-split.desc"`)
- Test : `sim/data/upgrades.test.ts` (nouveau `describe` à la fin du fichier)
- Régénérer : `sim/version.generated.ts`

**Interfaces :**
- Produit : `RULE_TUNING.haloBurst: { radius: number; growthRate: number; lingerMs: number }`, consommé par la tâche 2.
- Produit : une entrée de `UPGRADES` d'id `halo-burst` dont `apply` ajoute la chaîne `'haloBurst'` à `stats.rules`. La tâche 2 lit cette chaîne via `stats.rules.has('haloBurst')` — **les deux doivent s'écrire exactement pareil**, aucun compilateur ne le vérifiera.

- [ ] **Étape 1 : écrire le test qui échoue**

À la fin de `sim/data/upgrades.test.ts`, ajouter ce `describe`. Ajouter aussi `POWERUP_DRAWABLE` à l'import existant depuis `./powerups`, qui devient :

```ts
import { HAZARD_QUILL, HAZARD_SPLATTER, POWERUP_DRAWABLE } from './powerups'
```

Puis, en fin de fichier :

```ts
describe('couverture du pool', () => {
  /**
   * Le Halo a longtemps été le seul power-up qu'aucune carte ne touchait —
   * déséquilibre consigné au §5 de la spec de rebuild, et resserré à chaque
   * élagage sans jamais être refermé.
   *
   * L'assertion porte sur tous les genres tirables plutôt que sur `halo-burst`
   * nommément : ainsi elle garde sa valeur au prochain élagage, et elle attrape
   * le prochain power-up ajouté sans carte. `POWERUP_DRAWABLE` et non
   * `POWERUP_KINDS` : un genre retiré du sac (le Buvard aujourd'hui) n'a pas à
   * porter une carte que personne ne peut tirer.
   */
  it('chaque power-up tirable a au moins une carte', () => {
    for (const kind of POWERUP_DRAWABLE) {
      expect(
        UPGRADES.some((u) => u.requires === kind),
        `aucune carte pour ${kind}`,
      ).toBe(true)
    }
  })
})
```

- [ ] **Étape 2 : lancer le test pour le voir échouer**

```bash
cd front && npx vitest run ../sim/data/upgrades.test.ts
```

Attendu : ÉCHEC sur `aucune carte pour halo` — et **uniquement** celui-là. Si un autre genre remonte, s'arrêter et le signaler : cela veut dire qu'un second trou existe, hors du périmètre de ce plan.

- [ ] **Étape 3 : ajouter le réglage**

Dans `sim/data/powerups.ts`, à l'intérieur de `RULE_TUNING`, juste après l'entrée `thirstyPaper` et avant le `} as const` :

```ts
  /**
   * Onde de rupture : le Halo brisé pose une explosion au point de contact. Il
   * ne tue plus seulement l'ennemi fautif — celui-là meurt déjà — il emporte la
   * grappe qui l'accompagnait.
   *
   * 140 se lit entre les deux explosions du jeu : sous la Bombe (150),
   * franchement au-dessus de celle de la plume (90). Le repère est « dégager la
   * grappe qui vous a touché », pas l'arène. Plus large que la Bombe ferait du
   * Halo le meilleur outil offensif du jeu par accident, alors qu'il est le
   * power-up défensif — et il est déjà l'un des plus rares (`POWERUP_WEIGHT`).
   *
   * `growthRate` est celui de toutes les explosions, Bombe et plume comprises :
   * une explosion doit se lire pareil quelle que soit sa taille. `lingerMs` est
   * celui de la plume (300) et non celui de la Bombe (450) — la rupture est un
   * événement, pas un piège qu'on laisse derrière soi.
   *
   * **Seule zone de `RULE_TUNING` mise à l'échelle par `rangeScale`**, et c'est
   * un choix, pas un écart : elle suit la famille des explosions (toutes mises
   * à l'échelle, `stats.blastRadius` comme `POWERUP_BASE.volley.blastRadius`)
   * plutôt que celle de ses voisines ici (`thirstyPaper` 22 px, `tracingPaper`
   * 14 px, qui posent leur rayon brut). À 140 px l'écart n'est pas théorique :
   * sans mise à l'échelle, une arène mobile la verrait couvrir
   * proportionnellement bien plus qu'une arène de bureau. Savoir si l'absence
   * de mise à l'échelle des deux autres est un choix ou un oubli reste une
   * question ouverte, hors périmètre.
   */
  haloBurst: { radius: 140, growthRate: 320, lingerMs: 300 },
```

- [ ] **Étape 4 : ajouter la carte**

Dans `sim/data/upgrades.ts`, dans le bloc « Rares », juste après l'objet `splatter-split` et avant le commentaire `// ── Mythiques` :

```ts
  {
    id: 'halo-burst',
    rarity: 'rare',
    stackable: false,
    requires: 'halo',
    apply: (s) => {
      s.rules.add('haloBurst')
    },
  },
```

Rare et non commune : le gain est un changement de comportement, ce que ce fichier donne pour définition à la rareté rare. Les quatre autres rares sont une par power-up (Gel, Ronce, Volée, Bavure) — le Halo était le trou de cette rangée.

- [ ] **Étape 5 : ajouter les textes français**

Dans `front/src/i18n/locales/fr.json`, insérer ces deux lignes **après** `"upgrade.splatter-split.desc": "La bavure se dédouble au premier rebond",` et **avant** `"upgrade.tracing-paper.name"` :

```json
  "upgrade.halo-burst.name": "Onde de rupture",
  "upgrade.halo-burst.desc": "Le halo brisé emporte ce qui l'entoure",
```

- [ ] **Étape 6 : ajouter les textes anglais**

Dans `front/src/i18n/locales/en.json`, insérer ces deux lignes **après** `"upgrade.splatter-split.desc": "The splatter splits on its first bounce",` et **avant** `"upgrade.tracing-paper.name"` :

```json
  "upgrade.halo-burst.name": "Breaking Wave",
  "upgrade.halo-burst.desc": "A shattered halo takes its surroundings with it",
```

La capitale à `Wave` suit les autres noms anglais du fichier (`Creeping Frost`, `Nested Quills`, `Tracing Paper`).

- [ ] **Étape 7 : lancer les tests pour les voir passer**

```bash
cd front && npx vitest run ../sim/data/upgrades.test.ts src/i18n/parity.test.ts
```

Attendu : SUCCÈS pour les deux fichiers. `parity.test.ts` compare `fr.json` et `en.json` — s'il échoue, c'est qu'une des deux paires de clés manque ou est mal orthographiée.

- [ ] **Étape 8 : régénérer l'empreinte de simulation et lancer la suite complète**

```bash
cd front && npm run version:sim && npm test
```

Attendu : tout vert. `sim/version.generated.ts` a changé — c'est voulu, `sim/` a été modifié.

Si `sim/determinism.test.ts` échoue, **s'arrêter et signaler** : la run de référence ne prend aucune carte, la règle n'y est donc jamais active, et son empreinte ne devrait pas bouger à cette tâche. Ce serait le signe qu'autre chose a bougé.

- [ ] **Étape 9 : vérifier le style sur les fichiers touchés**

```bash
cd front && npx biome check ../sim/data/powerups.ts ../sim/data/upgrades.ts ../sim/data/upgrades.test.ts ../sim/version.generated.ts src/i18n/locales/fr.json src/i18n/locales/en.json
```

Attendu : `No fixes applied.` sans erreur.

- [ ] **Étape 10 : commiter**

```bash
git add sim/data/powerups.ts sim/data/upgrades.ts sim/data/upgrades.test.ts sim/version.generated.ts front/src/i18n/locales/fr.json front/src/i18n/locales/en.json
git commit -m "feat(sim): la carte rare du halo et son reglage"
```

---

## Tâche 2 : l'explosion à la rupture

**Fichiers :**
- Modifier : `sim/systems/collision.ts` (imports, nouvelle fonction, signature, branche Halo)
- Modifier : `sim/step.ts:81` (l'appel)
- Test : `sim/systems/collision.test.ts` (l'aide `step`, puis trois tests)
- Test : `sim/invulnerability.test.ts`, `sim/powerups/activate.test.ts`,
  `sim/systems/dash-kill.test.ts`, `sim/systems/hazards.test.ts`,
  `sim/systems/pickup.test.ts` — appelants existants à mettre à la nouvelle signature
- Régénérer : `sim/version.generated.ts`

**Interfaces :**
- Consomme : `RULE_TUNING.haloBurst` et la règle `'haloBurst'` de la tâche 1.
- Produit : `collisionSystem(world: SimWorld, stats: RunStats): SimWorld` — **la signature change**.

> **Correction apportée en cours d'exécution.** Ce bloc affirmait d'abord que
> `step.ts` et `collision.test.ts` étaient « les deux seuls appelants ». C'était
> faux : il y en a **dix**, répartis dans cinq fichiers de test de plus (listés
> ci-dessus), et l'un d'eux plante à l'exécution — pas seulement au typecheck —
> dès que `stats` devient obligatoire. L'implémenteur s'est arrêté avant de
> commiter plutôt que d'élargir le périmètre seul, et l'arbitrage a été de
> **garder `stats` obligatoire** et de corriger les dix appels, plutôt que de le
> rendre optionnel sur le modèle de `freezeSystem(world, stats?)`. Raison : un
> paramètre optionnel ouvre exactement la classe de panne muette que ce chantier
> combat — un appelant qui l'oublie désactiverait la carte sans qu'aucun outil ne
> le signale, comme la chaîne `'haloBurst'` que rien ne type.
>
> Dans chacun de ces fichiers, `collisionSystem(w)` devient
> `collisionSystem(w, createRunStats())` — ou reçoit le `stats` déjà en portée
> quand le test en a un. Deux instances distinctes dans un même test feraient
> silencieusement mentir toute assertion portant sur une carte.

**À savoir avant de commencer, pour ne pas écrire de test faux :**

- `hazardSystem` fait grandir la zone de `growthRate * dt` par pas, avec `dt = 16,667/1000` s. À 320 px/s, cela fait **5,33 px par pas**. Une zone qui naît à 6 px atteint 140 px en **26 pas**, pas en un seul.
- `HAZARD_BLAST` est dans l'ensemble `LETHAL` de `hazards.ts` : la zone marque `Doomed`, et c'est `deathSystem` qui supprime réellement l'entité, en fin de pas.
- `createWorld` sans `rangeScale` explicite le met à **1** (`world.ts:176`). Les tests peuvent donc comparer aux valeurs brutes de `RULE_TUNING`.
- `collisionSystem` tourne **après** `hazardSystem` dans `step.ts`. La zone posée à la rupture est donc éprouvée au pas suivant — même latence que la Bombe posée au ramassage. Ce n'est pas un défaut à corriger.

- [ ] **Étape 1 : adapter l'aide `step` du fichier de test**

Dans `sim/systems/collision.test.ts`, remplacer l'aide existante :

```ts
const step = (w: ReturnType<typeof setup>) => {
  collisionSystem(w)
  deathSystem(w, createRunStats())
}
```

par :

```ts
/**
 * `stats` est partagé entre les deux systèmes, au lieu d'en fabriquer un par
 * appel : les cartes se lisent des deux côtés, et deux instances distinctes
 * feraient silencieusement mentir tout test qui en prend une.
 */
const step = (w: ReturnType<typeof setup>, stats: RunStats = createRunStats()) => {
  collisionSystem(w, stats)
  deathSystem(w, stats)
}
```

Compléter l'import de `stats` en tête de fichier, qui devient :

```ts
import { createRunStats, type RunStats } from '../upgrades/stats'
```

Ajouter aussi les imports dont les tests auront besoin — `Hazard` et `Lifetime` au composant, `hazardSystem`, les réglages, et l'accès aux cartes :

```ts
import { Doomed, Enemy, Halo, Hazard, Invulnerable, Position, Velocity } from '../components'
import { HAZARD_BLAST, RULE_TUNING } from '../data/powerups'
import { UPGRADES } from '../data/upgrades'
import { hazardSystem } from './hazards'
```

Et, sous les autres aides du fichier :

```ts
const hazardsIn = defineQuery([Hazard, Position])

/** La carte d'id donné, ou une erreur si elle a disparu de `UPGRADES`. */
function cardById(id: string) {
  const card = UPGRADES.find((u) => u.id === id)
  if (!card) {
    throw new Error(`carte introuvable : ${id}`)
  }
  return card
}
```

- [ ] **Étape 2 : écrire les tests qui échouent**

Dans `sim/systems/collision.test.ts`, à l'intérieur du `describe('collisionSystem', ...)`, juste après le test existant `"le Halo absorbe le contact, détruit l'ennemi et donne 1 s d'invulnérabilité"` :

```ts
  it('sans « Onde de rupture », le Halo brisé ne pose aucune zone', () => {
    const w = setup()
    addComponent(w, Halo, w.playerEid)
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w)
    expect(hazardsIn(w)).toHaveLength(0)
  })

  it('avec « Onde de rupture », le Halo brisé pose une explosion au point de contact', () => {
    const w = setup()
    const stats = createRunStats()
    cardById('halo-burst').apply(stats)
    addComponent(w, Halo, w.playerEid)
    spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    step(w, stats)

    const zones = hazardsIn(w)
    expect(zones).toHaveLength(1)
    const zone = zones[0]!
    expect(Hazard.kind[zone]).toBe(HAZARD_BLAST)
    // Au point de contact, c'est-à-dire sur le joueur — pas sur l'ennemi.
    expect(Position.x[zone]).toBe(400)
    expect(Position.y[zone]).toBe(300)
    // `rangeScale` vaut 1 dans ce monde de test : la valeur brute s'applique.
    expect(Hazard.maxRadius[zone]).toBeCloseTo(RULE_TUNING.haloBurst.radius, 5)
  })

  /**
   * Le seul test qui distingue cette carte d'une décoration. L'ennemi fautif
   * mourait déjà sans elle ; ce qui change, c'est le sort de son voisin.
   *
   * Le voisin est à 80 px, hors de portée du contact. La zone naît à 6 px et
   * grandit de 5,33 px par pas (320 px/s) : il lui faut ~13 pas pour l'atteindre
   * (rayon utile 80 − 7 de rayon d'ennemi). Trente pas laissent de la marge des
   * deux côtés — la zone est à son maximum au 26ᵉ, et elle vit ~738 ms, soit 44
   * pas.
   */
  it('l’explosion emporte un ennemi voisin que le Halo seul aurait épargné', () => {
    const voisinPos = { type: 'point' as const, x: 480, y: 300, materializeMs: 0 }

    const sans = setup()
    addComponent(sans, Halo, sans.playerEid)
    spawnEnemy(sans, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    const voisinSans = spawnEnemy(sans, voisinPos)
    const statsSans = createRunStats()
    step(sans, statsSans)
    for (let i = 0; i < 30; i++) {
      hazardSystem(sans)
      deathSystem(sans, statsSans)
    }
    expect(entityExists(sans, voisinSans)).toBe(true)

    const avec = setup()
    const statsAvec = createRunStats()
    cardById('halo-burst').apply(statsAvec)
    addComponent(avec, Halo, avec.playerEid)
    const fautif = spawnEnemy(avec, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    const voisinAvec = spawnEnemy(avec, voisinPos)
    step(avec, statsAvec)
    // L'ennemi fautif meurt dans les deux cas : l'explosion s'ajoute à `Doomed`,
    // elle ne le remplace pas.
    expect(entityExists(avec, fautif)).toBe(false)
    for (let i = 0; i < 30; i++) {
      hazardSystem(avec)
      deathSystem(avec, statsAvec)
    }
    expect(entityExists(avec, voisinAvec)).toBe(false)
  })
```

- [ ] **Étape 3 : lancer les tests pour les voir échouer**

```bash
cd front && npx vitest run ../sim/systems/collision.test.ts
```

Attendu : ÉCHEC. Le premier échec sera une erreur de type sur `collisionSystem(w, stats)` (la fonction n'accepte qu'un argument), ou, une fois celle-ci passée, `expected 1 to be 0` sur la zone attendue. C'est le bon échec : la fonctionnalité manque.

- [ ] **Étape 4 : écrire l'implémentation minimale**

Dans `sim/systems/collision.ts`.

D'abord les imports. La première ligne devient :

```ts
import { addComponent, addEntity, defineQuery, hasComponent, Not, removeComponent } from 'bitecs'
```

Le bloc d'import des composants devient :

```ts
import {
  Collider,
  Dashing,
  Doomed,
  Enemy,
  Frozen,
  Halo,
  Hazard,
  Invulnerable,
  Lifetime,
  Materializing,
  Position,
} from '../components'
```

Et sous `import { MAX_ENEMY_RADIUS } from '../data/enemies'`, ajouter :

```ts
import { HAZARD_BLAST, RULE_TUNING } from '../data/powerups'
```

Sous `import { createSpatialHash } from '../spatial-hash'`, ajouter :

```ts
import type { RunStats } from '../upgrades/stats'
```

Ensuite, juste après la constante `HALO_BREAK_GRACE_MS`, ajouter la fonction :

```ts
/**
 * L'explosion d'« Onde de rupture », posée au point de contact quand le Halo
 * casse.
 *
 * Réutiliser `HAZARD_BLAST` a exactement la même conséquence que pour la Volée
 * (voir `seeker.ts`) : cette explosion n'hérite **pas** de « Large explosion »
 * ni de « Combustion lente », qui lisent `stats.blastRadius` et
 * `stats.blastLingerMs` alors que les réglages viennent ici de
 * `RULE_TUNING.haloBurst`. C'est voulu — « Onde de rupture » est une carte du
 * Halo, pas de la Bombe, et un cumul ferait dépendre la puissance du Halo d'un
 * investissement dans un autre power-up.
 *
 * Le rayon ET la croissance sont mis à l'échelle : leur rapport, qui décide de
 * la durée de vie, reste donc invariant d'une arène à l'autre.
 */
function spawnHaloBurst(world: SimWorld, x: number, y: number): void {
  const scale = world.arena.rangeScale
  const radius = RULE_TUNING.haloBurst.radius * scale
  const growthRate = RULE_TUNING.haloBurst.growthRate * scale
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = HAZARD_BLAST
  Hazard.radius[eid] = 6
  Hazard.maxRadius[eid] = radius
  Hazard.growthRate[eid] = growthRate
  Lifetime.remaining[eid] = (radius / growthRate) * 1000 + RULE_TUNING.haloBurst.lingerMs
}
```

Changer la signature :

```ts
export function collisionSystem(world: SimWorld, stats: RunStats): SimWorld {
```

Et, dans la branche Halo, ajouter la pose de la zone **avant** l'émission de l'événement :

```ts
    if (hasComponent(world, Halo, player)) {
      removeComponent(world, Halo, player)
      addComponent(world, Doomed, eid)
      grantInvulnerability(world, player, HALO_BREAK_GRACE_MS)
      if (stats.rules.has('haloBurst')) {
        spawnHaloBurst(world, px, py)
      }
      world.events.push({ type: 'haloBroken', x: px, y: py })
      return world
    }
```

- [ ] **Étape 5 : mettre l'appelant à jour**

Dans `sim/step.ts`, ligne 81, remplacer :

```ts
  collisionSystem(world)
```

par :

```ts
  collisionSystem(world, stats)
```

C'est le patron de ses voisins immédiats dans l'ordre des systèmes — `tracingSystem(world, stats)`, `freezeSystem(world, stats)`, `dashKillSystem(world, stats)` — et l'ordre lui-même ne change pas.

- [ ] **Étape 6 : lancer les tests pour les voir passer**

```bash
cd front && npx vitest run ../sim/systems/collision.test.ts
```

Attendu : SUCCÈS, y compris le test existant du Halo, qui doit continuer de passer inchangé.

- [ ] **Étape 7 : régénérer l'empreinte et lancer la suite complète**

```bash
cd front && npm run typecheck && npm run version:sim && npm test
```

Attendu : tout vert.

`sim/determinism.test.ts` ne devrait **pas** bouger : sa run de référence ne prend aucune carte, donc `stats.rules` y reste vide et la branche n'est jamais empruntée. S'il échoue malgré tout, **ne pas régénérer l'empreinte** — s'arrêter et instruire, c'est le signe que la règle fuite là où elle ne devrait pas.

- [ ] **Étape 8 : vérifier le style sur les fichiers touchés**

```bash
cd front && npx biome check ../sim/systems/collision.ts ../sim/systems/collision.test.ts ../sim/step.ts ../sim/version.generated.ts
```

Attendu : `No fixes applied.` sans erreur.

- [ ] **Étape 9 : commiter**

```bash
git add sim/systems/collision.ts sim/systems/collision.test.ts sim/step.ts sim/version.generated.ts
git commit -m "feat(sim): l'onde de rupture du halo brise"
```

---

## Vérification finale

- [ ] `cd front && npm test` — toute la suite au vert.
- [ ] `cd front && npm run typecheck` — aucun diagnostic.
- [ ] `git log --oneline -2` — deux commits, locaux, non poussés.
- [ ] En jeu (facultatif mais souhaitable) : ramasser un Halo, se faire toucher au milieu d'une grappe, et vérifier que l'explosion emporte les voisins. Le rendu est déjà en place — l'onde de choc de 200 px et l'explosion `HAZARD_BLAST` se superposent, c'est attendu et documenté au §5 de la spec.
