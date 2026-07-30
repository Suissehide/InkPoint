# Arène fixe et cadrage — design

**Date :** 2026-07-30
**Lot :** 1 sur 2 (le lot 2, « mobile : inclinaison et joystick », dépend de celui-ci)

## Problème

L'arène de simulation est la fenêtre du navigateur : `createRun()` passe
`window.innerWidth / innerHeight` à `createWorld`. La difficulté dépend donc de
la taille de la fenêtre :

- les ennemis apparaissent sur les bords de l'arène (`sim/systems/waves.ts`,
  `edgeOrigin`) et leur nombre par vague est fixe — une grande fenêtre dilue la
  même quantité d'ennemis dans plus d'espace ;
- le joueur est clampé aux murs de l'arène (`sim/systems/integration.ts`), donc
  une petite fenêtre réduit l'espace d'esquive ;
- la portée de l'onde de choc vaut la diagonale de l'arène
  (`sim/powerups/activate.ts`), elle grandit donc avec la fenêtre ;
- l'écouteur `resize` réécrit `world.arena` **pendant** une run
  (`app/game.ts`) : redimensionner change la difficulté à chaud.

Conséquence secondaire : une graine ne décrit pas une partie. Deux joueurs à
même graine mais fenêtres différentes ne vivent pas la même run, ce qui
contredit le déterminisme revendiqué ailleurs dans le dépôt (prérequis du
netcode v3).

## Objectif

Une arène strictement identique pour tous, quelle que soit la fenêtre. Seul le
facteur de zoom varie.

## Non-objectifs

- Réquilibrer les vagues. L'arène de référence est un peu plus large que la
  fenêtre typique actuelle (~1300×900), donc légèrement plus permissive. On
  observe en jouant avant de toucher aux courbes de difficulté.
- Effacer les meilleurs scores existants, obtenus sur des arènes de tailles
  variables. Ils sont conservés tels quels.
- Le mobile (rotation en portrait, inclinaison, joystick) : lot 2.

## Décisions

| Décision | Choix | Raison |
|---|---|---|
| Géométrie | Arène logique fixe, zoom uniforme pour tenir dans la fenêtre (*fit*) | Le recadrage (*cover*) cacherait des bords d'où naissent les ennemis et contre lesquels le joueur se bloque ; l'étirement rendrait les cercles ovales et l'esquive asymétrique |
| Taille de référence | `1600 × 900` (16:9) | Ratio de la quasi-totalité des écrans : marge nulle en plein écran ou fenêtre maximisée |
| Marge résiduelle | Marge de page assumée, avec un cadre d'encre autour de l'aire de jeu | Se lit comme intentionnel plutôt que comme des bandes noires, et rend enfin le mur visible |
| HUD | Calé sur le rectangle de l'arène, mis à l'échelle avec elle | Position du score identique pour tous par rapport au terrain ; la marge reste vide |

## Architecture

### `src/sim/world.ts`

Exporte `ARENA = { width: 1600, height: 900 }`. La simulation reste
paramétrable (`createWorld({ width, height })` est inchangé, les tests
continuent de passer leurs propres dimensions) ; c'est l'appelant qui cesse de
lui donner la taille de la fenêtre.

### `src/render/viewport.ts` (nouveau)

```ts
export interface Viewport {
  scale: number
  x: number
  y: number
}

export function computeViewport(
  windowWidth: number,
  windowHeight: number,
  arenaWidth: number,
  arenaHeight: number,
): Viewport
```

`scale = min(windowWidth / arenaWidth, windowHeight / arenaHeight)`, arène
centrée dans la fenêtre. Fonction pure, sans accès au DOM — donc testée
unitairement comme `camera.ts` et `interpolate.ts` le sont déjà.

### `src/render/stage.ts`

Un `Container` « viewport » devient le parent du calque des entités, du calque
des particules et du cadre. Il porte `scale` et `position` issus de
`computeViewport`. Trois ajustements en découlent :

