import { Container, Graphics } from 'pixi.js'

import { INK } from './ink'

export interface Frame {
  readonly container: Container
  resize(width: number, height: number): void
}

/**
 * Trait d'encre sur le pourtour de l'aire de jeu. Il rend le mur visible : le
 * joueur s'y bloque, mais rien ne le signalait jusqu'ici.
 */
export function createFrame(): Frame {
  const container = new Container()
  const gfx = new Graphics()
  container.addChild(gfx)

  const redraw = (w: number, h: number): void => {
    gfx.clear()
    gfx.rect(0.75, 0.75, w - 1.5, h - 1.5).stroke({ color: INK.paper, width: 1.5, alpha: 0.18 })
  }

  return {
    container,
    resize(width, height): void {
      redraw(width, height)
    },
  }
}
