# Mobile : paysage forcé, arène réduite, joystick et inclinaison — design

**Date :** 2026-08-03
**Remplace :** `2026-07-30-mobile-inclinaison-design.md`, jamais implémentée. Le
code n'a jamais contenu ni `tilt.ts`, ni `joystick.ts`, ni `orientation.ts`, ni
aucune rotation en portrait — d'où le constat « le tilt ne marche pas ».

**Arborescence :** ce chantier suit la restructuration en workspaces landée en
`de7d98d` — `sim/` à la racine (partagé avec le futur back), `front/src/{app,render,ui}`,
alias `@` → `front/src` et `@sim` → `sim`.

**Découpage :** deux lots, décidés le 2026-08-03.

- **Lot 1 — « paysage jouable »** : arène réduite et portées à l'échelle (§1, §3),
  rotation CSS (§2), `orientation.ts`, joystick et `speedCap` (§4, §5), `--ui`
  piloté depuis JS et pause tactile (§6). Livrable et jouable seul.
- **Lot 2 — « inclinaison et finition »** : `tilt.ts` (§4), puis le reste de §6 —
  cibles tactiles, cartes d'amélioration compactes, vitrines au doigt, textes
  d'aide. L'inclinaison est le seul morceau invérifiable depuis la session de
  développement ; l'isoler permet de jouer au lot 1 avant qu'elle existe.

## Problème

Le jeu n'est pas jouable au téléphone. Aucune commande tactile : `computeViewport`
cadre l'arène 1280×720 entière dans la fenêtre, ce qui donne une bande minuscule
en portrait, et les seules sources d'entrée sont le clavier et la souris. Même en
paysage, où l'arène remplit l'écran, les entités sont trop petites pour être lues
au pouce et les menus trop fins pour être visés.

## Objectif

Rendre le jeu jouable et lisible au pouce sur téléphone.

## Non-objectifs

- Le plein écran et le masquage de la barre du navigateur.
- Le multi-touch, les gestes, le retour haptique.
- Une géométrie d'arène variable selon l'appareil : l'arène mobile est une
  seconde taille fixe, pas une taille calculée.
- La parité de difficulté entre bureau et téléphone. Elle est explicitement
  abandonnée (voir §3).

## Décisions

| Décision | Choix | Raison |
|---|---|---|
| Détection | `matchMedia('(pointer: coarse)')` | Un seul prédicat gouverne arène, rotation, joystick et interface. Évite qu'une fenêtre de bureau étroite bascule en mobile |
| Zoom | Arène réduite à **896×504** (70 %, 16:9 conservé) | Les rayons d'entités sont en pixels-monde fixes : réduire l'arène les grossit de 1,4× à l'écran, tout en gardant l'aire de jeu entièrement visible |
| Paysage | Rotation CSS de 90° sur `#app` en portrait | Marche même quand la rotation système est verrouillée, cas très fréquent |
| Commande par défaut | Joystick | Ne dépend d'aucune permission ni d'aucun capteur |
| Composition des sources | **Une seule source active par pas** | Conserve la règle posée par `InputSource` ; le téléphone bouge fatalement quand le pouce tire sur le joystick, deux sources actives se voleraient la commande |
| Analogique | Nouveau champ `InputState.speedCap` | `maxSpeed × inputLen`, proposé par l'ancienne spec, figerait la souris (voir §5) |
| Portées des power-ups | Mises à l'échelle par 0,7 | Le Gel et la Ruée sont dimensionnés en *fraction d'arène* par leurs propres commentaires ; laisser leurs valeurs absolues leur ferait changer de nature |

## 1. Détection et arène réduite

`front/src/app/game.ts` interroge `matchMedia('(pointer: coarse)')` une fois au
démarrage et construit le monde en conséquence :

```ts
export const ARENA = { width: 1280, height: 720 } as const
export const ARENA_MOBILE = { width: 896, height: 504 } as const
```

C'est architecturalement gratuit : `createWorld({ seed, width, height })` prend
déjà les dimensions, la simulation lit `world.arena` partout, et `ARENA` n'est
qu'une valeur par défaut employée à cinq endroits hors tests.

Le HUD suit sans une ligne de code : il est positionné et mis à l'échelle par
`hud.setViewport` sur `viewport.scale`, qui passe de 0,55 à 0,78 sur un
téléphone en paysage — soit exactement les 1,4× attendus.

**La taille est fixée à la création du monde.** Un changement d'orientation ou de
classe de pointeur en pleine partie ne la change pas : une arène qui rétrécirait
en cours de partie téléporterait des ennemis hors du cadre.

