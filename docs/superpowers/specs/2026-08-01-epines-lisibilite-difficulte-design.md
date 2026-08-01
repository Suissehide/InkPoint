# Épines, lisibilité et difficulté sans plafond

## 1. Intention

Quatre corrections issues d'une session de jeu. Trois sont des réglages, la quatrième
change la forme de la courbe de difficulté :

1. **Les épines de la Ronce d'encre ne ressemblent pas à des épines.** Elles se lisent
   comme des bulles : le disque mortel est dessiné tel quel, avec un éclat effilé posé
   dedans.
2. **La réglure de la page est trop espacée.** Dans le halo, on ne voit qu'une dizaine de
   lignes — trop peu pour que le fond se lise comme une page.
3. **La Ronce sort trop souvent.** Elle est à égalité avec la Bombe, le Givre, le Buvard
   et la Ruée.
4. **La difficulté cesse de monter.** Passé environ cinq minutes, toutes les courbes ont
   atteint leur asymptote et plus rien ne durcit.

**L'audio reste hors périmètre.** Aucun moteur n'existe encore ; il fera l'objet de sa
propre spec, comme annoncé dans `src/ui/screens/settings.ts`.

## 2. Les épines de la Ronce d'encre

### 2.1 L'invariant qui contraint tout

`views/hazard.ts` défend une règle explicite : **ce qui est affiché contient ce qui tue.**
La zone mortelle de chaque épine est un disque de `thornRadius`, testé par
`sim/systems/hazards.ts`. C'est pour ça que le disque est dessiné : un éclat effilé seul
laisserait une bande mortelle invisible entre son flanc et le bord du cercle.

La direction retenue affûte le dessin **sans toucher à la collision**. Le disque reste,
mais s'efface ; l'éclat devient un vrai triangle. La simulation n'est modifiée que dans ses
trois constantes de géométrie — jamais dans sa logique.

### 2.2 Ce qui change

Dans `src/sim/data/powerups.ts`, entrée `bramble` :

| Constante | Avant | Après |
| --- | --- | --- |
| `count` | 6 | **7** |
| `orbitRadius` | 40 | 40 (inchangé) |
| `thornRadius` | 11 | **8** |

Dans `src/render/views/hazard.ts` :

- l'opacité du disque de vérité passe de `0.18` à **`0.09`** (et son liseré de `0.35` à
  **`0.18`**) — il reste présent, donc honnête, mais cesse d'écraser la pointe ;
- **l'éclat perd un sommet.** Il est aujourd'hui un cerf-volant à quatre points — pointe,
  deux flancs placés *perpendiculairement au milieu* de l'axe, arrière — et c'est cette
  silhouette losangée qui le fait lire comme une bulle. Il devient un triangle à trois
  points : la pointe, et deux coins de base ramenés *à l'arrière*, alignés avec lui.

Les trois ratios gardent leurs noms ; deux changent de valeur :

| Ratio | Avant | Après |
| --- | --- | --- |
| `BRAMBLE_TIP_RATIO` | 1 | 1 (inchangé) |
| `BRAMBLE_BACK_RATIO` | 0,55 | **0,5** |
| `BRAMBLE_HALF_WIDTH_RATIO` | 0,62 | **0,72** |

Le triangle reste inscrit dans le disque : ses coins de base sont à
`√(0,5² + 0,72²) ≈ 0,88 · radius` du centre. Ce n'est **pas** ce qui satisfait l'invariant
du §2.1 — c'est le disque, dessiné en propre, qui s'en charge. L'inscription est une
propriété de cohérence : un éclat qui déborderait du disque qu'il décore serait laid, et
suggérerait une zone mortelle plus large que la vraie. Cette erreur-là rendrait seulement
le joueur trop prudent, jamais trahi ; elle ne compromet pas l'invariant.

### 2.3 La perméabilité est préservée, et c'est délibéré

Une épine bloque un ennemi de rayon `r` sur une largeur de `2 · (thornRadius + r)`. Deux
épines voisines ont leurs centres distants de `2 · orbitRadius · sin(π / count)`. Un ennemi
passe quand cet écart dépasse la largeur bloquée.

| | Écart entre centres | Point (r 7) | Éclat (r 6) | Bloc (r 14) |
| --- | --- | --- | --- | --- |
| Avant (6 / 40 / 11) | 40,0 px | passe (36) | passe (34) | bloqué (50) |
| **Après (7 / 40 / 8)** | **34,7 px** | **passe (30)** | **passe (28)** | **bloqué (44)** |

