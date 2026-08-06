# Le calque dessine son trait, et une carte inerte cesse d'être offerte

## 1. Intention

Deux constats de jeu, sans rapport l'un avec l'autre mais livrés ensemble parce qu'ils
touchent le même sac de cartes.

**« Papier assoiffé » est encore tirée, et elle ne fait rien.** Le Buvard est dans
`POWERUP_DISABLED` depuis le découpage du dépôt, mais sa carte `blotter-radius` est
toujours dans `UPGRADES` et multiplie `stats.blotterRadius`, une valeur que plus aucun
système en jeu ne lit. Le garde `requires` devrait la rendre invisible ; il cède au
mauvais moment. **Mesure : sur 1000 graines, 220 offrent la carte à la vague 1**, quand
aucune pastille n'a encore été ramassée. Une carte sur trois qui ne change rien.

**« Papier calque » ne monte pas avec la run.** Le calque est un disque de 14 px : il tue
un Point (rayon 7) dans 21 px, soit une bille de 42 px de large qui balaie l'arène à la
vitesse du joueur. C'est la même bille à la vague 15 qu'à la vague 3, alors que les deux
autres mythiques croissent avec la partie — « Double trait » double un sac qui grossit,
« Le papier boit » enchaîne sur des grappes qui se densifient. Le défaut n'est donc pas le
rayon : c'est qu'**une puissance constante décroche dans une arène qui se remplit**.
Doubler le rayon ne ferait que déplacer la vague du décrochage.

## 2. Ce qui gouverne la partie 1

Le garde `requires` est une règle de **saveur** — « on ne t'améliore pas un power-up que tu
n'as jamais tenu » — et `requiresGateHolds` le fait céder quand il affame l'offre au point
de la dénaturer. Ce relâchement est correct et reste en place.

Ce qui ne l'est pas : un genre **désactivé** n'est pas de la saveur. Sa carte est
**inerte**. Une offre remplie par deux cartes réelles vaut mieux qu'une offre de trois
dont une ne fait rien, et le garde relâché n'a aucune raison de la laisser passer.

La propriété que `POWERUP_DISABLED` revendique doit survivre intacte : **retirer une ligne
remet le genre et ses cartes en jeu**, sans autre geste. C'est ce qui exclut de supprimer
la carte.

## 3. Le garde des genres désactivés

Dans `isEligible` (`sim/upgrades/draw.ts`), un rejet **avant** la branche `applyRequires`,
et non dedans :

```ts
if (card.requires && POWERUP_DISABLED.has(card.requires)) {
  return false
}
```

**Test** (`sim/upgrades/draw.test.ts`) : `seenPowerups` vide à la vague 1 — donc garde
relâché — sur un lot de graines, aucune carte tirée n'a de `requires` dans
`POWERUP_DISABLED`. La condition est dérivée de l'ensemble et **jamais écrite en dur sur
`'blotter'`** : le prochain genre mis en pause hérite du test sans qu'on y pense.

### 3.1 Le nom qui deviendra faux

« Papier assoiffé » (`blotter-radius`) et « Le papier boit » (`thirsty-paper`) disent la
même chose. Tant que le Buvard dort, personne ne les voit ensemble ; le jour où il revient,
les deux peuvent sortir dans la même main.

`blotter-radius` est renommée maintenant, pendant que c'est gratuit : **« Buvard large »**
/ *« Wide Blotter »*. Elle nomme alors le power-up qu'elle améliore, comme « Longue
ronce », « Plume large » et « Bavure tenace ».

**Seules les quatre chaînes i18n bougent.** L'identifiant `blotter-radius` reste : il
nomme déjà exactement l'effet, les clés i18n en sont dérivées (`upgrade.<id>.name`), et le
changer ferait bouger clés, tests et fixtures pour rien. Aucune donnée persistée n'en
dépend, du reste — un replay enregistre `{step, index}`, un indice dans les cartes
proposées, jamais un identifiant, et `ownedIds` ne survit pas à la partie.

