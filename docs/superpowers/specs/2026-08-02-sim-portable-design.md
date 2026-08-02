# Simulation portable — arithmétique déterministe entre moteurs

Étapes 0 et 1 du chantier décrit dans `2026-08-02-leaderboard-architecture-design.md`.

## 1. Intention

Le leaderboard v2 repose sur une promesse : le serveur rejoue la partie et recalcule le
score lui-même, sans jamais croire le client. Cette promesse suppose qu'une même suite
d'entrées produise le **même état au bit près** sur la machine du joueur et sur le serveur.

La simulation ne l'offre pas encore. Elle est déterministe sur une même machine — c'est ce
que vérifie `determinism.test.ts` — mais elle appelle des fonctions dont la spec ECMAScript
ne définit pas le résultat exact :

| Fonction | Appels | Statut |
| --- | --- | --- |
| `Math.sin`, `Math.cos` | 14 + 14 | Approximation laissée au moteur |
| `Math.hypot` | 9 | Approximation laissée au moteur |
| `Math.atan2` | 8 | Approximation laissée au moteur |
| `Math.exp` | 1 | Approximation laissée au moteur |
| `Math.sqrt`, `Math.imul` | 2 + 2 | **Exacts**, imposés par IEEE-754 |
| `min`, `max`, `floor`, `ceil`, `round` | 54 | **Exacts** |

Une différence d'un ULP suffit. Dans un système chaotique, elle décide au bout de quelques
milliers de pas qui est vivant et qui ne l'est pas ; aucune tolérance sur le score final ne
rattrape cela. Sans cette étape, un joueur sous Firefox ou Safari verrait ses scores
rejetés sans avoir triché, et une mise à jour de Node invaliderait l'historique.

L'étape sert deux fois : le rejeu de vérification en v2, et le rollback netcode annoncé en
v3, qui exige exactement la même garantie.

**Hors périmètre.** Aucun enregistrement de replay, aucun backend, aucune UI — ce sont les
étapes 2 et 3. Aucun changement d'équilibrage volontaire — les déplacements numériques
qu'induit malgré tout la migration sont décrits au §8. `src/app` et `src/render` restent
libres d'appeler `Math.*` : seule la simulation doit être portable, puisque le replay
enregistrera les *entrées* de la simulation, pas la façon dont elles ont été calculées.

## 2. Étape 0 — restructuration du dépôt

Déplacement mécanique, **livré seul, dans son propre commit**, avant toute modification de
comportement. Déplacer du code et le modifier dans le même changement rendrait illisible
la revue de l'un comme de l'autre.

| De | Vers |
| --- | --- |
| `src/sim/` | `sim/` |
| `src/` (le reste), `index.html`, `public/`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `package.json` | `front/` |
| — | `back/` (vide à ce stade) |
| `biome.json`, `.husky/`, `commitlint.config.js`, `deploy/`, `docs/` | inchangés, à la racine |

Points d'attention :

- **Alias.** `@` continue de pointer vers `front/src`, un nouvel alias `@sim` pointe vers
  `sim/`. Déclaré dans `front/vite.config.ts`, `front/vitest.config.ts` et les `tsconfig`
  des deux paquets. Tous les `@/sim/...` du code deviennent `@sim/...`.
- **`bitecs`** devient une dépendance de `front` et, plus tard, de `back`.
- **Biome** reste à la racine, avec `files.includes` étendu à
  `["front/src/**", "back/src/**", "sim/**"]`. Un fichier partagé ne peut pas dépendre de
  deux configurations concurrentes, et Biome remonte l'arborescence pour trouver la sienne,
  donc `npm run lint` fonctionne depuis n'importe quel paquet.
- **Vitest.** `front` exécute ses tests *et* ceux de `sim` :
  `include: ['src/**/*.test.ts', '../sim/**/*.test.ts']`. `sim` n'a pas de `package.json`,
  donc pas de lanceur propre, et `front` est le paquet qui en dépend aujourd'hui.
- **`purity.test.ts`** parcourt son propre dossier via `readdirSync` sur
  `new URL('.', import.meta.url)` : il suit le déplacement sans modification.
- **Dockerfile.** Le contexte de build est déjà la racine (`context: ..` dans
  `deploy/compose.yaml`), donc `sim/` est visible. Les chemins passent à
  `COPY front/package*.json ./front/`, `COPY sim ./sim`, `COPY front ./front`, et le build
  s'exécute dans `/app/front`.
