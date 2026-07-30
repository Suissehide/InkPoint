import { Container, Graphics } from 'pixi.js'

import {
  HAZARD_AFTERBURN,
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_FREEZE,
  HAZARD_SPIKE,
  HAZARD_TRAIL,
  POWERUP_BASE,
} from '@/sim/data/powerups'
import { INK } from '../ink'

export interface HazardView {
  container: Container
  update(opts: {
    x: number
    y: number
    radius: number
    kind: number
    lifeRatio: number
    /** Temps de simulation, en ms — anime la rotation du tourbillon (spec §3.4). */
    time: number
    /** Temps de vie restant en ms, brut — pilote l'avertissement de fin des piques. */
    remainingMs: number
    /** Orientation de la zone, en radians. Nulle sauf pour les piques, qui pointent vers l'extérieur. */
    angle: number
  }): void
}

const COLORS: Record<number, number> = {
  [HAZARD_BLAST]: INK.blast,
  [HAZARD_FREEZE]: INK.frost,
  [HAZARD_TRAIL]: INK.paper,
  [HAZARD_BLOTTER]: INK.paper,
  [HAZARD_AFTERBURN]: INK.danger,
  [HAZARD_SPIKE]: INK.paper,
}

/**
 * Le Buvard doit se lire comme un trou noir qui tourbillonne, pas comme un
 * disque plat — sinon rien à l'écran ne trahit qu'il attire quoi que ce soit
 * (spec §3.4). Trois bras en spirale logarithmique, tournant avec le temps de
 * simulation (pas une horloge murale, pour rester figé pendant un hitstop
 * comme le reste du monde) : c'est visuellement distinct du Gel (simple double
 * cercle) tout en restant couleur papier — le rouge reste réservé aux ennemis.
 */
function drawVortex(
  gfx: Graphics,
  radius: number,
  color: number,
  lifeRatio: number,
  time: number,
): void {
  gfx.circle(0, 0, radius).fill({ color, alpha: 0.05 * lifeRatio })

  const arms = 3
  const turns = 1.15
  const steps = 20
  const rotation = time * 0.0016 // ~1,6 rad/s : sens purement visuel, indépendant du taux de rotation réel du tourbillon (hazards.ts)

  for (let arm = 0; arm < arms; arm++) {
    const armOffset = (arm / arms) * Math.PI * 2
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // Le rayon ne descend jamais à zéro : un bras qui converge en un point
      // exact serait un artefact visuel, pas un tourbillon.
      const r = radius * (0.18 + (1 - t) * 0.82)
      const a = armOffset + rotation + t * turns * Math.PI * 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) {
        gfx.moveTo(x, y)
      } else {
        gfx.lineTo(x, y)
      }
    }
  }
  gfx.stroke({ color, width: 1.6, alpha: 0.65 * lifeRatio })
}

/**
 * Une pique : un éclat d'encre effilé, pointe vers l'extérieur. Elle est
 * dessinée centrée sur sa propre entité — donc exactement là où la zone tue
 * (spec §3.1). Sur les dernières `warnMs`, elle pulse et se rétracte : c'est
 * l'avertissement que la couronne va tomber. La pulsation est sinusoïdale et
 * non binaire — même lisibilité qu'un clignotement, sans le stroboscope.
 */
function drawSpike(
  gfx: Graphics,
  radius: number,
  color: number,
  angle: number,
  remainingMs: number,
  time: number,
): void {
  const warn = POWERUP_BASE.trail.warnMs
  const ending = remainingMs < warn
  // 5 Hz : assez rapide pour dire « ça va finir », assez lent pour rester lisible.
  const pulse = ending ? 0.55 + 0.45 * Math.sin((time / 1000) * Math.PI * 2 * 5) : 1
  const shrink = ending ? 0.7 + 0.3 * (remainingMs / warn) : 1

  const len = radius * 2.1 * shrink
  const half = radius * 0.62 * shrink
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Losange allongé dans l'axe de l'orbite : pointe en avant, base en arrière.
  // Coordonnées nommées plutôt que des tuples indexés : `src/render/` n'a pas
  // droit à `!`, et indexer un tableau littéral l'aurait exigé sous
  // `noUncheckedIndexedAccess`.
  const tipX = cos * len
  const tipY = sin * len
  const backX = -cos * len * 0.55
  const backY = -sin * len * 0.55
  const sideX = -sin * half
  const sideY = cos * half

  gfx
    .moveTo(tipX, tipY)
    .lineTo(sideX, sideY)
    .lineTo(backX, backY)
    .lineTo(-sideX, -sideY)
    .closePath()
    .fill({ color, alpha: 0.9 * pulse })
}

export function createHazardView(): HazardView {
  const container = new Container()
  const gfx = new Graphics()
  container.addChild(gfx)

  return {
    container,
    update({ x, y, radius, kind, lifeRatio, time, remainingMs, angle }) {
      container.x = x
      container.y = y
      gfx.clear()

      const color = COLORS[kind] ?? INK.paper

      if (kind === HAZARD_SPIKE) {
        drawSpike(gfx, radius, color, angle, remainingMs, time)
        return
      }

      if (kind === HAZARD_BLOTTER) {
        drawVortex(gfx, radius, color, lifeRatio, time)
      } else if (kind === HAZARD_FREEZE) {
        gfx.circle(0, 0, radius).fill({ color, alpha: 0.1 * lifeRatio })
        gfx.circle(0, 0, radius).stroke({ color, width: 1.6, alpha: 0.7 * lifeRatio })
      } else {
        gfx.circle(0, 0, radius).stroke({ color, width: 3, alpha: lifeRatio })
      }
    },
  }
}