## 4. Le calque peint son trait

**Le fantôme cesse d'être un point : il laisse derrière lui une trace d'encre mortelle.**
Ton trajet d'il y a 2,5 s n'est plus une bille qui te suit, c'est un **trait dessiné**. Le
nom devient littéral — un calque reproduit le trait, pas le point — et la promesse que la
carte porte depuis sa première spec (« repasser deux fois au même endroit y concentre la
mort ») est enfin payée : boucler sur soi ferme un lasso.

`RULE_TUNING.tracingPaper` gagne trois valeurs :

| réglage | valeur | raison |
| --- | --- | --- |
| `trailStepPx` | 10 | une tache tous les 10 px **de trajet**, pas toutes les N ms |
| `trailRadius` | 13 | juste sous la tête (14) : le ruban est le trait, la tête reste le point vif |
| `trailLifeMs` | 800 | à 240 px/s → un ruban de ~192 × 26 px, ~20 taches vivantes |

**Repère d'honnêteté** : le ruban de Bavure fait 330 × 40 px et c'est une carte *commune*.
Celui du calque reste plus petit, et c'est voulu — celui de la Bavure vit 6,5 s par
pastille, celui du calque vit **toute la run**. `trailLifeMs` est le seul levier à bouger
en playtest ; `trailStepPx` et `trailRadius` tiennent l'étanchéité et se déplacent
ensemble ou pas du tout.

### 4.1 La cadence est en pixels, pas en millisecondes

La Bavure sème au temps (`trailIntervalMs: 45`) parce que sa vitesse est constante : chez
elle, temps et distance sont la même grandeur. Le calque rejoue le **joueur**, dont la
vitesse varie — `moveSpeed` monte de 12 % par « Pas léger » cumulable, et tombe à zéro
quand on s'arrête. Une cadence au temps empilerait un tas de taches sur un pixel à l'arrêt,
et ouvrirait des trous en pleine course.

Le calque accumule donc le **déplacement** du fantôme, et émet
`while (stepAccPx >= trailStepPx)` en **interpolant le point sur le segment** parcouru
dans le pas. Trois conséquences, qui valent la légère complication :

- **Étanche par construction, à toute vitesse.** L'espacement vaut exactement
  `trailStepPx` (10 px), contre `2 × trailRadius` (26 px) couverts par deux taches
  voisines. Le raisonnement en triangle rectangle qu'exige la Bavure — parce que son
  accumulateur ne peut se vider qu'une fois par pas, donc que son espacement réel dépasse
  sa cadence nominale — n'a pas d'équivalent ici : la boucle `while` vide l'accumulateur
  autant de fois qu'il le faut dans le même pas.
- **Joueur immobile, aucune tache.** Le fantôme ne se déplace pas, l'accumulateur
  n'avance pas.
- **Synergie propre avec « Pas léger ».** Aller plus vite allonge le ruban ; la densité ne
  bouge pas. Le nombre d'entités reste borné par `trailLifeMs × vitesse ÷ trailStepPx`,
  soit ~20 à la vitesse de base et ~27 avec trois « Pas léger ».

### 4.2 Pas de tremblé, contrairement à la Bavure

La Bavure tire son rayon dans une fourchette et décale ses taches perpendiculairement à
son cap : c'est l'irrégularité d'une éclaboussure. **Le calque n'en veut pas** — rayon
constant, espacement exact, **aucun tirage `world.rng`**.

Une bavure est une salissure, un calque est une copie propre. L'irrégularité vient déjà de
la main du joueur, et le rendu donne à chaque tache sa forme de blob depuis sa position
(`blobAt(x, y)`), donc deux taches voisines ne se déforment pas à l'unisson de toute façon.
Ne pas consommer de hasard supplémentaire est le bénéfice secondaire, pas la raison.

### 4.3 Ce que le code touche

