import { Container, Graphics } from 'pixi.js'

import type { PowerUpKind } from '@/sim/data/powerups'
import { INK } from '../ink'

export interface PickupView {
  container: Container
  update(opts: { x: number; y: number; pulse: number }): void
}

/**
 * Traduit `POWERUP_ICONS` (src/ui/icons.ts, tracés SVG en 56×56) en primitives
 * `Graphics`. Même pictogramme, même lecture qu'ailleurs dans l'interface —
 * c'est le point du retrait de l'inventaire (spec §3.4) : la seule décision
 * qui reste est d'aller chercher la pastille ou non, impossible sans savoir
 * de quoi il s'agit. Chaque tracé est recentré sur (0, 0) et mis à l'échelle
 * (`S`) pour rester lisible à la taille d'une pastille au sol, sur fond
 * sombre. Le rouge (`INK.danger`) n'apparaît jamais ici — réservé aux ennemis
 * (spec §3.5) — seuls la Bombe (or) et le Gel (bleu givre) ont un accent
 * propre, les trois autres restent en papier.
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

const DRAWERS: Record<PowerUpKind, (gfx: Graphics) => void> = {
  blast: drawBlast,
  freeze: drawFreeze,
  blotter: drawBlotter,
  dash: drawDash,
  halo: drawHalo,
}

/**
 * `kind` est connu dès la création (le pictogramme d'une pastille ne change
 * jamais) : le tracé se fait une fois ici, `update` ne fait plus que
 * repositionner et faire pulser le conteneur.
 */
export function createPickupView(kind: PowerUpKind): PickupView {
  const container = new Container()
  const gfx = new Graphics()
  container.addChild(gfx)

  // Jeton commun en fond, discret : signale « ceci se ramasse » indépendamment
  // du pictogramme, qui lui seul distingue les cinq power-ups entre eux.
  gfx.circle(0, 0, RING_RADIUS).stroke({ color: INK.paper, width: 1.2, alpha: 0.22 })
  DRAWERS[kind](gfx)

  return {
    container,
    update({ x, y, pulse }) {
      container.x = x
      container.y = y
      container.scale.set(1 + Math.sin(pulse) * 0.08)
    },
  }
}