- **husky.** Le hook reste à la racine ; le `prepare` migre vers `front/package.json` sous
  la forme `git config core.hooksPath .husky || true`, comme dans Gachapon.
- **`ci.yml`.** Les chemins changent, et on corrige au passage un défaut existant : le
  workflow se déclenche sur `push: branches: [master]` alors que la branche est `main`.
  Aujourd'hui seul `pull_request` fonctionne.

**Critère d'acceptation.** Depuis `front/`, `npm test`, `npm run lint`, `npm run typecheck`
et `npm run build` passent ; `docker build` passe ; et l'empreinte produite par
`determinism.test.ts` est **identique** à celle d'avant le déplacement. Cette dernière
condition est la preuve que rien n'a bougé sémantiquement.

## 3. Le hitstop entre dans la simulation

`world.timeScale` est aujourd'hui écrit **hors de la simulation**, par `game.ts:330` :

```ts
run.world.timeScale = timeScaleFor(juice, FIXED_DT)
stepWorld(run.world, run.stats)
```

et les vingt systèmes de `stepWorld` multiplient tous leur `dt` par lui. La machine à états
du hitstop — `hitstopRemaining`, `hitstopCooldownRemaining`, `HITSTOP_MS = 60`,
`HITSTOP_CADENCE_MS = 200` — vit donc dans `src/app/juice.ts`, hors du test de pureté et
hors des tests de déterminisme.

Elle est pourtant déterministe : le déclenchement ne dépend que de `kills > 0` lu dans
`world.events`, les deux compteurs décroissent de `FIXED_DT` et non du temps réel,
`applyJuice` tourne dans `onStep` et non `onRender`, et le déclenchement est bien à
l'extérieur du garde `motionEnabled`. Ni la fréquence d'images ni le réglage
d'accessibilité n'entrent en jeu.

Mais tant qu'elle vit dans `src/app`, un test inter-moteurs qui laisse `timeScale` à 1 ne
prouve rien sur les vraies parties, et l'étape 2 devrait enregistrer `timeScale` à chaque
pas. On la déplace donc dans la simulation :

- `SimWorld` gagne `hitstopRemaining` et `hitstopCooldownRemaining`, initialisés à 0 par
  `createWorld`.
- Un `hitstopSystem` dans `sim/systems/hitstop.ts` porte les deux constantes, décrémente
  les compteurs, déclenche sur les kills et écrit `world.timeScale`.
- `juice.ts` perd ces deux champs, `timeScaleFor` et le bloc de déclenchement ;
  `resetJuiceState` n'a plus de hitstop à remettre à zéro (`createWorld` s'en charge).
  `applyJuice` ne garde que la présentation : caméra, particules, `punch`.
- `game.ts` perd sa ligne d'affectation de `timeScale`.

**La subtilité à respecter à l'identique** : aujourd'hui `timeScale` est calculé *avant*
`stepWorld`, donc à partir des événements du pas **précédent**. Or `stepWorld` commence par
`world.events.length = 0`. Le `hitstopSystem` doit donc s'exécuter tout au début de
`stepWorld`, **avant** cette remise à zéro, en lisant les événements du pas précédent. Placé
après, le hitstop gagnerait un pas d'avance et l'équilibrage se déplacerait.

Les tests de hitstop de `front/src/app/juice.test.ts` (lignes ~48 et ~234) migrent vers un
`sim/systems/hitstop.test.ts`.

**Critère d'acceptation.** L'empreinte de `determinism.test.ts` est inchangée : c'est un
déplacement pur, le décalage d'un pas est préservé.

## 4. `sim/math.ts`

```ts
export const PI: number
export const TAU: number
export const HALF_PI: number
export function sin(x: number): number
export function cos(x: number): number
export function atan2(y: number, x: number): number
export function exp(x: number): number
export function hypot(x: number, y: number): number
export function wrapAngle(a: number): number   // repli dans (-π, π]
```

Le module n'utilise que `+`, `-`, `*`, `/`, `Math.sqrt`, `Math.floor`, `Math.round` et
`Math.abs`. Tous sont exactement spécifiés par IEEE-754 en arrondi au plus proche pair, et
la spec JavaScript interdit la contraction en FMA. La portabilité vient donc de la
construction, pas de la chance : deux moteurs conformes ne peuvent pas produire des
résultats différents.

