# Ink Point — Le givre lâche avant de lâcher

**Date :** 2026-08-04
**Statut :** validé, prêt pour le plan d'implémentation
**Portée :** rendu de la fin du gel sur le corps d'un ennemi

---

## 1. Contexte

Le gel n'immobilise pas seulement : il retourne l'ennemi. `collisionSystem` exclut
`Frozen` de `activeEnemies` — un ennemi gelé ne tue plus — et `freezeSystem` le marque
`Doomed` dès que le joueur le touche. Pendant toute la durée du gel, une foule
mortelle devient un champ de points à ramasser au corps à corps.

**La fin de cette fenêtre n'est annoncée nulle part.** `views/enemy.ts` lit un booléen
`frozen` et peint le corps en `INK.frost` tant qu'il est vrai ; à l'image où
`freezeSystem` retire le composant, le corps redevient rouge et l'ennemi reprend sa
course. Le joueur, lui, était en train de plonger dedans.

Le coût de l'erreur est asymétrique : dégeler *pendant* que le joueur traverse le
disque, c'est une mort. Et la durée restante n'est jamais devinable de l'extérieur,
parce qu'elle n'est jamais la même :

- 4 000 ms pour un ennemi pris dans la déflagration de la carte Gel, plus 800 ms par
  exemplaire de `freeze-duration` ;
- une fraction de ça pour un ennemi attrapé par la contagion de *Givre rampant*, qui
  n'emporte que 60 % du temps restant de sa source à chaque saut, et cesse de se
  propager sous 300 ms (`RULE_TUNING.freezeSpreadFloorMs`).

Deux ennemis bleus côte à côte peuvent donc avoir 6 secondes et 300 millisecondes
devant eux. Rien à l'écran ne les distingue.

### Objectifs

1. **Annoncer le dégel** assez tôt pour qu'on puisse rompre l'approche.
2. **Ne rien coûter en lisibilité** quand trente ennemis sont gelés d'un coup, ce que
   la contagion produit régulièrement.

### Hors périmètre

- **Aucun changement dans `sim/`.** `Frozen.remaining` porte déjà toute l'information
  ; le problème est qu'on ne la montre pas. En particulier, **aucun `Frozen.total`**
  n'est ajouté : le signal choisi est un seuil absolu, pas un ratio.
- Aucun décompte continu : on n'affiche pas « combien de gel il reste » pendant les
  secondes tranquilles, seulement la fin.
- Aucun son, aucune particule, aucun changement de silhouette.

---

## 2. Le signal : trois paliers d'encre

Le corps passe du givre à sa couleur d'espèce en trois marches, en fonction du temps
restant :

| Palier | `remaining` | Part de givre | Ce que ça dit |
|---|---|---|---|
| Gelé | > 700 ms | 1 (`frost` pur) | rien de neuf — état actuel, inchangé |
| Le givre lâche | 700 → 220 ms | 0,5 | la fenêtre se referme |
| Il repart | ≤ 220 ms | 0,12 | c'est fini, sors de là |

Le dernier palier tient treize images de rouge — ou de violet pour l'Éclat — revenu
sur un corps qui ne tue pas encore. C'est ça, l'avertissement : la couleur de la
menace précède la menace.

### 2.1 Pourquoi des paliers et pas un dégradé

**Parce que l'œil attrape les transitions, pas les gradients.** Une teinte qui glisse
régulièrement sur 700 ms au milieu d'une mêlée ne se remarque pas ; c'est le reproche
qu'on peut faire à toute interpolation continue, et il est d'autant plus vrai que les
corps concernés font 6 à 7 px de rayon. Un saut de couleur, lui, est un événement,
même petit et même en périphérie.

**Et parce que trois valeurs, c'est trois clés de cache.** `createEnemyView` court-circuite
le redessin sur une clé de chaîne où `frozen` entre aujourd'hui comme booléen. Un
scalaire continu ferait changer cette clé à chaque image pour chaque ennemi gelé —
trente redessins par image pendant toute la durée de l'alerte. Trois paliers, c'est
exactement deux redessins par dégel.

### 2.2 Pourquoi la couleur d'espèce, et pas une teinte d'alerte dédiée

Aucune quatrième encre n'est nécessaire : la couleur qui revient **est** l'information.
Elle dit « ce corps redevient ce qu'il était », ce qu'une teinte inventée ne dirait
qu'au prix d'un apprentissage. Le créneau de teinte libre entre `danger`, `blast` et
`frost` est par ailleurs déjà pris par `shard` (spec du 2026-08-02 §2.1).

---

## 3. Mise en œuvre

### 3.1 Le booléen devient un scalaire

`enemyBodyColor(type, frozen: boolean, whiten)` devient
`enemyBodyColor(type, frostAmount: number, whiten)` :

```ts
mixColor(mixColor(ENEMY_COLOR[type], INK.frost, frostAmount), INK.paper, whiten)
```

Le booléen n'était rien d'autre qu'un `frostAmount` à deux valeurs — `1` pour un gelé,
`0` pour les autres — et les deux appels correspondants rendent exactement les mêmes
couleurs qu'aujourd'hui.

