# L'arrivée du curseur : freiner au lieu d'osciller

## 1. Le problème, au pixel près

En mode souris, le point ne se pose pas sur le curseur : il le dépasse, revient, redépasse plus
faiblement. Ce n'est pas du bruit, c'est une oscillation amortie, et elle a une cause exacte.

`aimInput` (`src/app/mouse.ts`) produit une direction vers la cible dont l'intensité décroît
sous `FULL_THROTTLE_RADIUS` (32 px), mais **reste dirigée vers la cible** jusqu'à
`DEAD_ZONE` (3 px). Le point accélère donc encore quand il est presque arrivé.

Les chiffres du joueur (`src/sim/spawn.ts`) :

| | |
| --- | --- |
| Vitesse maximale | 240 px/s |
| Accélération | `240 / 0,12` = 2000 px/s² |
| Friction | `240 / 0,09` ≈ 2667 px/s² |
| **Distance d'arrêt à pleine vitesse** | `v² / (2·friction)` = **10,8 px** |

Il faut 10,8 px pour s'arrêter, et la poussée ne se coupe qu'à 3 px. Le dépassement d'environ
8 px qui en résulte est déjà admis par le commentaire de `FULL_THROTTLE_RADIUS` : « le point
dépasse donc le curseur d'environ 8 px avant de revenir s'y poser ». La zone morte n'annule
que l'**entrée**, jamais l'**élan** déjà acquis — c'est pour cela qu'élargir la zone morte ne
soigne que le symptôme.

## 2. La règle : couper la poussée à la distance d'arrêt

`aimInput` cesse de pousser dès que la distance restante devient inférieure à la distance
qu'il faudrait pour s'arrêter. La friction fait alors exactement le travail, et le point se
pose sur la cible à vitesse nulle. C'est le comportement dit « d'arrivée ».

```
approche       = max(0, vitesse · direction_vers_cible)
distanceArrêt  = approche² / (2 · friction)

si distance ≤ DEAD_ZONE       → entrée nulle        (inchangé)
si distance ≤ distanceArrêt   → entrée nulle        (la friction pose le point)
sinon                         → direction × intensité   (inchangé)
```

### 2.1 Pourquoi la projection, et pas la vitesse brute

La distance d'arrêt se calcule sur la **projection de la vitesse vers la cible**, jamais sur
sa norme. Un point qui dérive latéralement, ou qui s'éloigne, a une vitesse élevée mais une
vitesse d'approche faible ou nulle : lui couper la poussée le laisserait filer au lieu de le
rediriger. Le `max(0, …)` traite le cas de l'éloignement — approche négative, distance d'arrêt
nulle, poussée maintenue à plein.

### 2.2 Aucun recul

La règle ne produit jamais d'entrée dirigée à l'opposé de la cible. Freiner activement
gagnerait quelques millisecondes au prix d'un point qui recule visiblement — exactement le
symptôme qu'on supprime. Couper la poussée suffit, parce que la friction du joueur est
précisément la force qui définit la distance d'arrêt utilisée dans le calcul : les deux
s'annulent par construction.

### 2.3 Le cas de la friction nulle

`Movement.friction` vaut 0 pour les ennemis (`spawn.ts`). Le joueur en a toujours une, mais la
division doit être gardée : une friction nulle rend la distance d'arrêt infinie, donc la
poussée serait coupée en permanence et le point n'avancerait jamais. Friction nulle ou
négative ⇒ pas de freinage, comportement d'avant.

## 3. Où ça vit

`aimInput` reste une **fonction pure de `src/app/mouse.ts`**. Elle reçoit désormais la vélocité
et la friction du joueur en plus des deux positions.

Sa sortie ne change ni de forme ni de contrat : un vecteur de direction quantifié au 1/128,
c'est-à-dire une entrée de manette. La promesse du fichier est préservée — *la simulation ne
saura jamais qu'une souris est derrière* — et `InputState`, structure sensible au netcode v3,
n'est pas touchée.

