# Mobile : rotation, inclinaison et joystick — design

> **CADUQUE — jamais implémentée.** Remplacée le 2026-08-03 par
> `2026-08-03-mobile-paysage-joystick-design.md`, qui corrige deux erreurs de
> ce document : `event.clientX/clientY` **ne sont pas** transformés par la
> rotation CSS (seul le hit-testing l'est), et le plafond
> `maxSpeed × min(1, inputLen)` figerait la souris, dont l'intensité de
> croisière vaut 0,01. Conservée pour l'historique.

**Date :** 2026-07-30
**Lot :** 2 sur 2. **Dépend du lot 1** (`2026-07-30-arene-fixe-design.md`) : la
rotation s'applique au conteneur viewport qui n'existe pas encore.

## Problème

Le jeu n'est pas jouable sur téléphone. Les seules commandes sont ZQSD, WASD et
les flèches (`app/keyboard.ts`), et `Échap` pour la pause. En portrait, une
arène 16:9 réduite pour tenir dans l'écran donne une bande de jeu minuscule.

## Objectif

Rendre le jeu jouable sur téléphone, sans jamais changer l'arène — donc sans
céder sur l'équité obtenue au lot 1.

## Non-objectifs

- Une interface mobile repensée. Les écrans acceptent déjà le pointeur, un tap
  est un clic.
- Le multi-touch, les gestes, le retour haptique.
- Une géométrie particulière pour le téléphone en paysage : après le lot 1
  l'arène y remplit déjà l'écran, la rotation ne concerne que le portrait.
  L'inclinaison et le joystick, eux, s'appliquent dans les deux orientations.

## Décisions

| Décision | Choix | Raison |
|---|---|---|
| Portrait | Rotation de 90° de l'ensemble `#app` | Conserve exactement la même arène, donc zéro perte d'équité, et le joueur tourne son téléphone même si la rotation système est verrouillée |
| Commande principale | Inclinaison de l'appareil | Demande explicite |
| Sémantique de l'inclinaison | Inclinaison → **vitesse** (plafond proportionnel), pas accélération | Sans ça, toute inclinaison maintenue finit à la vitesse maximale : « plus ou moins vite » ne serait pas tenu |
| Repli | Joystick virtuel flottant | Permission refusée, absence de gyroscope, ou préférence du joueur |
| Composition des sources | Magnitude la plus forte | Une source au repos ne doit jamais annuler une autre |

## Architecture

### Rotation en portrait

Une transformation CSS `rotate(90deg)` sur `#app`, qui contient déjà le canvas
**et** le calque DOM `#ui`. Un seul point de bascule : le canvas comme les
menus tournent ensemble, et le navigateur transforme lui-même les coordonnées
de pointeur — la navigation au doigt dans les menus continue de fonctionner
sans code de correspondance.

`computeViewport` (lot 1) reçoit les dimensions inversées lorsque la rotation
est active.

**Condition d'activation :** portrait **et** pointeur grossier
(`matchMedia('(pointer: coarse)')`). Sans la seconde condition, une fenêtre de
bureau étroite et haute se mettrait à pivoter.

### `src/app/orientation.ts` (nouveau)

```ts
/** 0, 1, 2 ou 3 quarts de tour appliqués à l'affichage. */
export type QuarterTurns = 0 | 1 | 2 | 3

export function rotateVector(x: number, y: number, quarters: QuarterTurns): { x: number; y: number }
```

Fonction pure, partagée par l'inclinaison et le joystick : les deux reçoivent
des mesures en repère écran et doivent les ramener dans le repère de l'arène.

### `src/app/tilt.ts` (nouveau)

Même forme que `keyboard.ts`, pour que `game.ts` ignore l'origine de
l'intention :

```ts
export interface Tilt {
  readonly available: boolean
  requestPermission(): Promise<boolean>
  /** Capture la pose courante comme neutre. */
  recentre(): void
  writeInto(input: InputState): void
  destroy(): void
}
```

- Source : événement `deviceorientation` (`beta` avant/arrière, `gamma`
  gauche/droite).
- **Pose neutre capturée au début de chaque run**, pas « à plat = neutre » : le
  joueur tient son téléphone comme il veut. Recentrage accessible depuis les
  Réglages.
- Zone morte à 3°, magnitude 1 atteinte à 20° — un joueur au téléphone atteint
  donc la même vitesse maximale qu'au clavier. L'analogique est un confort, pas
  un avantage.
- Correction d'axes via `rotateVector`, en tenant compte de la rotation CSS et
  de `screen.orientation.angle`.
- Quantification à 1/128 avant écriture dans `InputState`, pour qu'un flux
  d'entrées reste rejouable à l'identique.

Cœur pur et testable sans appareil :

```ts
export function tiltToInput(
  deltaBeta: number,
  deltaGamma: number,
  quarters: QuarterTurns,
): { x: number; y: number }
```

**Permission iOS.** `DeviceOrientationEvent.requestPermission()` exige un geste
utilisateur et un contexte sécurisé. Le tap sur « Jouer » porte la demande :
permission puis lancement de la run, sans écran intermédiaire. Le déploiement
est en HTTPS (`deploy/compose.yaml`), la condition est remplie en production.

### `src/app/joystick.ts` (nouveau)

Même interface `writeInto(input)`. Joystick **flottant** : le doigt se pose où
il veut sur l'arène et ce point devient l'origine ; le vecteur de traîne donne
direction et magnitude, saturée à un rayon de référence. Dans un jeu d'esquive,
viser une base dessinée coûte trop cher.

Cœur pur :

```ts
export function joystickVector(
  originX: number, originY: number,
  currentX: number, currentY: number,
  radius: number,
  quarters: QuarterTurns,
): { x: number; y: number }
```

Les coordonnées tactiles arrivent en espace écran, pas dans le repère pivoté :
le vecteur passe par `rotateVector` avec le quart de tour inverse.

**Activation :** repli automatique si l'inclinaison est indisponible ou
refusée, plus une entrée « Commandes : inclinaison / joystick » dans les
Réglages pour le forcer. Le surcoût est nul et ça permet de tester le chemin
tactile sans dépendre de l'état d'une permission.

### `src/app/game.ts`

Les trois sources écrivent à tour de rôle dans un `InputState` temporaire ;
`game.ts` retient celle de plus forte magnitude, puis l'écrit dans
`world.input`. Aucune source ne peut annuler une autre.

### `src/sim/systems/player-movement.ts`

Le plafond de vitesse devient `maxSpeed × min(1, inputLen)`.

C'est la **seule** modification de la simulation. Le clavier envoie toujours une
magnitude de 0 ou 1 (la diagonale est déjà normalisée), donc son comportement
est inchangé — à confirmer contre `src/sim/determinism.test.ts` et
`src/sim/systems/player-movement.test.ts`, qui scriptent des entrées.

### Pause au doigt

Pas de `Échap` sur téléphone : une cible tactile de pause en haut de l'arène,
affichée seulement en pointeur grossier.

## Flux de données

```
deviceorientation ──> tilt.writeInto ─┐
touchmove ──────────> joystick.writeInto ─┤─> magnitude max ─> world.input
keydown/keyup ──────> keyboard.writeInto ─┘

InputState { moveX, moveY }  (inchangé : la sim est déjà analogique)
```

## Cas limites

| Cas | Comportement |
|---|---|
| Permission de mouvement refusée | Repli silencieux sur le joystick |
| Aucun gyroscope | `available = false`, joystick d'emblée |
| Contexte non sécurisé (dev en `http://` sur IP locale) | Capteurs inaccessibles, joystick. À savoir pour tester |
| Rotation système déverrouillée | Le joueur tourne son téléphone, la fenêtre passe en paysage, la rotation CSS se désactive d'elle-même |
| Téléphone reposé à plat en pleine run | L'inclinaison retombe dans la zone morte, le joueur ralentit puis s'arrête |
| Clavier branché sur tablette | Les trois sources coexistent, la plus forte gagne |

## Tests

- `orientation.test.ts` : `rotateVector` sur les quatre quarts de tour,
  aller-retour inverse.
- `tilt.test.ts` : zone morte sous 3° → vecteur nul ; saturation à 20° →
  magnitude 1 ; au-delà → toujours 1 ; correspondance des axes par quart de
  tour ; quantification à 1/128 stable.
- `joystick.test.ts` : origine au doigt posé, magnitude proportionnelle à la
  distance, saturation au rayon, correction de rotation.
- `player-movement.test.ts` : magnitude 0,5 → vitesse plafonnée à la moitié ;
  magnitude 1 → comportement identique à avant le changement (garde-fou de
  non-régression clavier).
- Vérification manuelle **par le propriétaire du projet**, sur téléphone, sur
  l'URL HTTPS déployée : calibration de la zone morte et de l'angle de
  saturation, lisibilité en portrait pivoté, cible de pause atteignable au
  pouce.

## Risques

- **Impossible à vérifier depuis la session de développement.** Pas de
  téléphone. Les fonctions pures et le rendu pivoté (fenêtre portrait simulée)
  sont testables ; la *sensation* d'inclinaison ne peut être calibrée que sur
  appareil réel. Les valeurs 3° et 20° sont des points de départ à ajuster.
- **Dérive du gyroscope.** Certains appareils dérivent lentement. Le
  recentrage au début de chaque run limite l'exposition ; un recentrage manuel
  reste disponible dans les Réglages.
- **Rotation CSS et Pixi.** La résolution du canvas doit suivre les dimensions
  inversées, sans quoi le rendu est flou en portrait pivoté.
