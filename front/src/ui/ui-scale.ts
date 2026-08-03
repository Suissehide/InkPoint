/** Plancher au bureau : au-dessus de l'existant, pas à son niveau (cf. `main.css`). */
const FLOOR_FINE = 18
/**
 * Plancher au doigt. Un téléphone en paysage fait ~393 px de haut, donc la
 * rampe y est au plancher quoi qu'il arrive : c'est ce nombre, et lui seul,
 * qui décide de la lisibilité des menus sur mobile. À 18, `ui-2xs` (×0,58)
 * tombe à 10 px.
 */
const FLOOR_COARSE = 22
/** Plafond pour la 4K : passé une certaine taille, agrandir ne rend plus rien plus lisible. */
const CEILING = 30

/**
 * Ce que valait `clamp(18px, 1.4vh + 8px, 30px)`, mais calculé sur la hauteur
 * **effective** de l'aire de jeu plutôt que sur `vh`.
 *
 * La différence n'est pas cosmétique : sous la rotation CSS de `#app`, `vh`
 * désigne le côté long de l'écran physique, donc la rampe se calerait sur la
 * mauvaise dimension et tout le texte serait faux en portrait pivoté.
 */
export function uiScalePx(opts: { viewHeight: number; coarsePointer: boolean }): number {
  const floor = opts.coarsePointer ? FLOOR_COARSE : FLOOR_FINE
  return Math.min(CEILING, Math.max(floor, opts.viewHeight * 0.014 + 8))
}
