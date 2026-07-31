import { Container, Graphics } from 'pixi.js'

import { INK } from '../ink'

export interface ReticleView {
  container: Container
  update(target: { x: number; y: number } | null): void
}

/** Longueur d'un bras, et vide laissé au centre pour ne pas masquer la cible. */
const ARM = 7
const GAP = 4

/** Remplace le curseur système, masqué pendant la partie : deux curseurs à l'écran prêteraient à confusion. */
export function createReticleView(): ReticleView {
  const container = new Container()
  const gfx = new Graphics()
  container.addChild(gfx)
  // Masqué tant que personne n'a poussé de cible : sans ça, un réticule
  // resterait posé à l'origine de l'arène avant le premier `update`.
  container.visible = false

  gfx
    .moveTo(-GAP - ARM, 0)
    .lineTo(-GAP, 0)
    .moveTo(GAP, 0)
    .lineTo(GAP + ARM, 0)
    .moveTo(0, -GAP - ARM)
    .lineTo(0, -GAP)
    .moveTo(0, GAP)
    .lineTo(0, GAP + ARM)
    .stroke({ color: INK.paper, width: 2, alpha: 0.7 })
  gfx.circle(0, 0, 1.5).fill({ color: INK.paper, alpha: 0.7 })

  return {
    container,
    update(target): void {
      container.visible = target !== null
      if (target !== null) {
        container.x = target.x
        container.y = target.y
      }
    },
  }
}
