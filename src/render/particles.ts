import { type Container, Graphics } from 'pixi.js'

interface Particle {
  gfx: Graphics
  vx: number
  vy: number
  life: number
  maxLife: number
  age: number
  stallAfterMs?: number
  /** Renseigné pour les éclats aspirés : centre, rayon de naissance, vitesse de référence. */
  converge?: { cx: number; cy: number; spawnRadius: number; baseSpeed: number }
  /** Étiré le long de sa vélocité : la traînée doit suivre l'angle recalculé
   *  chaque frame pour les éclats convergents (voir `update`). */
  streak?: boolean
}

export interface BurstOptions {
  color: number
  count: number
  /** Direction centrale du cône, en radians. Ignorée si `spread` vaut 2π. */
  dir?: number
  /** Ouverture totale du cône, en radians. Par défaut le cercle entier. */
  spread?: number
  /** Vitesse de référence en px/s ; chaque particule la module de ×0,35 à ×1,65. */
  speed?: number
  sizeScale?: number
  /** Éclats étirés le long de leur vélocité plutôt que ronds. */
  streak?: boolean
  /** Les éclats naissent sur un cercle de ce rayon plutôt qu'au point d'émission. */
  spawnRadius?: number
  /** Les éclats convergent vers le point d'émission au lieu de s'en éloigner. */
  converge?: boolean
  /** Passé ce délai (ms), l'éclat s'immobilise et fond sur place. */
  stallAfterMs?: number
}

export interface Particles {
  emitBurst(x: number, y: number, opts: BurstOptions): void
  update(dtMs: number): void
  destroy(): void
}

/**
 * Le pool était à 400 avec un abandon silencieux des nouvelles émissions une
 * fois plein : le retour visuel disparaissait exactement pendant les gros
 * combos, c'est-à-dire au moment où il compte le plus. On évince désormais la
 * plus ancienne particule (spec §5.2).
 */
const POOL_LIMIT = 700
const DEFAULT_SPEED = 115

/** Angle d'une particule dans le cône `dir ± spread/2`, pour un tirage `r` dans [0, 1[. */
export function burstAngle(dir: number, spread: number, r: number): number {
  return dir + (r - 0.5) * spread
}

/** Décroissance par pas de 16,67 ms d'une particule prise en glace. */
const STALL_DECAY_PER_STEP = 0.55

/**
 * Vitesse d'aspiration à `distance` du centre. Elle croît à mesure que la
 * particule se rapproche : une aspiration à vitesse constante se lit comme une
 * convergence géométrique, pas comme une force (spec §4.3). Au-delà du cercle
 * de naissance la courbe est plate — rien ne naît là, mais une particule
 * poussée hors du cercle ne doit pas accélérer à l'envers.
 */
export function convergeSpeed(distance: number, spawnRadius: number, baseSpeed: number): number {
  const closeness = 1 - Math.min(1, distance / spawnRadius)
  return baseSpeed * (0.5 + 1.5 * closeness)
}

/**
 * Facteur de vitesse d'une particule « prise en glace » : 1 tant qu'elle file,
 * puis une décroissance rapide et indépendante du framerate. Exprimée par pas
 * de référence puis élevée à la puissance du pas réel, pour qu'un écran à
 * 120 Hz gèle au même rythme qu'un écran à 60 Hz.
 */
export function stallDamping(age: number, stallAfterMs: number | undefined, dtMs: number): number {
  if (stallAfterMs === undefined || age < stallAfterMs) {
    return 1
  }
  return STALL_DECAY_PER_STEP ** (dtMs / 16.67)
}

/** Éclaboussures d'encre. */
export function createParticles(container: Container): Particles {
  const active: Particle[] = []

  return {
    emitBurst(x, y, opts): void {
      const dir = opts.dir ?? 0
      const spread = opts.spread ?? Math.PI * 2
      const baseSpeed = opts.speed ?? DEFAULT_SPEED
      const sizeScale = opts.sizeScale ?? 1

      for (let i = 0; i < opts.count; i++) {
        if (active.length >= POOL_LIMIT) {
          const oldest = active.shift()
          oldest?.gfx.destroy()
        }

        const angle = burstAngle(dir, spread, Math.random())
        const speed = baseSpeed * (0.35 + Math.random() * 1.3)
        const size = (1.4 + Math.random() * 2.4) * sizeScale

        const gfx = new Graphics()
        if (opts.streak) {
          // Rectangle centré puis tourné dans le sens de la vélocité : la forme
          // d'une goutte projetée, pas d'un point qui flotte.
          gfx.rect(-size * 2.6, -size * 0.42, size * 5.2, size * 0.84).fill({ color: opts.color })
          gfx.rotation = angle
        } else {
          gfx.circle(0, 0, size).fill({ color: opts.color })
        }
        const spawnRadius = opts.spawnRadius ?? 0
        gfx.x = x + Math.cos(angle) * spawnRadius
        gfx.y = y + Math.sin(angle) * spawnRadius
        container.addChild(gfx)

        const maxLife = 280 + Math.random() * 420
        active.push({
          gfx,
          // Un éclat aspiré reçoit sa vélocité à chaque frame dans `update` :
          // elle dépend de sa distance au centre, qui change.
          vx: opts.converge ? 0 : Math.cos(angle) * speed,
          vy: opts.converge ? 0 : Math.sin(angle) * speed,
          life: maxLife,
          maxLife,
          age: 0,
          stallAfterMs: opts.stallAfterMs,
          converge: opts.converge
            ? { cx: x, cy: y, spawnRadius: Math.max(1, spawnRadius), baseSpeed }
            : undefined,
          streak: opts.streak,
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
        p.age += dtMs

        if (p.converge) {
          const dx = p.converge.cx - p.gfx.x
          const dy = p.converge.cy - p.gfx.y
          const distance = Math.hypot(dx, dy)
          if (distance < 6) {
            // Arrivé au centre : il est absorbé, pas figé au milieu du buvard.
            p.gfx.destroy()
            active.splice(i, 1)
            continue
          }
          const speed = convergeSpeed(distance, p.converge.spawnRadius, p.converge.baseSpeed)
          // Composante tangentielle : l'éclat spirale au lieu de tomber droit,
          // ce qui annonce le tourbillon de la zone (`views/hazard.ts`).
          const angle = Math.atan2(dy, dx) + 0.5
          p.vx = Math.cos(angle) * speed
          p.vy = Math.sin(angle) * speed
          p.gfx.x += p.vx * dt
          p.gfx.y += p.vy * dt
          if (p.streak) {
            // La rotation fixée à la naissance (angle radial) ne suit pas la
            // composante tangentielle ci-dessus : sans ce réalignement, la
            // traînée d'un éclat aspiré pointe à ~0,5 rad de sa trajectoire
            // réelle pendant toute sa vie — ce qui affaiblit la lecture du
            // Buvard, dont l'argument est justement de montrer l'aspiration
            // avant qu'un ennemi ait bougé.
            p.gfx.rotation = angle
          }
        } else {
          p.gfx.x += p.vx * dt
          p.gfx.y += p.vy * dt
          const damping = stallDamping(p.age, p.stallAfterMs, dtMs)
          p.vx *= 0.94 * damping
          p.vy *= 0.94 * damping
        }
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
