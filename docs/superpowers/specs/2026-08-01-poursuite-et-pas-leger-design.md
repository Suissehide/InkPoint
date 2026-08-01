# La poursuite du curseur, et la carte qui ne faisait rien

## 1. Deux défauts trouvés en jouant

1. **La carte « Pas léger » est inerte.** Elle annonce « +12 % de vitesse de déplacement »,
   multiplie `stats.moveSpeed`, et **personne ne lit jamais ce champ**. Le joueur ne va pas plus
   vite. C'est le cas depuis la création de la carte.
2. **Le point dérive quand le curseur tourne au dernier moment.** Le freinage livré coupe toute
   l'entrée pendant l'approche, et la friction décélère alors le long de la **vitesse courante**,
   jamais vers la cible. Pendant les ~90 ms de glisse, le point n'est plus piloté du tout : un
   curseur qui bouge à ce moment-là laisse une vingtaine de pixels d'écart.

Les deux sont indépendants et tiennent dans une même spec parce qu'ils touchent le même
domaine — la vitesse du joueur.

## 2. « Pas léger » enfin branchée

### 2.1 Le constat

`moveSpeed` existe à exactement trois endroits : déclaré (`src/sim/upgrades/stats.ts`),
initialisé à 240, et multiplié par 1,12 par la carte (`src/sim/data/upgrades.ts`). Aucun
lecteur. `Movement.maxSpeed` est posé une fois au spawn depuis `PLAYER_SPEED` et n'est plus
jamais touché.

### 2.2 Ce qui change

`stepWorld` reçoit déjà `stats`. Il y synchronise la vitesse maximale du joueur avant que les
systèmes ne tournent :

```
Movement.maxSpeed[world.playerEid] = stats.moveSpeed
```

Le composant reste **la seule source de vérité** — les ennemis s'en servent aussi, et deux
sources concurrentes pour la même grandeur seraient un piège. Une carte choisie entre deux
vagues prend effet au pas suivant, sans traitement particulier.

### 2.3 Ce que ça implique ailleurs

La distance d'arrêt du §3 dépend de la vitesse réelle, jamais de la vitesse maximale : elle
reste exacte quelle que soit la valeur de `moveSpeed`. La carte peut donc être empilée sans
casser la poursuite.

**Un test doit verrouiller le lien.** Une carte qui multiplie une statistique que personne ne
lit est exactement le genre de silence que ce dépôt a déjà payé plusieurs fois : rien dans le
typecheck ni dans les tests ne le signalait.

## 3. La poursuite : viser une vitesse, pas une direction

### 3.1 Pourquoi la règle actuelle ne peut pas être rapiécée

`playerMovementSystem` n'applique la friction **que si l'entrée est nulle** ; toute entrée non
nulle la désactive entièrement. Freiner et diriger s'excluent donc dans le modèle actuel : la
règle livrée choisit de freiner, et perd le pilotage pendant toute la glisse. C'est la cause
exacte de la dérive.

L'arbitrage retenu : **on freine par l'entrée, en continuant de diriger.**

### 3.2 La règle

À chaque pas, on calcule la vitesse qu'on **voudrait** avoir, et on demande l'écart :

```
freinage         = √(2 · accel · distance)
vitesseSouhaitée = direction × min(maxSpeed, freinage)
écart            = vitesseSouhaitée − vitesseActuelle
entrée           = écart normalisé, d'intensité min(1, |écart| / (accel · dt))
```

Une seule formule couvre les trois régimes :

- **loin** — `freinage` dépasse `maxSpeed`, la vitesse souhaitée est plein régime vers la
  cible, l'entrée pousse à fond ;
- **près et lancé** — `freinage` plafonne la vitesse souhaitée sous la vitesse actuelle,
  l'écart pointe donc **à l'opposé de la vitesse** : le point freine ;
- **cible qui bouge** — la vitesse souhaitée change de direction, l'écart porte la correction
  latérale **pendant** le freinage. La fenêtre aveugle disparaît, parce qu'il n'y a plus de
  fenêtre.

Le plafond d'intensité `|écart| / (accel · dt)` évite de dépasser la vitesse souhaitée en un
pas : quand l'écart est plus petit que ce qu'une image d'accélération pleine fournit, on
demande moins que le maximum.

### 3.3 Ce qui disparaît

