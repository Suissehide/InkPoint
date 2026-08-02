import { type Container, Graphics } from 'pixi.js'

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

/** Opacité d'un fantôme à `age` ms. Nulle passé sa fin de vie, jamais négative. */
export function afterimageAlpha(age: number, lifeMs: number): number {
  return Math.max(0, 1 - age / lifeMs)
}

export interface AfterimageOptions {
  /** Dessine la silhouette du fantôme à l'origine, orientée vers +x. */
  draw(gfx: Graphics): void
  /** Borne dure : une charge longue ne doit pas laisser une file sans fin de fantômes. */
  limit: number
}

/**
 * Copies fantômes derrière ce qui va vite : c'est ce qui fait *sentir* la
 * vitesse, là où les zones montrent la portée. La silhouette est un paramètre —
 * un fantôme qui ne ressemble pas à ce qu'il suit ne se lit pas comme sa trace,
 * et une pointe de plume derrière un Éclat ne voudrait rien dire.
 * Purement cosmétique — `src/render/` n'écrit jamais dans la simulation.
 */
export function createAfterimages(container: Container, opts: AfterimageOptions): Afterimages {
  const ghosts: Ghost[] = []

  return {
    emit(x, y, angle): void {
      if (ghosts.length >= opts.limit) {
        const oldest = ghosts.shift()
        oldest?.gfx.destroy()
      }
      const gfx = new Graphics()
      opts.draw(gfx)
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
