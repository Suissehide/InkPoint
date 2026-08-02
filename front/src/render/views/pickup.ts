import type { PowerUpKind } from '@sim/data/powerups'
import { Container, Graphics } from 'pixi.js'

import { INK } from '../ink'

export interface PickupView {
  container: Container
  update(opts: {
    x: number
    y: number
    pulse: number
    /** 1 à l'apparition, 0 à l'instant où elle s'efface. */
    lifeRatio: number
  }): void
}

/**
 * Traduit `POWERUP_ICONS` (src/ui/icons.ts, tracés SVG en 56×56) en primitives
 * `Graphics` : mêmes tracés, à garder en synchronisation manuelle avec cette
 * source. `INK.danger` n'apparaît jamais ici, réservé aux ennemis.
 */
const S = 0.62
/** Recentre un point du repère de icons.ts (56×56, centre 28,28) sur (0,0). */
const P = (x: number, y: number): [number, number] => [(x - 28) * S, (y - 28) * S]

const RING_RADIUS = 13

function drawBlast(gfx: Graphics): void {
  gfx.circle(0, 0, 17 * S).stroke({ color: INK.blast, width: 2 })
  gfx.circle(0, 0, 7 * S).stroke({ color: INK.blast, width: 1.2, alpha: 0.55 })
}

function drawFreeze(gfx: Graphics): void {
  // Trois axes du flocon (vertical + deux diagonales), plus une paire de
  // chevrons à chaque bout de l'axe vertical — mêmes tracés que icons.ts.
  gfx.moveTo(...P(28, 10)).lineTo(...P(28, 46))
  gfx.moveTo(...P(13, 19)).lineTo(...P(43, 37))
  gfx.moveTo(...P(43, 19)).lineTo(...P(13, 37))
  gfx.moveTo(...P(28, 17)).lineTo(...P(23, 22))
  gfx.moveTo(...P(28, 17)).lineTo(...P(33, 22))
  gfx.moveTo(...P(28, 39)).lineTo(...P(23, 34))
  gfx.moveTo(...P(28, 39)).lineTo(...P(33, 34))
  gfx.stroke({ color: INK.frost, width: 1.4 })
}

function drawBramble(gfx: Graphics): void {
  const [sx, sy] = P(10, 40)
  const [c1x, c1y] = P(20, 18)
  const [mx, my] = P(30, 30)
  const [c2x, c2y] = P(40, 42)
  const [ex, ey] = P(48, 16)
  gfx
    .moveTo(sx, sy)
    .quadraticCurveTo(c1x, c1y, mx, my)
    .quadraticCurveTo(c2x, c2y, ex, ey)
    .stroke({ color: INK.paper, width: 1.9, cap: 'round' })
}

function drawBlotter(gfx: Graphics): void {
  // Anneau ouvert (spirale simplifiée) : un plein tour laisserait croire à
  // un simple cercle, indiscernable du Halo.
  gfx.arc(0, 0, 9 * S, -Math.PI / 2, Math.PI, false).stroke({ color: INK.paper, width: 1.7 })
  gfx.circle(0, 0, 2 * S).fill({ color: INK.paper })
}

function drawDash(gfx: Graphics): void {
  const [ax, ay] = P(30, 12)
  const [bx, by] = P(44, 28)
  const [cx, cy] = P(30, 44)
  gfx
    .moveTo(ax, ay)
    .lineTo(bx, by)
    .lineTo(cx, cy)
    .stroke({ color: INK.paper, width: 2, cap: 'round', join: 'round' })

  const [lsx, lsy] = P(8, 28)
  const [lex, ley] = P(38, 28)
  gfx.moveTo(lsx, lsy).lineTo(lex, ley).stroke({ color: INK.paper, width: 1.4, alpha: 0.35 })
}

function drawHalo(gfx: Graphics): void {
  gfx.circle(0, 0, 18 * S).stroke({ color: INK.paper, width: 1, alpha: 0.4 })
  gfx.circle(0, 0, 12 * S).stroke({ color: INK.paper, width: 1.8 })
}

