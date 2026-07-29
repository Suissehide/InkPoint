import { Container, Graphics } from 'pixi.js'

import { INK } from '../ink'

export interface PlayerView {
  container: Container
  update(opts: {
    x: number
    y: number
    angle: number
    hasHalo: boolean
    invulnerable: boolean
  }): void
}

/** Le joueur : une pointe de plume orientée vers son déplacement. */
export function createPlayerView(): PlayerView {
  const container = new Container()
  const body = new Graphics()
  const halo = new Graphics()
  container.addChild(halo, body)

  body
    .moveTo(13, 0)
    .lineTo(-8, 9)
    .lineTo(-4, 0)
    .lineTo(-8, -9)
    .closePath()
    .fill({ color: INK.paper })

  halo.circle(0, 0, 17).stroke({ color: INK.paper, width: 2, alpha: 0.55 })

  return {
    container,
    update({ x, y, angle, hasHalo, invulnerable }) {
      container.x = x
      container.y = y
      container.rotation = angle
      halo.visible = hasHalo
      container.alpha = invulnerable && !hasHalo ? 0.55 : 1
    },
  }
}