| Fonction | Méthode |
| --- | --- |
| `sin`, `cos` | Réduction de Cody-Waite (π/2 scindé en parties haute et basse, pour que la soustraction reste exacte), puis polynôme minimax sur [-π/4, π/4] |
| `atan2` | Sélection de quadrant par comparaisons, puis `atan` sur [0, 1] par polynôme impair, le rapport `y/x` étant ramené dans l'intervalle par échange des arguments |
| `exp` | `2^k · poly(r)` avec `k = round(x / ln 2)` et `r = x − k·ln2` en double-double ; l'exponentiation par 2^k est exacte (`Math.pow` interdit, on passe par un `DataView` sur l'exposant) |
| `hypot` | `sqrt(x*x + y*y)` — exact. La protection contre l'over/underflow qu'offre `Math.hypot` n'a pas d'objet à l'échelle d'une arène de 1280 × 720 |
| `wrapAngle` | `a − TAU · round(a / TAU)` — arithmétique exacte, aucun transcendant |

Cible de précision : **moins d'un ULP** face à `Math.*`, testée avec tolérance. Les
résultats atterrissent de toute façon dans des composants `Types.f32`, dont la grille est
huit ordres de grandeur au-dessus de cette erreur.

**Domaine de validité.** La réduction de Cody-Waite à deux termes perd sa précision pour
les grands arguments. `Facing.angle` est accumulé sans repli (`seeker.ts:217`,
`player-movement.ts:111`) et pourrait dériver loin. On lui applique donc `wrapAngle` à
chaque écriture, ce qui borne le domaine à (-π, π] et rend la question sans objet. C'est
un déplacement de valeur assumé : `cos(θ)` et `cos(θ − 2πk)` ne sont pas bit-identiques.

## 5. Migration des appelants

Deux réécritures suppriment des appels au lieu de les remplacer :

- **`Math.hypot(dx, dy)` → `sqrt(dx*dx + dy*dy)`**, partout. Les 9 appels disparaissent.
  Les deux formules ne donnent pas le même résultat — `Math.hypot` est plus précis — donc
  les valeurs se déplacent légèrement. Accepté.
- **`seeker.ts:216`**, `Math.atan2(Math.sin(raw), Math.cos(raw))`, est l'idiome de repli
  d'angle dans (-π, π]. Il devient `wrapAngle(raw)` : trois appels transcendants en moins,
  et un résultat exact plutôt qu'approché.

Restent à basculer sur `@sim/math` :

