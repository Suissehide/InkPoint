# Gel instantané et étoile de givre

## 1. Intention

Le Gel est aujourd'hui une zone : une entité `Hazard` de 130 px, posée là où la pastille
a été ramassée, qui vit 5 s et fige tout ennemi qui s'y trouve **ou qui y entre** pendant
ce temps. Elle se dessine en disque `INK.frost` qui s'estompe.

Deux choses changent, et rien d'autre :

1. **Le gel devient instantané.** Il prend les ennemis présents au moment de l'explosion,
   puis c'est fini. Plus d'entité, plus de fenêtre de capture.
2. **Le disque devient une étoile de givre.** De grands pics de longueurs et d'angles
   irréguliers partant du point d'explosion, à la place du cercle.

Les deux vont ensemble : un cercle qui s'estompe *dit* qu'une zone persiste. Tant que le
dessin est un disque, le joueur continuera d'attendre du Gel une capture qu'il ne fait
plus.

**Conséquence assumée sur l'équilibrage.** Le Gel perd sa fenêtre de 5 s sans rien
recevoir en échange : `freezeRadius` reste à 130 px, `freezeDurationMs` à 3500. C'est un
retrait de puissance délibéré, pas un oubli. Le Gel devient un outil de placement —
bien lancé il vaut ce qu'il valait, mal lancé il ne rattrape plus rien. Élargir le rayon
ou allonger le gel pour compenser rendrait le changement invisible à jouer, ce qui n'est
pas le but.

