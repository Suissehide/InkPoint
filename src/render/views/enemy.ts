import { Container, Graphics } from 'pixi.js'

import type { EnemyType } from '@/sim/data/enemies'
import { INK, mixColor } from '../ink'

export interface EnemyView {
  container: Container
  update(opts: {
    x: number
    y: number
    radius: number
    type: EnemyType
    materializeProgress: number
    frozen: boolean
    /** 0 = couleur normale, 1 = papier (temps d'arrêt de la mort). */
    whiten: number
  }): void
}

/**
 * Couleur d'encre par espèce. Table côté rendu, comme `COLORS` par kind de zone
 * dans `views/hazard.ts` : la simulation n'a pas à connaître les couleurs.
 * Le Point et le Blot se distinguent déjà par leur rayon (7 contre 14) ;
 * l'Éclat, à 6, était indiscernable d'un Point.
 */
const ENEMY_COLOR: Record<EnemyType, number> = {
  point: INK.danger,
  shard: INK.shard,
  blot: INK.danger,
}

/**
 * Le gel l'emporte sur l'espèce : quand un ennemi est immobilisé, c'est
 * l'information utile à cet instant. Une deuxième couleur mortelle ne crée
 * aucune ambiguïté — `frost` en est déjà une, et la grammaire du jeu est
 * « plein = mortel », pas « rouge = mortel ».
 */
export function enemyBodyColor(type: EnemyType, frozen: boolean, whiten: number): number {
  return mixColor(frozen ? INK.frost : ENEMY_COLOR[type], INK.paper, whiten)
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
    update({ x, y, radius, type, materializeProgress, frozen, whiten }) {
      container.x = x
      container.y = y

      // Le blanchiment fait partie de la clé : sans lui, le cache renverrait le
      // dessin précédent et l'animation de mort ne se verrait jamais.
      const key = `${radius.toFixed(1)}|${type}|${materializeProgress.toFixed(2)}|${frozen}|${whiten.toFixed(2)}`
      if (key === lastKey) {
        return
      }
      lastKey = key

      body.clear()
      ring.clear()

      // Blanchiment pendant le temps d'arrêt de la séquence de mort : le monde
      // est suspendu, les ennemis cessent d'être menaçants.
      const color = enemyBodyColor(type, frozen, whiten)

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
        // Liseré tracé À L'INTÉRIEUR du rayon de collision : le disque affiché
        // doit rester exactement le disque qui tue. Un contour centré sur
        // `radius` déborderait de la moitié de son épaisseur et annoncerait une
        // zone mortelle plus large que la vraie.
        const edge = 1
        body.circle(0, 0, radius - edge / 2).stroke({ color: INK.paper, width: edge, alpha: 0.55 })
      }
    },
  }
}