| Fichier | Appels |
| --- | --- |
| `sim/systems/seeker.ts` | 3 `atan2`, 1 `sin`, 1 `cos` (après retrait de l'idiome) |
| `sim/systems/waves.ts` | 3 `sin`, 3 `cos` |
| `sim/data/formations.ts` | 2 `sin`, 2 `cos`, 1 `atan2` |
| `sim/systems/death.ts` | 2 `sin`, 2 `cos` |
| `sim/powerups/activate.ts` | 2 `sin`, 2 `cos` |
| `sim/systems/ricochet.ts` | 1 `sin`, 1 `cos`, 1 `atan2`, 1 `hypot` |
| `sim/systems/formation.ts` | 1 `sin`, 1 `cos`, 1 `hypot` |
| `sim/systems/bramble.ts` | 1 `sin`, 1 `cos` |
| `sim/systems/player-movement.ts` | 1 `atan2`, 3 `hypot` |
| `sim/systems/dash-wake.ts` | 1 `atan2` |
| `sim/systems/homing.ts` | 2 `hypot` |
| `sim/systems/shard.ts` | 2 `hypot` |
| `sim/data/difficulty.ts` | 1 `exp` |

## 6. Verrou

`purity.test.ts` existe parce que Biome n'a pas d'équivalent de
`no-restricted-properties` : les règles de lint travaillent sur l'AST et ratent
`Math['sin']` comme la déstructuration. Le scan textuel attrape tout cela. On lui ajoute
une famille d'interdits, sur le modèle de celui qui protège déjà `Math.random` :

- Interdits dans `sim/` : `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `exp`,
  `log`, `log2`, `log10`, `pow`, `hypot`, `cbrt`, `sinh`, `cosh`, `tanh`, `expm1`, `log1p`,
  `fround`, `**` (l'opérateur d'exponentiation, qui est `Math.pow` déguisé). Message :
  « utiliser `sim/math.ts` ».
- Toujours autorisés : `min`, `max`, `floor`, `ceil`, `round`, `trunc`, `abs`, `sign`,
  `sqrt`, `imul`, `PI`.
- Seule exemption : `sim/math.ts` lui-même. Les fichiers `*.test.ts` sont déjà exclus du
  scan, ce qui laisse `math.test.ts` comparer librement à `Math.*`.

## 7. Preuve de portabilité

C'est la prémisse entière du leaderboard : si elle casse en silence, le serveur rejette des
joueurs honnêtes sans que personne ne le voie. Elle est donc vérifiée empiriquement, en CI.

**`sim/math.golden.test.ts`.** Une fixture committée de couples entrée → motif binaire f64
exact, lue via `DataView.getBigUint64`. Elle est produite par un script
`sim/scripts/gen-golden.ts` et couvre, pour chaque fonction, les valeurs remarquables
(0, ±π/4, ±π/2, ±π, dénormaux, très grands arguments) et un échantillon pseudo-aléatoire à
graine fixe. Un moteur qui dévie d'un seul bit échoue.

**`determinism.test.ts` — troisième test.** Le fichier compare aujourd'hui deux runs du
même processus, ce qui ne dit rien d'un autre moteur. On lui ajoute une empreinte figée en
constante. Deux corrections nécessaires :

- L'empreinte actuelle est construite avec `toFixed(3)`, ce qui **absorbe précisément les
  divergences d'un ULP** que l'on cherche à détecter. La version inter-moteurs sérialise
  les motifs binaires exacts des `Float32Array` de composants.
- La run scriptée doit provoquer des kills, pour que le hitstop se déclenche et que
  `timeScale` passe réellement à 0. Sinon le test ne couvre pas le chemin ajouté au §3.

**`front/vitest.browser.config.ts`.** Vitest en mode navigateur via Playwright, rejouant
**ces deux fichiers uniquement** dans Chromium, Firefox et WebKit — pas toute la suite, pour
que le job reste court. Nouveau job `cross-engine` dans `ci.yml`, dépendant de `check`, avec
`npx playwright install --with-deps`.

## 8. Conséquences assumées

Toutes les valeurs de gameplay se déplacent légèrement : `hypot` → `sqrt` change déjà le
dernier bit, les polynômes aussi, et le repli de `Facing.angle` également. Les tests qui
figent des positions attendues échoueront et seront **mis à jour dans le commit de
migration**, plutôt que contorsionnés pour préserver les anciennes valeurs. L'empreinte de
`determinism.test.ts` est régénérée à la même occasion — c'est le seul commit du chantier
où elle a le droit de bouger, les §2 et §3 devant la laisser intacte.

Rien ne devrait être perceptible en jouant. Une partie complète sera jouée avant de clore.

## 9. Ce que cette étape ne garantit pas

- **Pas la portabilité des entrées.** `front/src/app/mouse.ts` calcule la direction avec
  `Math.hypot`. C'est sans conséquence : le replay enregistrera `world.input` après calcul
  et quantification, pas la façon dont il a été obtenu.
- **Pas la stabilité entre versions de la simulation.** Tout changement d'équilibrage ou de
  système invalide les replays antérieurs. D'où l'empreinte de version dans l'en-tête de
  replay et le classement versionné, traités à l'étape 3.
- **Pas l'indépendance à l'état de module de bitECS.** Les `eid` sont alloués depuis un
  compteur global au module, comme `determinism.test.ts` le documente déjà. Chaque rejeu de
  vérification devra partir d'un état neuf — `resetGlobals()` ou un worker par job.
  Contrainte pour l'étape 3, pas un défaut à corriger ici.

## 10. Questions ouvertes

- Le degré des polynômes minimax reste à fixer à l'écriture, en visant le plus petit degré
  qui tienne la cible d'un ULP sur le domaine réduit.
- WebKit sous Linux dans la CI GitHub est un moteur légèrement différent de Safari sur
  macOS. Si un écart apparaît, il faudra décider si un test manuel sur un vrai Safari
  s'impose avant la mise en ligne de l'étape 3.
