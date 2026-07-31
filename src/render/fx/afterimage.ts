import { type Container, Graphics } from 'pixi.js'

import { INK } from '../ink'
import { drawNib } from '../views/player'

interface Ghost {
  gfx: Graphics
  age: number
}

export interface Afterimages {
  emit(x: number, y: number, angle: number): void
  update(dtMs: number): void
  destroy(): void
}

const LIFE_MS = 250
/** Borne dure : une ruée longue ne doit pas laisser une file sans fin de fantômes. */
const LIMIT = 16

/** Opacité d'un fantôme à `age` ms. Nulle passé sa fin de vie, jamais négative. */
export function afterimageAlpha(age: number, lifeMs: number): number {
  return Math.max(0, 1 - age / lifeMs)
}

/**
 * Copies fantômes de la pointe de plume pendant la ruée : c'est ce qui fait
 * *sentir* la vitesse, là où le sillage (`dash-wake.ts`) montre la portée.
 * Purement cosmétique — `src/render/` n'écrit jamais dans la simulation.
 */
export function createAfterimages(container: Container): Afterimages {
  const ghosts: Ghost[] = []

  return {
    emit(x, y, angle): void {
      if (ghosts.length >= LIMIT) {
        const oldest = ghosts.shift()
        oldest?.gfx.destroy()
      }
      // La silhouette du joueur elle-même, pas une copie de son tracé : un
      // fantôme qui ne lui ressemble pas ne se lit pas comme sa trace, et le
      // couplage était jusqu'ici assuré par un commentaire, donc par personne.
      const gfx = new Graphics()
      drawNib(gfx, INK.paper)
      gfx.x = x
      gfx.y = y
      gfx.rotation = angle
      gfx.alpha = 0.45
      container.addChild(gfx)
      ghosts.push({ gfx, age: 0 })
    },

    update(dtMs): void {
      for (let i = ghosts.length - 1; i >= 0; i--) {
        const g = ghosts[i]
        if (!g) {
          continue
        }
        g.age += dtMs
        const alpha = afterimageAlpha(g.age, LIFE_MS)
        if (alpha <= 0) {
          g.gfx.destroy()
          ghosts.splice(i, 1)
          continue
        }
        g.gfx.alpha = alpha * 0.45
      }
    },

    destroy(): void {
      for (const g of ghosts) {
        g.gfx.destroy()
      }
      ghosts.length = 0
    },
  }
}