Le profil est identique : les deux petits ennemis continuent de se faufiler, le Bloc reste
arrêté, et la rotation garde son rôle de rattrapage.

Ce point n'est pas une conséquence heureuse mais un choix. Resserrer davantage — 9 épines
sur une orbite de 34, la variante la plus fine envisagée — donnait un écart de 23 px, en
dessous du seuil du plus petit ennemi : **la couronne devenait parfaitement étanche.**
C'est un renforcement franc de la Ronce, écarté ici parce qu'on cherchait une amélioration
de lisibilité, pas un changement de puissance.

Le commentaire de `powerups.ts` qui documente ce calcul porte les anciens chiffres. Il est
réécrit avec les nouveaux : laissé tel quel, il affirmerait quelque chose de faux.

## 3. La réglure de la page

`RULE_GAP` passe de `32` à **`20`** dans `src/render/page.ts`. Dans un halo de
`PAGE_HALO_RADIUS = 165`, le joueur voit environ 16 lignes au lieu de 10 : la page se lit
comme une page.

`MARGIN_X` (58) ne bouge pas — c'est la marge verticale du cahier, pas une réglure, et son
espacement n'a rien à voir avec la densité des lignes.

## 4. La fréquence de la Ronce

`POWERUP_WEIGHT.bramble` passe de `4` à **`2`** dans `src/sim/data/powerups.ts`.

| | Poids | Part des pastilles |
| --- | --- | --- |
| Avant | 4 / 21,5 | 18,6 % |
| **Après** | **2 / 19,5** | **10,3 %** |

À peu près moitié moins fréquente, sans descendre au niveau du Halo (1,5, soit 7,7 %) qui
reste le power-up rare.

## 5. La difficulté sans plafond

### 5.1 Le principe retenu

**La difficulté monte indéfiniment : toute partie finit par une mort.** Le jeu devient
« combien de temps tiens-tu », ce qui donne un sens absolu au meilleur score déjà persisté.

Deux leviers seulement montent sans plafond : **l'effectif par figure** et **la cadence des
figures**. Les autres courbes ne bougent pas, et c'est important :

- **La vitesse des ennemis reste plafonnée à 150 px/s**, sous les 240 px/s du joueur. La
  laisser monter au-delà rendrait la mort imparable plutôt que méritée : on ne pourrait
  plus se replacer, seulement fuir en ligne droite jusqu'au mur.
- **Le tirage des figures reste uniforme.** Les figures ne changent pas de nature avec le
  temps — elles grossissent jusqu'à devenir méchantes, ce qui suffit (voir §5.3).

### 5.2 Les deux courbes

Dans `src/sim/data/difficulty.ts` :

**`formationSize`** — de `Math.round(lerp(8, 15, clamp01(ramp(elapsedSec, 180))))` à une
croissance linéaire sans plafond :

```ts
export function formationSize(elapsedSec: number): number {
  return Math.round(8 + Math.max(0, elapsedSec) / 20)
}
```

| Temps | 0 s | 2 min | 5 min | 10 min | 20 min |
| --- | --- | --- | --- | --- | --- |
| Effectif | 8 | 14 | 23 | 38 | 68 |

**`formationInterval`** — de `lerp(12, 6, clamp01(ramp(elapsedSec, 200)))` à une
décroissance hyperbolique qui tend vers zéro sans jamais l'atteindre :

```ts
export function formationInterval(elapsedSec: number): number {
  return 12 / (1 + Math.max(0, elapsedSec) / 120)
}
```

| Temps | 0 s | 2 min | 5 min | 10 min | 30 min |
| --- | --- | --- | --- | --- | --- |
| Intervalle | 12,0 s | 6,0 s | 3,4 s | 2,0 s | 0,75 s |

Une décroissance vers un plancher de zéro ferait naître une infinité de formations par
seconde ; la forme hyperbolique décroît sans borne inférieure atteignable.

### 5.3 Ce que l'effectif produit tout seul

Les formations qui traversent l'arène utilisent un espacement **fixe de 34 px**
(`src/sim/systems/waves.ts:261`). Une ligne de `n` ennemis s'étend donc sur `(n − 1) · 34`
pixels, dans une arène large de 1280.

