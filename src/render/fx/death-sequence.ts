import { defineQuery } from 'bitecs'

import { Collider, Enemy, Position } from '@/sim/components'
import type { SimWorld } from '@/sim/world'
import { INK } from '../ink'
import type { Particles } from '../particles'
import type { Flash } from './flash'
import type { Shockwaves } from './shockwave'

/** Le monde se fige : les ennemis blanchissent, le joueur encaisse. */
export const DEATH_FREEZE_MS = 340
/** Les ennemis détonent, du plus proche au plus lointain. */
export const DEATH_DETONATE_MS = 760
/** Le joueur se disperse. */
export const DEATH_DISPERSE_MS = 500
/** Durée totale, et donc durée de l'état `dying`. */
export const DEATH_SEQUENCE_MS = DEATH_FREEZE_MS + DEATH_DETONATE_MS + DEATH_DISPERSE_MS

/** Étalement de l'onde de détonation sur la phase. */
const DETONATION_SPREAD_MS = 620
/** Grain de désordre, pour que l'onde ne se lise pas comme un métronome. */
const DETONATION_JITTER_MS = 70
/**
 * Fraction de la diagonale de l'arène au-delà de laquelle un ennemi part au
 * plus tard. Sans plafond, un seul traînard à l'angle opposé étirerait toute
 * l'onde et laisserait le centre de l'arène vide pendant une demi-seconde.
 */
const DETONATION_REACH = 0.62

const enemyQuery = defineQuery([Enemy, Position, Collider])

export type DeathPhase = 'freeze' | 'detonate' | 'disperse' | 'done'

export function deathPhaseAt(elapsedMs: number): DeathPhase {
  if (elapsedMs < DEATH_FREEZE_MS) {
    return 'freeze'
  }
  if (elapsedMs < DEATH_FREEZE_MS + DEATH_DETONATE_MS) {
    return 'detonate'
  }
  if (elapsedMs < DEATH_SEQUENCE_MS) {
    return 'disperse'
  }
  return 'done'
}

/**
 * Grain pseudo-aléatoire sur [0, 1[ tiré de l'`eid`. Volontairement pas
 * `Math.random()`, pourtant permis dans `src/render/` : une séquence de mort
 * reproductible se débogue et se teste, un tirage par frame non (spec §3.2).
 */
function jitter01(eid: number): number {
  return ((Math.imul(eid, 2654435761) >>> 0) % 1000) / 1000
}

/**
 * Délai de détonation d'un ennemi, en ms depuis le début de la phase. L'onde
 * part du point d'impact : la mort a un centre et une cause.
 */
export function detonationDelay(distance: number, maxDistance: number, eid: number): number {
  const reach = Math.max(1, maxDistance)
  const ratio = Math.min(1, Math.max(0, distance / reach))
  return ratio * DETONATION_SPREAD_MS + jitter01(eid) * DETONATION_JITTER_MS
}

interface Doomed {
  eid: number
  x: number
  y: number
  delay: number
}

export interface DeathSequence {
  start(world: SimWorld, x: number, y: number, arenaWidth: number, arenaHeight: number): void
  update(
    dtMs: number,
    fx: { particles: Particles; flash: Flash; shockwaves: Shockwaves; motionEnabled: boolean },
  ): void
  /** Ennemis déjà détonés : `stage.ts` cesse de les dessiner. */
  readonly detonated: ReadonlySet<number>
  readonly phase: DeathPhase
  /** Le joueur s'est dispersé : ni lui ni la page ne se dessinent plus. */
  readonly playerGone: boolean
  readonly done: boolean
  /** Saute à la fin — la séquence est interruptible au clavier (spec §3.3). */
  finish(): void
}

/**
 * La mise en scène de la mort. Purement du rendu : pendant l'état `dying`, la
 * simulation est déjà entièrement gelée (`app/game.ts` n'appelle `stepWorld`
 * que dans l'état `playing`), donc rien ici ne peut désynchroniser quoi que ce
 * soit. L'instantané des ennemis est pris une fois au démarrage, pour la même
 * raison : plus rien ne bougera.
 */
export function createDeathSequence(): DeathSequence {
  let elapsed = 0
  let doomed: Doomed[] = []
  let playerX = 0
  let playerY = 0
  const detonated = new Set<number>()
  let playerGone = false
  let active = false

  return {
    start(world, x, y, arenaWidth, arenaHeight): void {
      elapsed = 0
      detonated.clear()
      playerGone = false
      active = true
      playerX = x
      playerY = y

      const maxDistance = Math.hypot(arenaWidth, arenaHeight) * DETONATION_REACH
      doomed = []
      for (const eid of enemyQuery(world)) {
        const ex = Position.x[eid]
        const ey = Position.y[eid]
        if (ex === undefined || ey === undefined) {
          continue
        }
        doomed.push({
          eid,
          x: ex,
          y: ey,
          delay: detonationDelay(Math.hypot(ex - x, ey - y), maxDistance, eid),
        })
      }
    },

    update(dtMs, fx): void {
      if (!active) {
        return
      }
      elapsed += dtMs
      const phase = deathPhaseAt(elapsed)

      if (phase === 'detonate' || phase === 'disperse' || phase === 'done') {
        const since = elapsed - DEATH_FREEZE_MS
        for (const d of doomed) {
          if (detonated.has(d.eid) || since < d.delay) {
            continue
          }
          detonated.add(d.eid)
          if (fx.motionEnabled) {
            fx.particles.emitBurst(d.x, d.y, {
              color: INK.danger,
              count: 11,
              speed: 130,
              streak: true,
            })
            fx.shockwaves.emit(d.x, d.y, { color: INK.danger, radius: 46, durationMs: 380 })
            fx.flash.flash(INK.danger, 0.02)
          }
        }
      }

      if (!playerGone && (phase === 'disperse' || phase === 'done')) {
        playerGone = true
        // Le flash reste derrière `motionEnabled`, comme tous ceux de
        // `app/juice.ts` : c'est un changement de luminance plein cadre. En
        // mouvement réduit, la mort garde son ordre et son rythme — le
        // blanchiment et la disparition progressive des ennemis — sans
        // projection à l'écran (spec §6).
        if (fx.motionEnabled) {
          fx.flash.flash(INK.paper, 0.26, 300)
          fx.particles.emitBurst(playerX, playerY, {
            color: INK.paper,
            count: 34,
            speed: 190,
            streak: true,
          })
          fx.shockwaves.emit(playerX, playerY, {
            color: INK.paper,
            radius: 170,
            durationMs: 620,
            thickness: 5,
          })
        }
      }
    },

    get detonated(): ReadonlySet<number> {
      return detonated
    },
    get phase(): DeathPhase {
      return active ? deathPhaseAt(elapsed) : 'done'
    },
    get playerGone(): boolean {
      return playerGone
    },
    get done(): boolean {
      return !active || deathPhaseAt(elapsed) === 'done'
    },

    finish(): void {
      elapsed = DEATH_SEQUENCE_MS
      playerGone = true
      for (const d of doomed) {
        detonated.add(d.eid)
      }
    },
  }
}
