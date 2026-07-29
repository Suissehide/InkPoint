import { Container, Graphics } from 'pixi.js'

import { INK } from '../ink'

export interface EnemyView {
  container: Container
  update(opts: {
    x: number
    y: number
    radius: number
    materializeProgress: number
    frozen: boolean
  }): void
}

/**
 * Un ennemi = un disque plein rouge. Pendant l'apparition, il est dessiné en
 * pointillé avec un anneau qui se resserre : « pointillé = inoffensif, plein =
 * mortel » est la règle de lecture centrale du jeu (spec §3.3).
 */
export function createEnemyView(): EnemyView {
  const container = new Container()
  const body = new Graphics()
  const ring = new Graphics()
  container.addChild(body, ring)

  let lastKey = ''

  return {
    container,
    update({ x, y, radius, materializeProgress, frozen }) {
      container.x = x
      container.y = y

      const key = `${radius.toFixed(1)}|${materializeProgress.toFixed(2)}|${frozen}`
      if (key === lastKey) {
        return
      }
      lastKey = key

      body.clear()
      ring.clear()

      const color = frozen ? INK.frost : INK.danger

      if (materializeProgress < 1) {
        // Contour pointillé qui respire + anneau de compte à rebours.
        const segments = 10
        for (let i = 0; i < segments; i++) {
          const a0 = (i / segments) * Math.PI * 2
          const a1 = a0 + Math.PI / segments
          body.moveTo(Math.cos(a0) * radius, Math.sin(a0) * radius)
          body.arc(0, 0, radius, a0, a1)
        }
        body.stroke({ color, width: 1.6, alpha: 0.25 + materializeProgress * 0.5 })
        body.circle(0, 0, radius).fill({ color, alpha: materializeProgress * 0.8 })

        const ringRadius = radius + (1 - materializeProgress) * radius * 1.4
        ring.circle(0, 0, ringRadius).stroke({ color, width: 1.2, alpha: 0.5 })
      } else {
        body.circle(0, 0, radius).fill({ color })
      }
    },
  }
}