**`FULL_THROTTLE_RADIUS` et son atténuation.** L'atténuation linéaire sous 32 px était une
approximation grossière de ce que `√(2 · accel · distance)` fait exactement. Garder les deux
laisserait deux règles concurrentes sur la même grandeur.

**Le seuil de coupure et sa marge d'un pas.** Ils n'ont plus d'objet : rien n'est coupé.

### 3.4 Ce qui reste

**`DEAD_ZONE` (3 px)** : sous ce seuil l'entrée est nulle, la friction achève les derniers
pixels, et `Facing` fige son dernier cap au lieu de frémir. C'est aussi ce qui garantit
qu'aucun angle n'est calculé sur une distance nulle.

**La quantification au 1/128**, prérequis du netcode v3.

**La sortie reste un vecteur de manette.** `aimInput` gagne `accel` et `maxSpeed` dans son
`PlayerMotion` — la description complète du modèle de mouvement au lieu de la seule friction —
mais `InputState` ne change pas, et la simulation continue d'ignorer qu'une souris est
derrière.

### 3.5 Les conséquences à assumer

- **La distance d'arrêt passe de 10,8 à 14,4 px**, puisque c'est l'accélération (2000 px/s²) et
  non la friction (2667) qui freine désormais. Le point commence donc à ralentir plus tôt.
- **Le ressenti change à toutes les distances**, pas seulement près de la cible : l'atténuation
  de 32 px disparaît au profit d'une courbe en racine. C'est le vrai coût de ce choix, et il ne
  se juge qu'en jouant.
- **La friction n'agit plus que dans la zone morte.** Elle reste nécessaire — sans elle le
  point ne s'immobiliserait jamais tout à fait — mais elle cesse d'être le mécanisme principal
  d'arrêt.

## 4. Tests

Le test de convergence existant (`src/app/arrival.test.ts`) garde **ses assertions inchangées** :
atteindre la cible, ne jamais la dépasser, s'immobiliser. C'est ce que la nouvelle règle doit
continuer de tenir, et il ne doit être ni assoupli ni réécrit — s'il échoue, c'est la règle qui
est en cause, pas lui.

Seule sa **construction** du joueur change : `PlayerMotion` gagne `accel` et `maxSpeed`, qu'il
faut désormais lire depuis le composant `Movement` comme il lit déjà `friction`. C'est une
adaptation mécanique, pas un assouplissement.

**Le test qui manque, et que la revue finale réclamait :** la poursuite d'une **cible mobile**.
Tous les tests existants visent une cible fixe, ce qui est précisément pourquoi la dérive est
passée. Il fait bouger le curseur pendant l'approche, à plusieurs vitesses et selon plusieurs
trajectoires (ligne, virage sec, cercle), et vérifie deux propriétés :

1. **l'écart de suivi reste borné** — le point ne se laisse pas distancer au-delà d'un seuil ;
2. **aucune dérive ne s'accumule** — quand le curseur s'immobilise, le point le rejoint et s'y
   pose, au lieu de rester à côté.

Ce test doit **échouer sur la règle actuelle**, en particulier sur le virage sec, qui est le
geste décrit par le joueur. Sa démonstration d'échec fait partie du livrable.

Les tests unitaires d'`aimInput` sont adaptés à la nouvelle règle. Ceux qui affirmaient le
comportement de coupure (« coupe la poussée quand la distance restante suffit tout juste à
freiner ») décrivent un mécanisme qui disparaît : ils sont **remplacés** par leurs équivalents
sur la nouvelle règle — jamais supprimés sans contrepartie. Ceux qui affirment des propriétés
toujours vraies (visée en diagonale, zone morte, quantification, garde de friction nulle)
restent.

**Le test de vitesse maximale du §2.3** vérifie qu'appliquer « Pas léger » augmente
effectivement la vitesse du joueur dans le monde, et pas seulement dans ses statistiques.

## 5. Hors périmètre

- **Le mode clavier**, qui ne passe pas par `aimInput`.
- **Le modèle de friction de la simulation** : on ne le change pas. Le rendre permanent serait
  physiquement plus juste mais toucherait le clavier et la vitesse de pointe, donc
  l'équilibrage.
- **Les autres statistiques de `RunStats`** : seule `moveSpeed` est branchée ici. Si d'autres
  champs se révèlent inertes, ils feront l'objet de leur propre vérification.