/** Mêmes tracés que `POWERUP_ICONS.volley` (icons.ts), à garder en phase à la main. */
function drawVolley(gfx: Graphics): void {
  gfx.moveTo(...P(12, 34)).lineTo(...P(28, 18))
  gfx.moveTo(...P(14, 44)).lineTo(...P(34, 24))
  gfx.moveTo(...P(24, 46)).lineTo(...P(40, 30))
  gfx.stroke({ color: INK.paper, width: 1.6, cap: 'round' })

  gfx
    .moveTo(...P(40, 12))
    .lineTo(...P(46, 18))
    .lineTo(...P(40, 24))
    .lineTo(...P(34, 18))
    .fill({ color: INK.paper })
}

/** Mêmes tracés que `POWERUP_ICONS.splatter` (icons.ts), à garder en phase à la main. */
function drawSplatter(gfx: Graphics): void {
  const [cx, cy] = P(20, 22)
  gfx.circle(cx, cy, 7 * S).fill({ color: INK.paper })
  gfx
    .moveTo(...P(26, 27))
    .lineTo(...P(38, 37))
    .lineTo(...P(30, 45))
    .stroke({ color: INK.paper, width: 1.6, cap: 'round', join: 'round', alpha: 0.6 })
}

const DRAWERS: Record<PowerUpKind, (gfx: Graphics) => void> = {
  blast: drawBlast,
  freeze: drawFreeze,
  bramble: drawBramble,
  blotter: drawBlotter,
  dash: drawDash,
  halo: drawHalo,
  volley: drawVolley,
  splatter: drawSplatter,
}

/**
 * Fraction de la vie d'une pastille pendant laquelle elle s'alarme. À 0,26 de
 * ses 14 s, l'alerte dure les ~3,6 dernières secondes : assez pour traverser
 * l'arène en la voyant clignoter, trop peu pour qu'elle passe sa vie à crier.
 */
const ALARM_RATIO = 0.26

/**
 * Intensité de l'alarme d'une pastille, de 0 (elle a le temps) à 1 (elle
 * s'éteint). Fonction pure, exportée pour être éprouvée sans Pixi.
 */
export function pickupAlarm(lifeRatio: number): number {
  const reste = Math.min(1, Math.max(0, lifeRatio))
  if (reste >= ALARM_RATIO) {
    return 0
  }
  return 1 - reste / ALARM_RATIO
}

/**
 * `kind` est connu dès la création (le pictogramme d'une pastille ne change
 * jamais) : son tracé se fait une fois ici. Seule la jauge est redessinée à
 * chaque image, dans son propre `Graphics` — la refaire porter au pictogramme
 * obligerait à retracer tout le dessin soixante fois par seconde pour un arc.
 */
export function createPickupView(kind: PowerUpKind): PickupView {
  const container = new Container()
  /** Jauge de vie : seule partie qui change d'une image à l'autre. */
  const gauge = new Graphics()
  const gfx = new Graphics()
  container.addChild(gauge)
  container.addChild(gfx)

  DRAWERS[kind](gfx)

  return {
    container,
    update({ x, y, pulse, lifeRatio }) {
      container.x = x
      container.y = y
      container.scale.set(1 + Math.sin(pulse) * 0.08)

      // Le jeton de fond était un cercle plein à 22 % : il disait « ceci se
      // ramasse » et rien d'autre, si bien qu'une pastille vivait ses 14 s
      // sans jamais annoncer sa fin. Il devient un arc qui se vide — même
      // vocabulaire que la jauge d'invulnérabilité autour du curseur, pour
      // qu'un arc qui se referme veuille dire « temps restant » partout dans
      // le jeu. D'où aussi son opacité relevée : une jauge illisible ne
      // remplace pas l'absence de jauge.
      const reste = Math.min(1, Math.max(0, lifeRatio))
      const alarme = pickupAlarm(lifeRatio)
      gauge.clear()
      if (reste > 0) {
        const depart = -Math.PI / 2
        gauge
          .arc(0, 0, RING_RADIUS, depart, depart + Math.PI * 2 * reste)
          .stroke({ color: INK.paper, width: 1.6, alpha: 0.45 + 0.35 * alarme })
      }

      // Clignotement dont seule la PROFONDEUR croît, jamais la fréquence :
      // moduler la fréquence d'un sinus au fil du temps fait sauter sa phase,
      // et la pastille sursauterait au lieu de battre.
      container.alpha = 1 - alarme * 0.55 * (0.5 + 0.5 * Math.sin(pulse * 6))
    },
  }
}
