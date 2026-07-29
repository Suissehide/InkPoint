import { type Container, Graphics } from 'pixi.js'

interface Particle {
  gfx: Graphics
  vx: number
  vy: number
  life: number
  maxLife: number
}

export interface Particles {
  emitBurst(x: number, y: number, color: number, count: number): void
  update(dtMs: number): void
  destroy(): void
}

const POOL_LIMIT = 400

/** Éclaboussures d'encre. Pool borné : au-delà, on ignore l'émission plutôt
 *  que de laisser le nombre d'objets exploser pendant une grosse explosion. */
export function createParticles(container: Container): Particles {
  const active: Particle[] = []

  return {
    emitBurst(x, y, color, count): void {
      for (let i = 0; i < count && active.length < POOL_LIMIT; i++) {
        const gfx = new Graphics()
        const size = 1.4 + Math.random() * 2.4
        gfx.circle(0, 0, size).fill({ color })
        gfx.x = x
        gfx.y = y
        container.addChild(gfx)

        const angle = Math.random() * Math.PI * 2
        const speed = 40 + Math.random() * 190
        const maxLife = 280 + Math.random() * 420
        active.push({
          gfx,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: maxLife,
          maxLife,
        })
      }
    },

    update(dtMs): void {
      const dt = dtMs / 1000
      for (let i = active.length - 1; i >= 0; i--) {
        const p = active[i]
        if (!p) {
          continue
        }
        p.life -= dtMs
        if (p.life <= 0) {
          p.gfx.destroy()
          active.splice(i, 1)
          continue
        }
        p.gfx.x += p.vx * dt
        p.gfx.y += p.vy * dt
        p.vx *= 0.94
        p.vy *= 0.94
        p.gfx.alpha = p.life / p.maxLife
      }
    },

    destroy(): void {
      for (const p of active) {
        p.gfx.destroy()
      }
      active.length = 0
    },
  }
}
