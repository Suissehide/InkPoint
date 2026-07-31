import { Container, Graphics } from 'pixi.js'

import { INK, mixColor } from '../ink'

export interface EnemyView {
  container: Container
  update(opts: {
    x: number
    y: number
    radius: number
    materializeProgress: number
    frozen: boolean
    /** 0 = couleur normale, 1 = papier (temps d'arrêt de la mort). */
    whiten: number
  }): void
}

/** Ce qui est affiché est ce qui tue : « pointillé = inoffensif, plein = mortel » pendant l'apparition. */
export function createEnemyView(): EnemyView {
  const container = new Container()
  const body = new Graphics()
  const ring = new Graphics()
  container.addChild(body, ring)

  let lastKey = ''

  return {
    container,
    update({ x, y, radius, materializeProgress, frozen, whiten }) {
      container.x = x
      container.y = y

      // Le blanchiment fait partie de la clé : sans lui, le cache renverrait le
      // dessin précédent et l'animation de mort ne se verrait jamais.
      const key = `${radius.toFixed(1)}|${materializeProgress.toFixed(2)}|${frozen}|${whiten.toFixed(2)}`
      if (key === lastKey) {
        return
      }
      lastKey = key

      body.clear()
      ring.clear()

      // Blanchiment pendant le temps d'arrêt de la séquence de mort : le monde
      // est suspendu, les ennemis cessent d'être rouges donc menaçants.
      const color = mixColor(frozen ? INK.frost : INK.danger, INK.paper, whiten)

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
