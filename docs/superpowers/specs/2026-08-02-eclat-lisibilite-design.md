# Ink Point — L'Éclat se voit, et sa charge s'annonce

**Date :** 2026-08-02
**Statut :** validé, prêt pour le plan d'implémentation
**Portée :** apparence propre à l'Éclat, et rendu de son télégraphe et de sa charge

---

## 1. Contexte

L'Éclat est le seul ennemi plus rapide que le joueur. Son fonctionnement, posé par la
spec du 2026-07-28 §3.6, tient en trois états portés par `Dasher` : il approche en
poursuite normale (état 0), se fige et se télégraphie 500 ms (état 1), puis charge
900 ms en ligne droite à 420 px/s sans corriger sa trajectoire (état 2). Le
commentaire de `sim/systems/shard.ts` le dit sans détour : « sa lisibilité repose
entièrement sur le télégraphe ».

**Ce télégraphe n'est dessiné nulle part.** Aucun fichier de `src/render/` ne lit
`Dasher` — le composant n'est consulté que par `shard.ts` et par `hazards.ts`, qui
s'en sert pour exempter les chargeurs du recul et du vortex. À l'écran, l'Éclat
s'arrête une demi-seconde sans rien signaler, puis part à 420 px/s.

**Et rien ne le distingue d'un Point.** `views/enemy.ts` dessine tous les ennemis de
la même façon : un disque `INK.danger`, un liseré intérieur `INK.paper`, la seule
variable étant le rayon du collider. Le Blot s'en sort avec ses 14 px, mais l'Éclat
en fait 6 contre 7 pour le Point : la différence n'est pas perceptible en jeu.

Le joueur ne peut donc ni savoir lequel de ces disques va lui foncer dessus, ni voir
qu'il est en train de le faire.

### Objectifs

1. **Donner une apparence propre à l'Éclat**, reconnaissable en permanence.
2. **Rendre le télégraphe visible**, en disant à la fois *quand* la charge part et
   *où* elle va.
3. **Faire sentir la charge** elle-même.

### Principe directeur

Celui de la spec du 2026-07-30 §1, inchangé : **ce qui est affiché est ce qui tue.**
Le disque de rayon 6 est la hitbox ; rien de ce qui est ajouté ne doit modifier cette
silhouette. Les éléments qui ne tuent pas se dessinent en pointillé, comme le contour
d'apparition dont `enemy.ts` documente déjà la convention — « pointillé = inoffensif,
plein = mortel ».

### Hors périmètre

- **Aucun changement dans `src/sim/`.** Les trois états, leurs durées et leurs
  vitesses restent tels quels : le problème est qu'on ne les montre pas, pas qu'ils
  soient mal réglés.
- Aucune retouche à l'apparence du Point ni du Blot.
- Aucun son.

---

## 2. Une encre pour l'Éclat

### 2.1 La teinte

Nouvelle entrée `INK.shard = 0xb25ce0`, encre violette, doublée dans
`src/styles/main.css` sous `--color-shard` : `ink.ts` s'annonce comme le miroir de la
palette Tailwind et y déclare toute divergence comme un bug.

Le violet est le seul créneau libre entre `danger` (0°), `blast` (45°) et `frost`
(200°). Il garde un fort contraste sur le fond marine `bg`, et il reste distinguable
du rouge en deutéranopie — le rouge y vire brun, le violet bleuté.

### 2.2 Pourquoi une deuxième couleur mortelle ne casse rien

`frost` en est déjà une : un ennemi gelé est bleu et tue toujours. La grammaire réelle
du jeu n'est donc pas « rouge = mortel » mais **« plein = mortel »** — c'est la
solidité qui porte la létalité, la couleur ne dit que de quoi il s'agit. Une teinte de
plus n'ajoute aucune ambiguïté sur ce point.

### 2.3 Le gel garde la priorité

`enemy.ts` passe de `frozen ? INK.frost : INK.danger` à
`frozen ? INK.frost : ENEMY_COLOR[type]`, avec `ENEMY_COLOR` défini côté rendu — comme
la table `COLORS` par kind de zone de `views/hazard.ts`, qui est le précédent le plus
proche dans le code. Un Éclat gelé reste donc bleu : à cet instant, l'information
utile est qu'il est immobilisé, pas son espèce.