- **`sim/components/index.ts`** — `Tracing` cesse d'être un marqueur vide et gagne
  `stepAccPx: Types.f32`. L'accumulateur vit sur l'entité, comme `Ricochet.wakeAccMs`.
- **`sim/systems/tracing.ts`** — `spawnGhost` remet `stepAccPx` à zéro **explicitement** :
  bitECS recycle les emplacements d'entités, et un reliquat du calque d'une partie
  précédente décalerait la première tache. C'est le même piège que celui déjà commenté
  pour `PrevPosition` à la naissance. L'émission se fait après le déplacement du fantôme,
  le long du segment `PrevPosition → Position` ; rien à l'image de naissance, où il n'y a
  pas encore de segment.
- **`sim/data/powerups.ts`** — les trois réglages, et le commentaire de `HAZARD_INK_TRAIL`
  qui nomme déjà la Bavure et « Le papier boit » gagne son troisième semeur.
- **Rendu : rien.** `HAZARD_INK_TRAIL` sait déjà se dessiner, se diluer et sécher, et son
  commentaire dit explicitement que la vue n'a pas à savoir qui l'a semé.
- **`sim/version.generated.ts`** — `npm run version:sim` depuis `front/`. Sans ça
  `version.test.ts` rougit, et un replay enregistré sous l'ancienne empreinte serait
  rejoué sous une simulation différente : le score rendu serait faux.

`sim/math.golden.json` **ne bouge pas** : la fixture ne couvre que `sim/math.ts`, que ce
lot ne touche pas.

### 4.4 Ce qui reste volontairement en dehors

Le rayon du calque reste **non mis à l'échelle par `rangeScale`**, comme aujourd'hui et
comme `thirstyPaper`. `trailRadius` et `trailStepPx` suivent la même règle que la tête
qu'ils prolongent : un ruban à l'échelle derrière une tête qui n'y est pas serait la pire
des deux réponses. Le commentaire de `haloBurst` pose déjà la question ouverte de savoir
si cette absence est un choix ou un oubli ; ce n'est pas cette carte-ci qui la tranche.

## 5. Tests

**`sim/systems/tracing.test.ts`**

- Un fantôme qui se déplace sème des zones de genre `HAZARD_INK_TRAIL`.
- Un joueur immobile n'en sème aucune.
- Un pas qui déplace le fantôme de 45 px pose **4 taches réparties sur le segment**, pas
  une seule : c'est la boucle `while` et l'interpolation qui sont sous test, et c'est le
  seul endroit où un accumulateur naïf passerait inaperçu à vitesse normale.
- Étanchéité redérivée des constantes : `trailStepPx < 2 × trailRadius`. Le test échoue
  si l'un des deux bouge sans l'autre.
- Le ruban meurt (`Lifetime`), la tête non — la seule zone du jeu sans `Lifetime` le
  reste.

**`front/src/render/views/hazard.test.ts`**

- `inkTrailWetness(RULE_TUNING.tracingPaper.trailLifeMs) === 1` : la tache naît humide,
  comme celle de la Bavure. Tient tant que `trailLifeMs` (800) reste au-dessus
  d'`INK_TRAIL_DRY_MS` (700) ; sous ce seuil, le ruban naîtrait déjà à demi sec.

**`sim/upgrades/draw.test.ts`** — voir §3.

## 6. Ce qu'il faudra regarder en jeu

Le calque **ne menace jamais le joueur** : `hazardSystem` n'applique `Doomed` qu'aux
entités `Enemy`, et aucune zone ne touche le joueur. Renforcer cette carte est donc du gain
pur, sans contrepartie mécanique — la seule contrainte qui reste est celle de la main : il
faut savoir tourner pour concentrer le trait, et se souvenir d'un trajet vieux de 2,5 s.

C'est ce qui fait de `trailLifeMs` le chiffre à surveiller. Un ruban trop tenace
transformerait une boucle serrée en enclos permanent, et la carte cesserait de demander
quoi que ce soit au joueur.
