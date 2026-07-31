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

/**
 * La silhouette de la pointe de plume, à l'origine et pointant vers +x.
 * Exportée parce que les images rémanentes de la ruée (`fx/afterimage.ts`) la
 * dessinent aussi : un fantôme qui ne ressemble pas au joueur ne se lit pas
 * comme sa trace, et deux copies du même tracé finissent toujours par diverger.
 */
export function drawNib(gfx: Graphics, color: number): void {
  gfx.moveTo(13, 0).lineTo(-8, 9).lineTo(-4, 0).lineTo(-8, -9).closePath().fill({ color })
}

/** Le joueur : une pointe de plume orientée vers son déplacement. */
export function createPlayerView(): PlayerView {
  const container = new Container()
  const body = new Graphics()
  const halo = new Graphics()
  container.addChild(halo, body)

  drawNib(body, INK.paper)

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