## 2. Rotation en paysage

En portrait **et** pointeur grossier, `#app` reçoit ses dimensions inversées
(`width: 100vh; height: 100vw`) et une rotation CSS d'un quart de tour. Le canvas
et le calque `#ui` tournent ensemble : un seul point de bascule, et le
hit-testing des menus reste correct sans code de correspondance.

`applyLayout` passe alors les dimensions inversées à `stage.resize` — sans quoi
la résolution du canvas ne suit pas et le rendu est flou — puis à
`computeViewport`.

**Correction à l'ancienne spec.** Elle affirmait que « le navigateur transforme
lui-même les coordonnées de pointeur ». C'est vrai du hit-testing : un bouton
pivoté se clique au bon endroit. C'est faux de `event.clientX` / `event.clientY`,
qui restent exprimés dans le repère écran non transformé. La souris et le
joystick doivent donc appliquer la rotation inverse eux-mêmes.

### `front/src/app/orientation.ts` (nouveau)

Fonction pure partagée par la souris, le joystick et l'inclinaison :

```ts
/** 0, 1, 2 ou 3 quarts de tour horaires. Repère écran, `y` vers le bas. */
export type QuarterTurns = 0 | 1 | 2 | 3

export function rotateVector(x: number, y: number, quarters: QuarterTurns): { x: number; y: number }
```

Convention : `rotateVector(1, 0, 1)` vaut `{ x: 0, y: 1 }` — « vers la droite »
devient « vers le bas ».

## 3. Équilibrage : ce qui change d'échelle et ce qui n'en change pas

Réduire l'arène en gardant les rayons d'entités **est** le zoom : c'est
précisément parce que le joueur, les ennemis et les ramassages gardent leur
taille en pixels-monde qu'ils paraissent 1,4× plus gros. Les mettre à l'échelle
annulerait exactement l'effet recherché.

Mais certaines valeurs de `sim/data/powerups.ts` sont documentées comme des
**fractions d'arène**, pas comme des tailles :

- Le **Gel** a un rayon de 220, soit 440 px de diamètre. Le commentaire du
  fichier justifie ce chiffre par la hauteur : « 61 % de la hauteur […] au-delà,
  une prise au centre couvrirait du bord haut au bord bas et le placement
  cesserait d'exister. » Sur 504 px de haut, il en prendrait **87 %**, et un seul
  exemplaire de `freeze-radius` (×1,2) porterait le diamètre à 528 px — **plus
  que l'arène entière**.
- La **Ruée** couvre 480 px, décrits comme « 30 % de la largeur ». Sur 896 px de
  large : **54 %**.

Ces deux power-ups ne deviendraient pas plus forts, ils changeraient de nature :
la décision de placement qui les définit disparaîtrait.

**Règle.** Le monde porte un facteur dérivé de ses dimensions :

```ts
world.arena.rangeScale = world.arena.height / ARENA.height   // 1 au bureau, 0,7 en mobile
```

Il multiplie les **portées** — ce qu'un power-up atteint — et jamais les
**tailles** — ce qu'une entité occupe.