`src/app/game.ts` lit déjà la position du joueur pour la transmettre (`playerPoint()`). Il
lira de la même façon `Velocity.x/y` et `Movement.friction`. Ce sont des lectures
supplémentaires du même ordre, sans écriture : la frontière « `src/app/` lit la simulation et
ne lui écrit jamais » tient.

**Rien ne change dans `src/sim/`.** La simulation n'apprend pas la notion d'« arrivé » ; elle
continue de recevoir un vecteur et de l'intégrer.

## 4. Ce qui ne change pas

- **`FULL_THROTTLE_RADIUS` (32 px)** et son atténuation restent : ils gouvernent l'approche
  fine au-dessus de la zone de freinage, là où le point doit ralentir sans être encore prêt à
  se poser.
- **`DEAD_ZONE` (3 px)** reste : elle garantit qu'aucun angle n'est calculé sur une distance
  nulle, et que `Facing` conserve son dernier cap au lieu de frémir.
- **La quantification au 1/128** reste, prérequis du netcode.
- **Le mode clavier** n'est pas concerné : il ne passe pas par `aimInput`.

## 5. Tests

**Six tests existants vont cesser de compiler**, et c'est attendu : `src/app/mouse.test.ts`
couvre déjà `aimInput` avec sa signature à deux arguments (plein régime au-delà du rayon,
décroissance à l'intérieur, zone morte, cible confondue avec le joueur, visée en diagonale,
quantification au 1/128). Ils doivent être **adaptés à la nouvelle signature**, jamais
supprimés ni désactivés : chacun garde une propriété qui reste vraie. Le plus simple est de
leur passer une vélocité nulle, cas où la distance d'arrêt vaut zéro et où le comportement est
par construction celui d'avant.

`aimInput` reste pure : les cas de la règle se testent directement.

| Ce qu'on vérifie | Pourquoi |
| --- | --- |
| Loin de la cible, l'entrée est inchangée par rapport à aujourd'hui | Le correctif ne doit rien changer hors de la zone d'arrivée |
| À l'arrêt, l'entrée pointe vers la cible à pleine intensité | Une distance d'arrêt nulle ne doit pas couper la poussée |
| Pile à la distance d'arrêt, l'entrée devient nulle | La frontière de la règle |
| En dérive latérale près de la cible, la poussée est maintenue | C'est ce que la projection protège (§2.1) |
| En éloignement, la poussée est maintenue à plein | Le `max(0, …)` |
| Friction nulle, la poussée est maintenue | Le garde de la division (§2.3) |
| L'entrée n'est jamais dirigée à l'opposé de la cible | Aucun recul (§2.2) |

**Le test qui compte est un test de convergence**, et c'est lui qui prouve la disparition du
jiggle. Il fait tourner la **vraie** boucle — `playerMovementSystem` puis `integrationSystem`,
avec `aimInput` rappelée à chaque pas comme le fait le jeu — depuis plusieurs distances et
vitesses initiales, et vérifie trois propriétés :

1. **le point atteint la cible** (distance finale sous la zone morte) ;
2. **il ne la dépasse jamais** : le signe de la distance projetée ne change pas de bout en
   bout — c'est la définition du dépassement, et le cœur du problème ;
3. **il s'immobilise** : la vitesse finale est quasi nulle, et la position ne bouge plus.

Ce test doit **échouer sur le code actuel**. C'est la condition qui le rend utile : un test de
convergence qui passerait avant le correctif ne prouverait rien. La démonstration de son échec
initial fait partie du livrable.

## 6. Hors périmètre

- **Le mode clavier**, qui ne passe pas par `aimInput`.
- **Le réticule** (`src/render/views/reticle.ts`), qui affiche la cible et n'entre pas dans le
  calcul du mouvement.
- **La valeur de `FULL_THROTTLE_RADIUS`** : le jiggle ne vient pas d'elle, et la retoucher
  changerait le ressenti de l'approche moyenne distance sans nécessité.