Le blanchiment de la mort (`whiten`) s'applique après, inchangé.

---

## 3. La marque permanente : une facette

Le liseré intérieur en `INK.paper`, aujourd'hui un cercle tracé à `radius - edge/2`,
devient pour l'Éclat un **triangle inscrit** dans ce même rayon, de même épaisseur et
de même opacité.

Le nombre de côtés est ce qui décide si la marque se voit. Un polygone inscrit à `n`
côtés s'écarte du cercle de `r · (1 - cos(π/n))` en milieu d'arête : à `r = 6`, un
hexagone en creuse 0,8 px — invisible — un carré 1,8 px, un triangle 3 px, soit la
moitié du rayon. **Trois côtés**, donc.

Le remplissage reste le disque complet : la silhouette extérieure ne bouge pas, le
dessin reste exactement la hitbox.

Le triangle est orienté :

| État | Direction |
|---|---|
| 2 (charge) | le vecteur `Velocity`, c'est-à-dire la trajectoire figée |
| 0, 1 | vers le joueur |

La règle « toujours vers le joueur » serait plus simple mais mentirait pendant la
charge, au moment précis où la trajectoire cesse de suivre le joueur. La règle
« toujours le vecteur vitesse » est indéfinie pendant le télégraphe, où la vitesse est
nulle par construction.

La facette n'est dessinée que dans l'état solide (`materializeProgress === 1`), là où
`enemy.ts` trace déjà le liseré. Pendant l'apparition, le contour pointillé reste
identique pour tous les types : un ennemi qui se matérialise est traversable, son
espèce est une information secondaire.

---

## 4. Le télégraphe

### 4.1 Pourquoi le corps ne se comprime pas

L'idée d'une compression du disque en phase d'élan a été écartée : rétrécir le corps
le rendrait plus petit que ce qui tue, exactement le mensonge visuel que le principe
directeur interdit. Le grossir mentirait dans l'autre sens. **Le corps reste au rayon
6 pendant toute la séquence** ; tout le télégraphe se joue autour de lui, en
pointillé.

### 4.2 Deux éléments, deux informations

| Élément | Répond à | Tracé |
|---|---|---|
| Anneau convergent | *quand* | Pointillé, `INK.shard`, largeur 1,2 |
| Trait de visée | *où* | Pointillé, `INK.shard`, largeur 1,2 |

**L'anneau** se contracte de `radius · 4` (24 px) jusqu'à `radius` (6 px), linéairement
sur les 500 ms, opacité de 0,5 à 0,9. Il touche le corps à l'instant exact du tir :
c'est le contact qui est le signal, pas une valeur d'opacité à interpréter. C'est
l'idiome de l'anneau de compte à rebours de la matérialisation
(`radius + (1 - progress) · radius · 1.4`), joué en sens inverse.

**Le trait** part du bord de l'Éclat en direction du joueur, recalculé à chaque image,
d'une longueur bornée à la distance joueur–Éclat, opacité montant de 0 à 0,7.

### 4.3 Le trait suit le joueur, parce que c'est la vérité

`shard.ts` calcule la direction de charge à la transition 1 → 2, sur la position du
joueur à cet instant. Un trait figé au début du télégraphe afficherait donc une
trajectoire fausse pendant 500 ms.

Le trait suivi, lui, converge sur la vraie trajectoire au seul instant qui compte.
Il apprend au joueur une règle jusqu'ici cachée : **on n'esquive pas un Éclat en
partant tôt, on l'esquive au bon moment.** C'est une information que le jeu appliquait
déjà sans jamais la montrer.

L'alternative — verrouiller la visée dès l'entrée en état 1 pour rendre l'esquive
anticipée possible — est un changement d'équilibrage de la simulation, hors périmètre.

### 4.4 La charge

Pendant les 900 ms de l'état 2, des images rémanentes violettes derrière l'Éclat,
émises toutes les 40 ms et effacées en 250 ms. C'est le motif de la ruée du joueur,
réutilisé : `fx/afterimage.ts` montre la vitesse là où le reste montre la portée.

---

## 5. Plomberie de rendu

### 5.1 Ce que `stage.ts` transmet

Le bloc ennemi de `sync` (`stage.ts`) lit trois composants de plus — `Enemy.type`,
`Dasher` et `Velocity` — et ajoute quatre champs à l'appel de `view.update` :

