# Déplacement à la souris — design

**Date :** 2026-07-31

## Problème

Le déplacement n'existe qu'au clavier (`app/keyboard.ts`). Huit directions, aucun
dosage : impossible de viser un interstice entre deux ennemis, ni de se décaler
de quelques pixels. La spec de fond §3.2 dit d'ailleurs que « pendant la partie,
la souris ne sert à rien » — c'est cette phrase que ce lot vient contredire.

## Objectif

Offrir un déplacement à la souris qui donne 360° et le dosage, **sans toucher au
modèle de mouvement** : accélération, inertie, vitesse maximale, ruée et
orientation sur la vélocité restent identiques.

## Non-objectifs

- Le mobile (inclinaison, joystick, rotation en portrait) : lot séparé, déjà
  spécifié dans `2026-07-30-mobile-inclinaison-design.md`.
- Une action à la souris : les power-ups se déclenchent au ramassage, pas sur une
  entrée (spec §3.4). Aucun clic n'a de rôle en jeu.
- Le verrouillage de pointeur (`pointer lock`).
- Toute modification de `src/sim/` autre que l'usage qu'il fait déjà de
  `InputState`.

## Décisions

| Décision | Choix | Raison |
|---|---|---|
| Sémantique | Poursuite du curseur : direction joueur→curseur, intensité proportionnelle à la distance | Conserve intégralement le modèle de mouvement. Le curseur est une cible, pas une position imposée |
| Vitesse | Plafond inchangé (240 px/s) | La souris donne de la précision, jamais de la vitesse : sans ce plafond l'esquive n'a plus de coût |
| Choix de la source | Réglage explicite `Clavier` / `Souris`, **défaut Souris** | Un mode à la fois, un seul comportement à expliquer. Pas de bascule automatique : la souris ayant toujours une position, une composition permanente tirerait le point en continu |
| Cible visible | Réticule dessiné à l'encre | Le curseur système reste masqué en jeu (spec §3.2). Le jeu étant lui-même « un curseur », deux curseurs à l'écran prêteraient à confusion |
| Quantification | Entrées arrondies à 1/128 | La souris introduit le premier analogique du projet ; le netcode v3 exige des entrées rejouables à l'identique |

## Architecture

### Une interface commune, deux sources

```ts
export interface InputSource {
  writeInto(input: InputState, player: { x: number; y: number }): void
  destroy(): void
}
```

`keyboard.ts` s'y conforme en ignorant `player` : aucune ligne de sa logique ne
change. `game.ts` n'appelle **qu'une seule** source par pas, celle du réglage —
jamais les deux. Le lot mobile, quand il viendra, branchera ses propres sources
sur la même interface.

La simulation ne sait pas qu'une souris existe : elle continue de lire
`InputState { moveX, moveY }`.

### `src/app/mouse.ts` (nouveau)

Écoute `pointermove` sur `window` **en permanence**, écrans compris : le joueur
qui clique « Jouer » a déjà donné une position, et la partie démarre donc avec
une cible plutôt qu'à vide. Expose `setViewport()` — `game.ts` le rebranche
depuis `applyLayout`, comme `stage` et `hud`.

Deux fonctions pures en portent tout le comportement, testables sans DOM :

```ts
interface Point {
  x: number
  y: number
}

/** Position écran → coordonnées d'arène, bornées à l'arène. */
export function screenToArena(clientX: number, clientY: number, viewport: Viewport): Point

/** Poursuite : direction joueur→cible, intensité selon la distance, quantifiée. */
export function aimInput(player: Point, target: Point): { moveX: number; moveY: number }
```

Le bornage n'est pas cosmétique : l'arène est cadrée en letterbox
(`computeViewport`), et sans lui un curseur posé dans la marge tirerait le point
vers un point hors du cadre qu'il ne peut pas atteindre.

### Constantes

| Constante | Valeur | Raison |
|---|---|---|
| Rayon de plein régime | 32 px | Le point freine en `v²/2a` = 240²/(2×2667) ≈ 11 px. 32 px laisse la marge de freinage sans amollir la course : au-delà, plein régime ; en deçà, l'intensité décroît et le point se pose sur la cible au lieu de la dépasser en oscillant |
| Zone morte | 3 px | Sous ce seuil l'entrée est nulle : la friction immobilise le point net, et `Facing` conserve son dernier cap (`FACING_MIN_SPEED`) au lieu de frémir |

Valeurs de première passe, à régler en jouant — comme le reste des nombres de
`src/sim/data/` (README, « Known limitations »).