**L'ordre des deux mélanges compte.** Le blanchiment reste appliqué en second, sur la
base quelle qu'elle soit : un ennemi tué en plein dégel blanchit comme les autres
pendant le temps d'arrêt, et `whiten = 1` rend `paper` quel que soit le palier.

Le champ `frozen` de `EnemyView.update` devient `frostAmount` de la même façon, et la
clé de cache le prend en `toFixed(2)` — trois valeurs possibles, donc trois clés.

### 3.2 La fonction de palier

Une fonction pure exportée, seule dépositaire des seuils :

```ts
export function thawFrostAmount(remainingMs: number): number
```

`1` au-dessus de `THAW_LOOSE_MS = 700`, `0.5` au-dessus de `THAW_GONE_MS = 220`,
`0.12` en dessous. Elle n'est appelée que pour un ennemi effectivement gelé ; un
ennemi libre reçoit `0` sans passer par elle.

### 3.3 Le point de lecture

Dans `render/stage.ts`, le booléen `frozen` existant est conservé — il sert à exclure
les Éclats gelés de l'émission des fantômes violets, pour une raison documentée sur
place qui n'a rien à voir avec la couleur. Il gagne seulement une lecture à côté :

```ts
const frostAmount = frozen ? thawFrostAmount(at(Frozen.remaining, eid)) : 0
```

`Frozen` et `at` sont déjà importés dans le fichier.

### 3.4 Un commentaire à corriger au passage

Le bloc de documentation d'`enemyBodyColor` affirme aujourd'hui que « `frost` en est
déjà une [couleur mortelle] ». C'était vrai avant que le gel ne retourne les ennemis ;
`collisionSystem` dit le contraire depuis. Le commentaire est réécrit avec la fonction
qu'il documente, puisqu'il porte précisément sur ce que la nouvelle mécanique de
couleur signifie.

---

## 4. Deux conséquences assumées

**Les gels de contagion les plus courts naissent en palier 2.** À 300 ms — le plancher
de propagation — un ennemi n'affiche jamais le givre plein. C'est exact : ce gel-là ne
vaut rien, et le montrer bleu vif serait une promesse fausse. Il garde une lecture
nettement bleutée, ce qu'un seuil de palier 3 plus haut lui retirerait.

**Le ralenti étire l'alerte, gratuitement.** `remaining` décroît en
`FIXED_DT × world.timeScale` : pendant un temps d'arrêt, les 700 ms d'alerte durent à
l'écran aussi longtemps que tout le reste. Aucun code n'est nécessaire pour ça.

---

## 5. Tests

Dans `views/enemy.test.ts`, à côté de l'existant :

- **`thawFrostAmount` aux bornes** : 701 → `1`, 700 → `0.5`, 221 → `0.5`, 220 →
  `0.12`, 0 → `0.12`. La valeur exacte d'un seuil appartient au palier inférieur.
- **Non-régression de couleur** : `enemyBodyColor(t, 1, 0)` vaut `INK.frost` pour les
  trois espèces, et `enemyBodyColor(t, 0, 0)` vaut la couleur d'espèce — ce sont les
  deux cas que le booléen couvrait.
- **Monotonie** : la distance composante par composante à la couleur d'espèce décroît
  strictement de `frostAmount = 1` à `0,5` à `0,12`. Un palier qui cesserait de se
  rapprocher du rouge casserait le sens du signal sans casser aucun autre test.
- **Blanchiment prioritaire** : `whiten = 1` rend `INK.paper` pour les trois paliers.
- **La clé de cache** : deux `update` consécutifs avec des `frostAmount` de paliers
  différents redessinent le corps ; deux `update` dans le même palier ne le redessinent
  pas. Le bloc `createEnemyView : la clé de cache du corps` accueille ces deux cas.

---

## 6. Fichiers touchés

| Fichier | Nature |
|---|---|
| `front/src/render/views/enemy.ts` | signature d'`enemyBodyColor` et du champ de `update`, `thawFrostAmount`, les deux constantes de seuil, clé de cache, commentaire de §3.4 |
| `front/src/render/stage.ts` | lecture de `Frozen.remaining`, passage de `frostAmount` |
| `front/src/render/views/enemy.test.ts` | fixture `solide()`, appels existants d'`enemyBodyColor`, tests de §5 |

Aucun fichier de `sim/`.

---

## 7. Écartées

**Le tremblement qui revient.** Un ennemi gelé est la seule chose parfaitement immobile
de l'écran, tout le reste frémit au boil ; réinjecter une gigue croissante sur la fin
du gel aurait été gratuit en dessin — un décalage de `container.x/y`, sans toucher la
clé de cache — et lisible à n'importe quel rayon. Écartée au profit de la couleur, plus
directe à lire comme « la menace revient ».

**L'anneau de dégel.** Un anneau pointillé `frost` partant à 2,5 rayons et touchant le
corps exactement à l'instant du dégel, miroir du télégraphe de l'Éclat dont il aurait
réutilisé `dashedCircle` et `telegraphRingRadius`. Deux défauts : trente anneaux qui se
chevauchent sur une foule gelée, et la même forme que le télégraphe de charge à la
couleur près — « il va foncer » et « il va dégeler » ne doivent pas se dessiner pareil.