| Mis à l'échelle | Inchangé |
|---|---|
| `freeze.radius`, `freezeSpreadRadius` | Rayons de collision du joueur, des ennemis, des ramassages |
| `blast.maxRadius` et `growthRate` (les deux, pour conserver la durée d'expansion) | `dash.radius` (rayon meurtrier de la ruée : une hitbox) |
| `blotter.radius` | `tracingPaper.radius`, `thirstyPaper.radius` |
| `dash.speed` (la distance parcourue est `speed × durationMs`) | Toutes les durées, sans exception |
| Vitesses des projectiles `volley` et `splatter` | |

La classification exacte des cas limites — `blast.maxRadius` est-il une portée ou
une entité ? — est arrêtée dans le plan d'implémentation, valeur par valeur.

**Ce qui reste délibérément non mis à l'échelle :** les vitesses des ennemis et
du joueur. Sur une arène 30 % plus courte, un ennemi traverse l'écran en 30 % de
temps en moins, et le joueur aussi — les deux effets se compensent en partie pour
l'esquive. C'est un point de calibration à observer au playtest, pas une décision
à prendre à l'aveugle maintenant.

**Deux distances côté ennemis, jamais triées par la règle ci-dessus :**
`AMBUSH_MIN_DISTANCE = 180` et `SHARD_DASH_TRIGGER_DISTANCE = 260`
(`sim/data/enemies.ts`) sont des **distances**, pas des tailles d'entité — la
table ne les mentionne pas, et elles sont restées non mises à l'échelle par
omission plutôt que par décision explicite. Choix défendable, mais qui n'avait
encore jamais été écrit noir sur blanc :

- `SHARD_DASH_TRIGGER_DISTANCE` grandit relativement à une arène plus petite :
  la fraction de la surface couverte par le disque de déclenchement double à peu
  près sur mobile (≈ 23 % → ≈ 47 %), donc les Éclats (Shard) ruent beaucoup plus
  souvent — et une fois déclenchés, leur vitesse de ruée elle-même non mise à
  l'échelle (`SHARD_DASH_SPEED = 380 px/s`) couvre 68 % de la hauteur de l'arène
  mobile en une seconde, contre 47 % au bureau.
- `AMBUSH_MIN_DISTANCE` joue en sens inverse : 180 px valent 36 % de la hauteur
  mobile contre 25 % au bureau, donc les embuscades apparaissent
  proportionnellement plus loin du joueur sur mobile. Le miroir/clamp de
  placement garantit toujours au moins ~232 px sur une arène 896×504 — rien n'y
  dégénère.

Comme les vitesses ennemi et joueur ci-dessus, c'est un point à observer au
playtest plutôt qu'une décision tranchée ici : si l'équilibrage mobile paraît
faux, ces deux distances sont le premier endroit à regarder.

**Conséquence mineure acceptée :** `EDGE_MARGIN_PX = 40` dans
`front/src/app/achievements/trace.ts` reste absolu, donc la bande de bord est
proportionnellement plus large sur mobile et les succès « longer le mur »
deviennent un peu plus faciles. Noté, non corrigé.

## 4. Sources d'entrée

`MovementInput` passe de deux à quatre valeurs :

```ts
export type MovementInput = 'keyboard' | 'mouse' | 'joystick' | 'tilt'
```

`resolveMovementInput()` honore la valeur stockée si elle est valide ; à défaut,
le défaut dépend de l'appareil — `'joystick'` sur pointeur grossier, `'mouse'`
sinon.

**Une seule source est active par pas**, comme aujourd'hui. Le basculement des
Réglages reste binaire : il change simplement de paire selon la classe de
pointeur — joystick ↔ inclinaison sur téléphone, souris ↔ clavier ailleurs.

C'est un écart assumé avec l'ancienne spec, qui composait les trois sources par
magnitude maximale. Cette composition précède la règle « une source par pas »
posée depuis par `InputSource`, et elle a un défaut concret : le téléphone
s'incline forcément quand le pouce tire sur le joystick, donc l'inclinaison
volerait la commande.

### `front/src/app/joystick.ts` (nouveau)

Un halo semi-transparent ancré en bas à gauche montre où poser le pouce. Mais
tout contact dans le **quart inférieur gauche** de l'aire de jeu arme le joystick
à l'endroit du contact, et le halo s'y recentre : le repère visuel est là sans
qu'il faille viser, ce qui coûterait trop cher dans un jeu d'esquive.

Le halo est un élément DOM sous `#ui`, en `pointer-events-none` — il tourne donc
avec `#app` et n'intercepte rien. L'écoute se fait sur `#app`.

Cœur pur :

```ts
export function joystickVector(
  originX: number, originY: number,
  currentX: number, currentY: number,
  radius: number,
  quarters: QuarterTurns,
): { x: number; y: number }
```

Magnitude proportionnelle à la distance, saturée au rayon de référence. Les
coordonnées arrivent en repère écran : le vecteur passe par `rotateVector` avec
le quart de tour inverse.

### `front/src/app/tilt.ts` (nouveau)

Source : `deviceorientation` (`beta` avant-arrière, `gamma` gauche-droite).

- **Pose neutre capturée au début de chaque partie**, pas « à plat = neutre » :
  le joueur tient son téléphone comme il veut. Recentrage manuel dans les
  Réglages, contre la dérive gyroscopique.
- Zone morte à 3°, magnitude 1 atteinte à 20°. Un joueur au téléphone atteint
  donc la même vitesse maximale qu'au clavier : l'analogique est un confort, pas
  un avantage.
- **Correspondance d'axes : deux rotations à sommer.** Les quarts de tour à
  appliquer valent `screen.orientation.angle / 90` **plus** ceux de notre
  rotation CSS. La somme est nécessaire, pas décorative : un téléphone dont la
  rotation système est verrouillée garde `angle === 0` alors qu'il est
  physiquement couché, et c'est justement le cas que la rotation CSS existe pour
  servir.
- **Permission iOS.** `DeviceOrientationEvent.requestPermission()` exige un geste
  utilisateur et un contexte sécurisé. Le tap sur « Jouer » la porte : permission
  puis lancement, sans écran intermédiaire. Repli silencieux sur le joystick si
  elle est refusée ou s'il n'y a pas de gyroscope.

Cœur pur :

```ts
export function tiltToInput(
  deltaBeta: number,
  deltaGamma: number,
  quarters: QuarterTurns,
): { x: number; y: number }
```

Les deux sources quantifient à 1/128 avant d'écrire dans `InputState`, comme la
souris — prérequis du rejeu à l'identique.

## 5. Le plafond de vitesse — le seul changement de simulation

Une déflexion partielle du joystick, ou une inclinaison légère, doit donner
« moins vite », pas « accélère moins ».

Aujourd'hui `playerMovementSystem` n'applique la friction que si l'entrée est
nulle. Une déflexion à 50 % accélère à mi-régime mais atteint quand même la
vitesse maximale, simplement plus tard : la promesse analogique n'est pas tenue.

L'ancienne spec proposait `maxSpeed × min(1, inputLen)`. **Cela casserait la
souris** : `aimInput` renvoie délibérément une intensité plancher de 0,01 en
croisière — pour garder la commande et empêcher un battement contre la friction —
donc le point serait plafonné à 1 % de sa vitesse et se figerait sur place.

D'où un champ distinct :

```ts
export interface InputState {
  moveX: number
  moveY: number
  /** Plafond de vitesse, fraction de `maxSpeed`. 1 sauf joystick et inclinaison. */
  speedCap: number
}
```

Un seul usage dans la simulation, dans le clamp existant de
`sim/systems/player-movement.ts` :

```ts
const maxSpeed = Movement.maxSpeed[eid]! * world.input.speedCap
```

`createWorld` l'initialise à 1 ; le clavier et la souris ne l'écrivent jamais. Il
est quantifié à 1/128 comme les autres.

**Coordination requise.** `InputState` gagne un champ, donc le format d'entrées
rejouables aussi. La session qui construit l'architecture du leaderboard travaille
dans ce dépôt en parallèle : le champ doit être ajouté à leur format, pas
contourné. Le digest de `determinism.test.ts` ne devrait pas bouger — `speedCap`
vaut 1 dans tous les scénarios existants — mais c'est à vérifier, pas à supposer.

**Calibration à observer :** le plafond agit par le clamp, donc relâcher le
joystick fait tomber la vitesse d'un coup au lieu de décélérer. C'est réactif ;
si c'est trop sec sur appareil, la décélération devra passer par la friction.

## 6. Interface

### `--ui` piloté depuis JavaScript

La rampe vaut `clamp(18px, 1.4vh + 8px, 30px)` sur `#ui`. Sous rotation CSS,
`vh` désigne le côté **long** de l'écran : tout le texte serait dimensionné sur
le mauvais axe. `applyLayout` écrit donc `--ui` sur `#ui` à partir de la hauteur
**effective** de l'aire de jeu, avec la même formule.

Le plancher passe à ~22 px sur pointeur grossier : à 18 px, `ui-2xs` fait 10 px
sur un téléphone. La valeur exacte est un point de calibration.

L'invariant existant tient : le HUD n'emploie aucun utilitaire `ui-*` et reste
sur des tailles Tailwind fixes, puisqu'il est déjà mis à l'échelle par
`hud.setViewport`.

### Le reste

- **Cible de pause tactile** au coin **bas-droit** de l'arène, affichée seulement
  en pointeur grossier. Il n'y a pas d'`Échap` sur téléphone. Bas-droit et non
  haut : le HUD occupe déjà les trois zones hautes (score à gauche, temps au
  centre, record à droite), et le coin bas-droit est la position de repos du
  pouce droit — symétrique du joystick, en dehors de sa zone de capture.
- **Cibles ≥ 44 px** de haut sur les entrées de menu, les boutons `+` / `−` du
  volume et « retour ». Certaines font aujourd'hui 12 px de texte à 45 %
  d'opacité.
- **Cartes d'amélioration** en variante compacte sur pointeur grossier : trois
  cartes côte à côte sur les ~700×393 px réellement occupés par l'arène
  deviennent des colonnes trop étroites.
- **Vitrines succès et tracés :** commencer par vérifier ce qui fonctionne déjà.
  Un tap produit un clic, et les vitrines sont pilotables à la souris depuis
  9c4492b. Ne coder que le manquant — les affordances `hover:`, inertes au
  toucher, et l'atteignabilité du défilement au doigt.
- **Textes d'aide** tactiles à la place de « Échap », « flèches », en français et
  en anglais : les tests de parité i18n l'exigent.

## Flux de données

```
touchstart/touchmove ─> joystick.writeInto ─┐
deviceorientation ───> tilt.writeInto ──────┤─ une seule active ─> world.input
pointermove ─────────> mouse.writeInto ─────┤
keydown/keyup ───────> keyboard.writeInto ──┘

InputState { moveX, moveY, speedCap }
```

## Cas limites

| Cas | Comportement |
|---|---|
| Permission de mouvement refusée | Repli silencieux sur le joystick |
| Aucun gyroscope | Inclinaison indisponible, joystick d'emblée, entrée grisée dans les Réglages |
| Contexte non sécurisé (dev en `http://` sur IP locale) | Capteurs inaccessibles, joystick. À savoir pour tester |
| Rotation système déverrouillée | Le joueur tourne son téléphone, la fenêtre passe en paysage, la rotation CSS se désactive d'elle-même |
| Rotation en pleine partie | L'affichage suit, l'arène garde ses dimensions de départ |
| Téléphone reposé à plat en pleine partie | L'inclinaison retombe dans la zone morte, le joueur ralentit puis s'arrête |
| Doigt levé sur le joystick | Entrée nulle : la friction reprend, `Facing` garde son dernier cap |
| Second doigt posé pendant que le joystick est armé | Ignoré. Pas de multi-touch dans ce chantier |
| Tablette avec souris | `pointer: coarse` est faux, comportement bureau intégral |
| Valeur `movementInput` stockée incohérente avec l'appareil | Honorée si elle est l'une des quatre. La souris reste fonctionnelle au doigt (glisser), donc aucun blocage |

## Tests

- `orientation.test.ts` — `rotateVector` sur les quatre quarts de tour, et
  aller-retour par la rotation inverse.
- `joystick.test.ts` — origine au doigt posé, magnitude proportionnelle à la
  distance, saturation au rayon, correction de rotation.
- `tilt.test.ts` — zone morte sous 3° → vecteur nul ; saturation à 20° →
  magnitude 1 ; au-delà → toujours 1 ; somme des deux rotations d'axes ;
  quantification stable à 1/128.
- `player-movement.test.ts` — `speedCap` à 0,5 plafonne la vitesse à la moitié ;
  `speedCap` à 1 reproduit le comportement d'avant le changement (garde-fou de
  non-régression clavier et souris).
