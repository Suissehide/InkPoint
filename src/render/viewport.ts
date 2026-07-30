/** Zoom et décalage de l'arène dans la fenêtre. */
export interface Viewport {
  scale: number
  x: number
  y: number
}

/**
 * Cadre l'arène dans la fenêtre en conservant son ratio : le zoom est le plus
 * petit des deux rapports, ce qui laisse une marge sur l'axe le moins
 * contraignant plutôt que de rogner l'aire de jeu.
 */
export function computeViewport(
  windowWidth: number,
  windowHeight: number,
  arenaWidth: number,
  arenaHeight: number,
): Viewport {
  const scale = Math.min(windowWidth / arenaWidth, windowHeight / arenaHeight)
  return {
    scale,
    x: (windowWidth - arenaWidth * scale) / 2,
    y: (windowHeight - arenaHeight * scale) / 2,
  }
}