| Effectif | Envergure | Part de la largeur |
| --- | --- | --- |
| 15 (plafond actuel) | 476 px | 37 % |
| 23 (≈ 5 min) | 748 px | 58 % |
| **39 (≈ 10 min)** | **1292 px** | **100 %** |

**Les « lignes sur toute la largeur » arrivent donc sans code neuf**, vers dix minutes,
comme conséquence mécanique de l'effectif. Le carré enveloppant profite du même effet : il
se resserre déjà à 15 % de sa taille (`FORMATION_CHOREO.square.shrinkTo`), mais avec 39
ennemis au lieu de 15 il devient un mur dense au lieu d'une grille à trous.

C'est la raison pour laquelle aucune formation nouvelle n'est créée ici : celles qui
existent contiennent déjà la difficulté demandée, il leur manquait seulement les effectifs.

### 5.4 Le garde-fou est déjà là

`MAX_ENEMIES = 1500` borne l'ensemble, et `waves.ts` calcule
`budget = Math.min(formationSize(elapsedSec), MAX_ENEMIES - alive)`. La montée s'auto-limite
donc quand l'arène sature — aucun risque d'explosion, même à trente minutes. En pratique le
rendu Pixi et le joueur cèdent bien avant ce plafond.

## 6. Tests

Les quatre points touchent des données et du rendu, deux domaines que ce dépôt teste par
leurs invariants plutôt que par leurs valeurs — une spec qui figerait chaque chiffre dans un
test interdirait tout réglage ultérieur.

| Ce qu'on vérifie | Où |
| --- | --- |
| `formationSize` est strictement croissante et sans plafond (une valeur tardive dépasse toute valeur précoce) | `difficulty.test.ts` |
| `formationSize` vaut 8 à t = 0 : en dessous de huit, une figure ne se lit plus comme une forme | `difficulty.test.ts` |
| `formationInterval` est strictement décroissante et **toujours strictement positive**, y compris à des temps absurdes (10⁶ s) | `difficulty.test.ts` |
| `formationInterval` vaut 12 s à t = 0 | `difficulty.test.ts` |
| Les deux fonctions sont finies et positives pour un `elapsedSec` négatif (garde `Math.max(0, …)`) | `difficulty.test.ts` |
| La couronne de Ronce laisse passer Point et Éclat, arrête le Bloc — calculé depuis `count`, `orbitRadius`, `thornRadius`, jamais recopié | `powerups.test.ts` |
| La somme des poids de power-up et la part de `bramble` restent cohérentes avec `POWERUP_KINDS` | `powerups.test.ts` |

Le test de perméabilité est le plus important des deux derniers : il **dérive** l'écart et
les largeurs bloquées des constantes réelles, de sorte qu'un futur réglage de `count`,
`orbitRadius` ou `thornRadius` qui refermerait la couronne échoue au lieu de passer
inaperçu. C'est exactement le pas que la présente spec a failli franchir sans le voir.

Les changements de rendu (opacité du disque, forme du triangle, `RULE_GAP`) ne sont pas
testables sans Pixi et relèvent de la vérification à l'œil, conformément à la frontière du
dépôt.

## 7. Vérification à l'œil

- Ramasser une **Ronce** : les épines doivent se lire comme des pointes triangulaires, pas
  comme des bulles ; le disque doit rester perceptible sans dominer.
- Laisser un **Point** ou un **Éclat** approcher la couronne : il doit encore pouvoir se
  faufiler entre deux épines. Un **Bloc** ne doit jamais passer.
- Regarder la **réglure** dans le halo : environ 16 lignes, contre 10 avant.
- Jouer **au-delà de dix minutes** : vérifier qu'une formation `line` barre effectivement
  toute la largeur de l'arène, et que le jeu devient franchement intenable sans pour autant
  ramer.

## 8. Hors périmètre

- **L'audio.** Spec séparée ; le réglage de volume reste inerte d'ici là.
- **La collision triangulaire** de la Ronce : envisagée, écartée. Elle rendrait les pointes
  réellement mortelles, mais toucherait `sim/systems/hazards.ts` et changerait la nature du
  power-up.
- **Les formations inédites** (tenaille, spirale double) : inutiles ici, puisque l'effectif
  suffit à durcir celles qui existent.
- **La répartition des figures** selon le temps : écartée au profit du durcissement seul.