1. **Masque.** Un masque rectangulaire `0,0,1600,900` sur ce conteneur. Sans
   lui, les ennemis qui apparaissent à 40 px hors de l'arène (`edgeOrigin`) se
   dessineraient dans la marge.
2. **Vignette.** Elle passe de `app.stage` (plein écran) au conteneur viewport,
   pour que l'assombrissement des bords et la teinte de danger épousent le
   terrain et non la fenêtre. Le grain reste sur `app.stage` : la marge est la
   page, elle a droit à son grain de papier.
3. **Particules.** Elles positionnent leurs `Graphics` en coordonnées monde
   (`render/particles.ts`), elles doivent donc vivre sous le conteneur
   viewport, sans quoi les éclaboussures se décaleraient du zoom.

La secousse d'écran reste appliquée au calque des entités, comme aujourd'hui :
elle est indépendante de la transformation de cadrage.

`resize(width, height)` redimensionne le renderer **et** recalcule la
transformation du viewport.

### `src/render/frame.ts` (nouveau)

Un `Graphics` tracé sur le pourtour `0,0,1600,900`, ajouté au conteneur
viewport au-dessus des entités : un trait d'encre dans le vocabulaire visuel du
jeu. Il matérialise le mur, aujourd'hui invisible.

### `src/app/game.ts`

- `createRun()` passe `ARENA.width / ARENA.height` à `createWorld`.
- L'écouteur `resize` ne touche plus `world.arena`. Il appelle `stage.resize` et
  repositionne la boîte du HUD.
- La difficulté cesse donc de varier en cours de partie.

### `src/ui/screens/hud.ts`

Le conteneur du HUD reçoit la position et la taille du rectangle de l'arène en
px CSS, plus `transform: scale(z)` avec `transform-origin` en haut à gauche sur
une boîte interne de 1600×900. Les chiffres suivent l'échelle du terrain. API
ajoutée : `setViewport(viewport: Viewport)`.

Les écrans (menu, cartes de fin de vague, pause, game over, réglages) restent
plein fenêtre, inchangés.

## Flux de données

```
window resize
  └─> game.ts : computeViewport(innerWidth, innerHeight, 1600, 900)
        ├─> stage.resize()  → renderer + transformation du conteneur viewport
        └─> hud.setViewport() → position, taille et échelle de la boîte DOM

boucle à pas fixe (inchangée)
  └─> stepWorld(world)  → world.arena est désormais constant
```

## Cas limites

| Cas | Comportement |
|---|---|
| Fenêtre exactement 16:9 | Marge nulle |
| Ultralarge (21:9) | Marge à gauche et à droite |
| Portrait | Marge en haut et en bas ; l'arène devient une bande. Traité correctement au lot 2 pour le mobile |
| Fenêtre minuscule | Tout rétrécit ; aucun débordement, aucun plancher de zoom |
| Redimensionnement en pleine run | Le zoom change, la difficulté ne change pas |

## Tests

- `src/render/viewport.test.ts` : ratio identique → marge nulle et `scale`
  attendu ; ultralarge → marge horizontale, `y = 0` ; portrait → marge
  verticale, `x = 0` ; fenêtre minuscule → `scale < 1` sans débordement ;
  centrage exact dans les quatre cas.
- Les tests de simulation existants sont insensibles au changement : ils
  passent leurs propres dimensions à `createWorld`.
- Vérification manuelle : arène identique en fenêtre 16:9, ultralarge et
  portrait ; aucun ennemi visible dans la marge (le masque) ; le HUD reste
  collé à l'arène au redimensionnement.

## Risques

- **Masque et filtres Pixi.** Un masque combiné à des filtres sur le même
  conteneur peut mal se composer dans Pixi v8. Si c'est le cas, le repli est un
  masque sur un conteneur parent distinct de celui qui porte les filtres.
- **Ressenti de difficulté.** ~23 % de largeur en plus qu'aujourd'hui à nombre
  d'ennemis constant. Assumé, mesuré en jouant, corrigé plus tard si besoin.
