/**
 * Quarts de tour HORAIRES, repère écran (`y` vers le bas).
 * `rotateVector(1, 0, 1)` vaut `{ x: 0, y: 1 }` : « vers la droite » devient
 * « vers le bas ». Les quatre valeurs existent pour le lot 2, où
 * `screen.orientation.angle` peut valoir 180 ou 270.
 */
export type QuarterTurns = 0 | 1 | 2 | 3

/**
 * Ce que l'affichage peut produire, et rien de plus : on ne pivote qu'en
 * portrait, jamais de 180° ni de 270°. Type distinct pour que `screenToApp`,
 * qui ne sait traiter que ces deux cas, ne puisse pas recevoir les autres.
 */
export type DisplayQuarters = 0 | 1

/** L'état d'affichage dont dépend toute conversion écran → arène. */
export interface Display {
  quarters: DisplayQuarters
  windowWidth: number
  windowHeight: number
}

const COS: readonly number[] = [1, 0, -1, 0]
const SIN: readonly number[] = [0, 1, 0, -1]

/**
 * Rotation exacte : table de cosinus/sinus plutôt que `Math.cos` — sur des
 * multiples de 90°, la trigonométrie flottante rend 6,1e-17 au lieu de 0, et
 * un vecteur d'entrée censé être purement horizontal repartirait avec une
 * composante verticale minuscule mais non nulle.
 *
 * Aucun appelant en production pour l'instant : la souris et le joystick
 * résolvent leur rotation via `screenToApp` (une transformation de point), pas
 * celle-ci (une transformation de vecteur). Cette fonction existe pour le
 * lot 2, où la source d'inclinaison (`tilt.ts`) lira `screen.orientation.angle`
 * et devra faire pivoter un vecteur, pas un point.
 */
export function rotateVector(
  x: number,
  y: number,
  quarters: QuarterTurns,
): { x: number; y: number } {
  const c = COS[quarters] ?? 1
  const s = SIN[quarters] ?? 0
  return { x: x * c - y * s, y: x * s + y * c }
}

/**
 * Un quart de tour en portrait, et seulement sur pointeur grossier : sans
 * cette seconde condition, une fenêtre de bureau étroite et haute se mettrait
 * à pivoter. Une fenêtre carrée ne pivote pas — il n'y a rien à y gagner.
 */
export function resolveDisplayQuarters(opts: {
  coarsePointer: boolean
  windowWidth: number
  windowHeight: number
}): DisplayQuarters {
  return opts.coarsePointer && opts.windowHeight > opts.windowWidth ? 1 : 0
}

/**
 * Coordonnées de pointeur (`event.clientX/clientY`, toujours en repère écran)
 * vers le repère local de `#app`.
 *
 * Nécessaire parce que le navigateur ne transforme PAS `clientX`/`clientY` :
 * il transforme le hit-testing — un bouton pivoté se clique au bon endroit —
 * mais les coordonnées restent celles de l'écran. Sans cette conversion, le
 * joystick et la souris viseraient à 90° du doigt.
 *
 * `#app` est pivoté par `translateX(windowWidth) rotate(90deg)` avec origine
 * au coin haut-gauche : un point local (ax, ay) s'affiche en
 * (windowWidth − ay, ax). Ce qui suit en est l'inverse.
 */
export function screenToApp(
  clientX: number,
  clientY: number,
  display: Display,
): { x: number; y: number } {
  if (display.quarters === 1) {
    return { x: clientY, y: display.windowWidth - clientX }
  }
  return { x: clientX, y: clientY }
}