- `mouse.test.ts` — `screenToArena` sous rotation.
- `determinism.test.ts` — le digest de référence est inchangé.
- Tests de portée à l'échelle : une arène mobile donne un rayon de Gel de 154 et
  une distance de Ruée de 336, soit les mêmes fractions d'arène qu'au bureau.
- Parité i18n sur les nouvelles clés.
- Vérification visuelle en fenêtre de téléphone simulée (Chrome, viewport 852×393
  et 393×852) : cadrage, rotation, lisibilité des menus, halo du joystick.
- **Vérification manuelle par le propriétaire du projet, sur téléphone, sur
  l'URL HTTPS déployée** : calibration de la zone morte et de l'angle de
  saturation, sécheresse du plafond de vitesse, atteignabilité de la pause au
  pouce, équilibrage des portées mises à l'échelle.

## Risques

- **L'inclinaison ne peut pas être vérifiée depuis la session de
  développement** : pas d'appareil, et les capteurs exigent un contexte sécurisé.
  Les fonctions pures et le rendu pivoté sont testables ; la *sensation* ne l'est
  pas. Les valeurs 3° et 20° sont des points de départ. Ne jamais annoncer
  l'inclinaison comme vérifiée sur la seule foi des tests unitaires.
- **L'équilibrage mobile est neuf et non joué.** L'arène réduite change la
  difficulté par plusieurs canaux à la fois — moins d'espace d'esquive, temps de
  traversée plus court, portées remises à l'échelle. La première session de jeu
  réelle dira ce qu'il faut retoucher.
- **Travaux parallèles dans le dépôt.** La restructuration en workspaces et
  l'architecture du leaderboard avancent en même temps. Le champ `speedCap` et
  les chemins de fichiers sont les deux points de friction ; relire chaque
  fichier avant de le modifier, et ne jamais `git add -A`.
- **Rotation CSS et Pixi.** La résolution du canvas doit suivre les dimensions
  inversées, sans quoi le rendu est flou en portrait pivoté.
