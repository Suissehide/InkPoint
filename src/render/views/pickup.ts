import { Container, Graphics } from 'pixi.js'

import { INK } from '../ink'

export interface PickupView {
  container: Container
  update(opts: { x: number; y: number; pulse: number }): void
}

export function createPickupView(): PickupView {
  const container = new Container()
  const gfx = new Graphics()
  container.addChild(gfx)
  gfx.circle(0, 0, 11).stroke({ color: INK.paper, width: 2 })
  gfx.circle(0, 0, 4).fill({ color: INK.paper })

  return {
    container,
    update({ x, y, pulse }) {
      container.x = x
      container.y = y
      container.scale.set(1 + Math.sin(pulse) * 0.08)
    },
  }
}