### Le réticule

Il ne transite pas par la simulation : `game.ts` appelle
`stage.setAimTarget(x, y)` — ou `null` — depuis `onRender`, et
`src/render/views/reticle.ts` le dessine à l'encre sous le filtre *boil*, comme
le reste de l'arène. Le rendu continue de ne jamais écrire dans la simulation.

**Visible exactement quand le curseur système est masqué** (états `playing` et
`dying`), en mode Souris, et une cible connue. Pause, choix de carte et game over
le font disparaître avec le reste.

### Le réglage

Quatrième ligne de `settings.ts`, `Déplacement : Clavier / Souris`, sur le modèle
exact de `Mouvement réduit` : bascule au clic comme aux flèches, persistée par
`storage.set('movementInput', …)`, remontée à `game.ts` par un callback de
`SettingsDeps`. `ROW_COUNT` passe de 4 à 5. Deux clés i18n de chaque côté
(`fr.json`, `en.json`) — la parité est déjà vérifiée par `parity.test.ts`.

Défaut : `souris`.

`Échap`, la navigation des écrans et la pause ne passent pas par `writeInto` :
ils sont routés séparément dans `game.ts` et fonctionnent identiquement dans les
deux modes.

## Flux de données

```
pointermove (window)
  → mouse.ts : dernière position écran
  → screenToArena(…, viewport)          [borné à l'arène]
  → aimInput(position joueur, cible)     [zone morte, rayon, quantification 1/128]
  → InputState { moveX, moveY }
  → playerMovementSystem                 [inchangé]

game.ts onRender → stage.setAimTarget(cible | null) → views/reticle.ts
```

## Cas limites

Aucun ne demande de code spécial :

- **Aucun `pointermove` reçu** — cible `null`, entrée nulle, pas de réticule. La
  partie démarre immobile jusqu'au premier mouvement de souris.
- **Le curseur quitte la fenêtre** — la dernière cible tient ; le point la
  rejoint et s'y arrête. Rien à réinitialiser.
- **Changement de mode en pleine partie** — la vélocité en cours n'est pas
  touchée, la friction reprend la main. Passer en Souris récupère la dernière
  position connue du pointeur.
- **Curseur confondu avec le joueur** — distance nulle : la zone morte rend
  l'entrée nulle avant tout calcul d'angle, donc jamais d'`atan2(0, 0)`.
- **Ruée en cours** — `playerMovementSystem` ignore déjà l'entrée tant que
  `Dashing` est posé (spec §3.4). La souris n'y change rien.
- **Redimensionnement de la fenêtre** — `applyLayout` repousse le viewport à
  `mouse.ts` ; la conversion suit le nouveau zoom au pas suivant.

## Tests

Sur les fonctions pures, sans DOM :

- `aimInput` — plein régime au-delà du rayon ; décroissance proportionnelle en
  deçà ; zéro dans la zone morte ; magnitude jamais > 1 ; cible confondue avec le
  joueur ; sorties toutes multiples de 1/128.
- `screenToArena` — centre de la fenêtre, sous zoom ≠ 1, et bornage d'un point
  situé dans la marge du letterbox.

Le reste ne bouge pas : `keyboard.ts` garde ses tests, `parity.test.ts` couvre
les nouvelles clés i18n, `purity.test.ts` continue d'interdire au monde simulé
toute référence au navigateur.

**Limite de vérification :** le ressenti — 32 px et 3 px — ne se prouve pas au
test unitaire. Il se règle en jouant (`npm run dev`). Ne jamais annoncer ces deux
valeurs comme validées sur la seule foi des tests.

## Documentation à corriger

- `README.md` — table des commandes : la souris devient un mode de déplacement.
- `docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md` §3.2 — la phrase
  « pendant la partie, la souris ne sert à rien » devient fausse. Le curseur
  système reste masqué (c'est le réticule qui le remplace) ; c'est cette nuance
  qu'il faut écrire, pas une suppression sèche.

## Risques

- **Le mode Souris par défaut sur une machine sans souris.** Le jeu démarrerait
  immobile. Le mobile est hors périmètre ici, et son lot dédié posera ses propres
  sources ; le réglage Clavier reste accessible d'un clic ou au clavier seul.
- **Réticule et point trop éloignés.** À 240 px/s dans une arène de 1280 px, le
  curseur devance largement le point. C'est voulu — c'est ce qui préserve le coût
  de l'esquive — mais c'est le premier point à juger en jouant.