**Hors périmètre.** Aucun autre power-up. Aucune carte d'amélioration retouchée
(« Gel élargi » et « Gel prolongé » continuent d'agir, sur un coup unique désormais).
Givre rampant est inchangé. Le son du Gel est inchangé.

## 2. Le gel instantané

### 2.1 Ce que fait l'activation

`activatePowerUp`, case `'freeze'`, ne crée plus de `Hazard`. Il balaie une fois les
ennemis et gèle ceux qui sont à portée :

| Point | Valeur |
| --- | --- |
| Requête | `[Enemy, Position, Collider, Not(Materializing)]` |
| Portée | `stats.freezeRadius + Collider.radius[eid]` |
| Effet | `Frozen` (`remaining = stats.freezeDurationMs`), `FreshlyFrozen`, vélocité à zéro |

La requête reprend mot pour mot la règle de ciblage de `hazardSystem` : un ennemi en
matérialisation reste hors d'atteinte (spec §3.3, le pointillé est inoffensif partout).
La portée additionne le rayon de l'ennemi, comme partout ailleurs — un contact de bords
compte comme un contact.

Balayage linéaire, **pas** de hash spatial. Le hash de `hazardSystem` existe parce qu'il
tourne à chaque image sur toutes les zones ; ici le code s'exécute une fois, au
ramassage. Un hash ne ferait qu'ajouter un objet à maintenir.

### 2.2 Le garde `!hasComponent(Frozen)` disparaît

`hazardSystem` refusait de regeler un ennemi déjà gelé, et le commentaire dit pourquoi :
sans ce garde, la zone remettait le minuteur à `freezeDurationMs` **à chaque image** tant
que l'ennemi restait dedans, et `FreshlyFrozen` devenait un état permanent.

Ce raisonnement ne survit pas à la disparition de la zone. Sur un coup unique, le garde
n'aurait plus qu'un seul effet : empêcher un second Gel de rafraîchir un ennemi encore
pris par le premier. Un power-up ramassé doit faire quelque chose. Le garde part.

Conséquence voulue : un second Gel repose `FreshlyFrozen`, donc relance une vague de
contagion si « Givre rampant » est actif. Une fois, pas en boucle — c'est une activation,
pas une passe par image.

### 2.3 Ordonnancement

Le gel se produit désormais plus tard dans le pas : `activatePowerUp` est appelé depuis
`pickupSystem`, alors que la zone gelait depuis `hazardSystem`, plus tôt. Le décalage est
sans effet, et il faut dire pourquoi plutôt que de l'espérer :

- `homingSystem` et `formationSystem` excluent `Frozen` **structurellement**, par
  `Not(Frozen)` dans leur requête. Un ennemi gelé au pas *N* est déjà invisible pour eux
  au pas *N+1*.
- `integrationSystem` n'a pas de garde `Frozen`, mais il lit une vélocité que
  l'activation vient de mettre à zéro au pas *N*, et que `freezeSystem` remet à zéro à
  chaque pas ensuite.

Entre `hazardSystem` et `pickupSystem`, aucun système ne déplace d'ennemi. Le cycle de
vie d'un ennemi gelé est donc exactement celui d'avant.

## 3. Ce qui est soldé

Une zone qui n'existe plus ne doit rien laisser derrière elle.

| Fichier | Ce qui part |
| --- | --- |
| `src/sim/data/powerups.ts` | `POWERUP_BASE.freeze.zoneLifeMs` ; l'export `HAZARD_FREEZE` |
| `src/sim/systems/hazards.ts` | l'import et la branche `kind === HAZARD_FREEZE` |
| `src/render/views/hazard.ts` | l'import, l'entrée `COLORS[HAZARD_FREEZE]`, la branche de dessin |
| `src/sim/powerups/activate.ts` | l'appel `createHazard` du case `'freeze'` |

`POWERUP_BASE.freeze` conserve `radius` (130) et `durationMs` (3500), tous deux lus par
`RunStats`.

**L'identifiant 2 est retiré, pas recyclé.** Le fichier pose la règle pour les
identifiants de power-up — « jamais renumérotés, ce sont des étiquettes opaques », d'où
les trous 4 et 8 de `POWERUP_BY_ID` — et les `HAZARD_*` ont déjà un trou en 4. La valeur
2 est marquée réservée par un commentaire à l'endroit où elle était déclarée. Une future
zone qui hériterait du 2 rendrait illisible tout état sauvegardé ou toute trace
antérieure.

`INK.frost` reste : il colore les ennemis gelés et la nouvelle étoile.

## 4. L'étoile de givre

### 4.1 Pourquoi un module à part

`Shockwaves` a déjà une option `needles`, et elle ne convient pas. Ses aiguilles sont
réparties régulièrement par construction (`(n / needles) * 2π`) et n'alternent qu'entre
deux longueurs, dont une fixée par `NEEDLE_OVERSHOOT` ; elle trace en plus un cercle
intérieur à `NEEDLE_INNER`. C'est un cercle hérissé — précisément la lecture dont on veut
sortir. L'élargir en « anneau *ou* étoile » ferait un module à deux formes sans rapport.

D'où `src/render/fx/frost-star.ts`, calqué sur `shockwave.ts` : même interface
`emit` / `update(dtMs)` / `destroy()`, même vie sur un container Pixi, même plafond dur.

`Math.random()` est autorisé dans `src/render/` (interdit dans `src/sim/`) :
`camera.ts` le documente explicitement et `particles.ts` s'en sert. L'étoile n'a donc
besoin d'aucune graine et ne touche pas au déterminisme de la simulation.

### 4.2 Géométrie

13 pics, chacun un triangle isocèle partant du point d'explosion — même patron que
`drawBramble` : une pointe à `longueur` sur l'axe du pic, et deux coins de base **posés
sur le point d'explosion lui-même**, écartés de ±`demi-largeur` perpendiculairement à cet
axe. Les 13 bases se recouvrent donc toutes au centre, ce qui donne un noyau dense d'où
les pics sortent.

| Réglage | Valeur | Raison |
| --- | --- | --- |
| `SPIKE_COUNT` | 13 | impair : aucune symétrie accidentelle d'un pic à son opposé |
| `SPIKE_MIN_RATIO` | 0,45 | le pic le plus court fait 45 % du rayon — l'écart de longueur doit se voir |
| `SPIKE_HALF_WIDTH_RATIO` | 0,055 | ≈ 7 px à 130 px de rayon, donc 14 px de base : un pic, pas un cheveu |
| `ANGLE_JITTER` | 0,75 | fraction de la demi-tranche dont un angle peut s'écarter |
| `DURATION_MS` | 450 | |
| `STAR_LIMIT` | 8 | plafond dur, plus bas que les 24 anneaux : une étoile coûte 13 triangles |

**Les angles sont jittérés, pas tirés uniformément.** L'angle du pic *i* vaut
`(i / 13) · 2π + u · (π / 13) · 0,75`, avec `u` dans [-1, 1]. Des angles uniformément
aléatoires produiraient des paquets et de grands arcs vides — ça se lit comme un bug, pas
comme du givre. Le jitter borné à 75 % de la demi-tranche garantit en plus qu'aucun pic
n'en croise un autre : l'écart minimal entre deux voisins reste 25 % de la tranche
nominale, soit ≈ 6,9°.

**Un pic est forcé à `radius` exact.** Les 12 autres tirent leur longueur dans
`[0,45 · radius ; radius]`. Sans ce pic garanti, un tirage malchanceux dessinerait une
étoile entièrement plus courte que la portée réelle, et le joueur apprendrait une portée
fausse. C'est la même exigence que celle qui fait tracer le disque de vérité partout
ailleurs (`render/views/hazard.ts` la formule pour la Ronce) : le dessin ne doit jamais
promettre moins ni plus que ce qui agit.

Le pic garanti est l'indice 0, dont l'angle est jittéré comme les autres — il n'est donc
pas toujours au même endroit.

### 4.3 Vie de l'étoile

La géométrie est tirée une fois, à l'émission, et **jamais recalculée**. Sur les 450 ms :

- l'opacité de remplissage descend de 0,85 à 0 ;
- la demi-largeur de base descend vers 0, donc les triangles s'affinent en aiguilles ;
- **la longueur ne bouge pas.**

C'est la lecture « pop puis fondu » : quand le joueur voit l'étoile, tout est déjà gelé.
Une étoile qui pousserait vers l'extérieur décrirait une onde qui met du temps à arriver,
ce qui est exactement le mensonge qu'on retire.

L'affinement n'est pas décoratif : `shockwave.ts` documente le piège d'un anneau qui ne
fait que s'estomper et « finit en gros cercle net qui reste plaqué sur l'image ». Faire
maigrir la base évite ça sans toucher à la longueur, donc sans jamais rendre la portée
moins lisible qu'à la première image.

### 4.4 Câblage

`stage.ts` possède les effets : il les crée sur `particlesLayer`, les met à jour dans la
boucle d'image et les détruit. `frostStars` suit les trois mêmes points, à côté de
`shockwaves`, et s'ajoute au type `Stage`. `applyJuice` reçoit `frostStars: FrostStars`
dans son objet `fx`, et `game.ts` le passe aux deux endroits où il passe déjà
`stage.shockwaves`.

## 5. Le rayon doit arriver jusqu'au rendu

`SimEvent.powerupUsed` porte aujourd'hui `{ kind, x, y }`. La couche FX n'a donc aucun
moyen de connaître le rayon réel du Gel, et une étoile dessinée à une constante ignorerait
« Gel élargi ».

L'événement gagne **`radius: number | null`** — la portée de l'effet à l'instant de
l'activation, quand il en a une seule :

| Power-up | `radius` |
| --- | --- |
| Gel | `stats.freezeRadius` |
| Buvard | `stats.blotterRadius` |
| Bombe | `null` |
| Ronce, Ruée, Halo | `null` |

La Bombe porte `null` **bien qu'elle ait un rayon** : le sien part de 12 px et grandit
jusqu'à `stats.blastRadius`. Aucun nombre unique ne la décrit à l'activation, et publier
son maximum comme s'il valait déjà donnerait une portée que la zone n'a pas encore.

`number | null` et non un défaut à 0, par la règle que `HazardView` pose déjà pour son
champ `angle` : « jamais 0 — un défaut à 0 ferait pointer un chevron vers +x avec l'aplomb
d'une information vraie ». Un rayon à 0 affirmerait une portée nulle.

C'est l'événement, et pas un paramètre `stats` ajouté à `applyJuice` : l'événement est le
compte rendu de ce qui vient de se produire, et le rayon en fait partie. Faire recalculer
la valeur par la couche FX ouvrirait la possibilité qu'elle diverge de celle qui a
réellement gelé.

## 6. Signature dans `juice.ts`

`case 'freeze'` change d'un geste :

| | Avant | Après |
| --- | --- | --- |
| Flash | `INK.frost`, 0,05 | inchangé |
| Onde | `radius: 88`, `needles: 16`, 620 ms | **retirée** |
| Étoile | — | `fx.frostStars.emit(x, y, { color: INK.frost, radius })` |
| Particules | 18, 215 px/s, `streak`, `stallAfterMs: 300` | inchangé |

L'onde à aiguilles part parce que l'étoile la remplace ; les garder toutes les deux
superposerait deux formes de givre concentriques.

Les particules restent : elles prennent en glace en plein vol (`stallAfterMs`), ce qui dit
« quelque chose vient de se figer » — le message n'a pas changé. Le flash reste pour
marquer l'instant.

**Pas de secousse caméra ajoutée.** Le Gel n'en avait pas et le flash suffit à marquer le
coup. Le mot « explosion » décrit ici la forme du dessin, pas une demande de violence.

## 7. Tests

### 7.1 Rendu — `src/render/fx/frost-star.test.ts`

Les fonctions de géométrie prennent leur tirage en paramètre (`rand01`) au lieu d'appeler
`Math.random()` : `emit` fournit le hasard, les fonctions restent pures et testables.
Même parti que `death-sequence.ts`, qui dérive sa séquence de l'`eid` « pourtant permis
dans `src/render/` : une séquence reproductible se débogue et se teste ».

| Test | Ce qu'il garantit |
| --- | --- |
| `spikeAngle` aux bornes du tirage | l'angle reste dans sa tranche ; deux voisins ne se croisent jamais, quel que soit le tirage |
| `spikeLength(0, …)` | vaut `radius` exactement, quel que soit le tirage |
| `spikeLength(i > 0, …)` aux bornes | reste dans `[0,45 · radius ; radius]` |
| courbe d'affinement | 1 à `progress` 0, 0 à `progress` 1, monotone |

### 7.2 Simulation — `src/sim/powerups/activate.test.ts`

Le cas `'freeze'` est réécrit : il vérifiait la création d'un `Hazard` de kind
`HAZARD_FREEZE`.

| Test | Ce qu'il garantit |
| --- | --- |
| aucune entité `Hazard` créée | la zone a bien disparu |
| ennemi à 100 px | `Frozen`, `remaining === stats.freezeDurationMs`, `FreshlyFrozen`, vélocité nulle |
| ennemi à 300 px | intact |
| ennemi `Materializing` à 100 px | intact — le pointillé reste hors d'atteinte |
| ennemi déjà `Frozen` à minuteur bas | minuteur rafraîchi (§2.2) |

Le rayon des cas de test se dérive de `stats.freezeRadius`, jamais recopié en dur.

### 7.3 Ailleurs

- `src/sim/systems/hazards.test.ts` : le cas `HAZARD_FREEZE` disparaît.
- `src/app/juice.test.ts` : `declenche('freeze')` vérifie une étoile émise au bon rayon, plus une onde.
- `src/sim/systems/pickup.test.ts` : la liste `['blast', 'freeze', 'blotter', 'dash']` ne bouge pas — le Gel reste courant.

## 8. Documentation à corriger

`docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md` décrit encore une zone :

| Ligne | Actuel | Correction |
| --- | --- | --- |
| 52 | `Gel` — « Zone de gel, ennemis gelés » | « Éclat de gel, ennemis gelés » |
| 292 | « Contrôle, zone posée … Zone déposée … Fige les ennemis qui s'y trouvent **ou y entrent** » | « Contrôle, instantané … Fige d'un coup les ennemis à portée » |

La seconde moitié de la ligne 292 — « un ennemi gelé meurt si le joueur le traverse » —
reste vraie et ne bouge pas.