| Champ | Source |
|---|---|
| `type` | `ENEMY_TYPE_BY_ID[at(Enemy.type, eid)]` |
| `dashState` | `hasComponent(world, Dasher, eid) ? at(Dasher.state, eid) : 0` |
| `telegraph` | `1 - at(Dasher.timer, eid) / SHARD_TELEGRAPH_MS`, en état 1 ; sinon `0` |
| `aim` | angle, selon la table du §3 |

`motionEnabled` n'a pas à transiter par la vue : les images rémanentes sont émises
depuis `sync`, comme celles du joueur, où le drapeau est déjà disponible.

### 5.2 Un `Graphics` séparé pour le télégraphe

`enemy.ts` court-circuite son redessin sur une clé de cache
(`radius | materializeProgress | frozen | whiten`). L'angle de visée et l'avancement
du télégraphe changent à chaque image : les mettre dans cette clé invaliderait le
corps 60 fois par seconde et le cache ne servirait plus à rien.

L'anneau et le trait vont donc dans **un troisième `Graphics`**, à côté de `body` et
`ring`, redessiné inconditionnellement et vidé hors de l'état 1. La clé du corps
gagne le type et l'angle du triangle quantifié au **dixième de radian** — le corps ne
se redessine que quand la facette tourne visiblement. Un centième de radian
déplacerait un sommet de 0,06 px à r = 6, très en deçà du visible, et le corps se
redessinerait pour rien.

### 5.3 `fx/afterimage.ts` se généralise

`createAfterimages` appelle aujourd'hui `drawNib(gfx, INK.paper)` en dur et plafonne à
16 fantômes. Elle prend deux paramètres : **la fonction de dessin** et **le plafond**.
Le site d'appel du joueur passe les valeurs actuelles, son comportement ne change pas.

Une seconde instance sert les Éclats, alimentée par son propre accumulateur de 40 ms.
Cet accumulateur est **partagé par tous les Éclats en charge** — ils émettent tous sur
le même battement — plutôt qu'un compteur par entité : le décalage de phase entre deux
chargeurs n'est pas une information, et un état par entité côté rendu demanderait un
nettoyage à la mort que la cadence partagée évite. Le plafond de l'instance Éclat est
porté à 48, trois chargeurs simultanés remplissant déjà 16 fantômes.

---

## 6. Tests

Vitest tourne sous Node, sans DOM ni WebGL : le rendu se vérifie à l'écran. Les
fonctions pures exportées d'une vue se testent, en revanche — `views/player.test.ts`
le fait déjà pour `haloInstall` et `haloBreathe`.

| Fichier | Couverture |
|---|---|
| `render/views/enemy.test.ts` (neuf) | `telegraphRingRadius` : vaut `radius · 4` à l'avancement 0, **exactement** `radius` à 1, décroît de façon monotone. `telegraphFade(progress, from, to)`, l'interpolation d'opacité partagée par l'anneau (0,5 → 0,9) et le trait (0 → 0,7) : rend `from` à 0, `to` à 1, reste bornée entre les deux |
| `render/fx/afterimage.test.ts` (neuf) | après généralisation : le plafond passé est respecté, la fonction de dessin passée est bien celle appelée |

Le reste — teinte, facette, convergence de l'anneau, trait suivi, rémanence — se
vérifie à l'écran.

---

## 7. Vérification manuelle

1. Un Éclat se repère du premier coup d'œil au milieu de Points, sans avoir à comparer
   les tailles.
2. Quand il se fige, l'anneau se contracte visiblement et le trait pointe vers le
   joueur.
3. L'anneau touche le corps à l'instant même où la charge part — pas avant, pas après.
4. Bouger pendant le télégraphe fait suivre le trait, et la charge part bien dans la
   dernière direction affichée.
5. Pendant la charge, la traînée de fantômes rend la vitesse sensible.
6. Un Éclat gelé est bleu comme les autres ; il garde sa facette triangulaire.
7. Un Éclat en cours d'apparition est un contour pointillé ordinaire, sans facette ni
   télégraphe.
8. Mouvement réduit activé : l'anneau et le trait restent — ce sont des informations
   de jeu — les images rémanentes disparaissent.
9. Plusieurs Éclats chargeant en même temps ne saturent pas l'écran de fantômes.
