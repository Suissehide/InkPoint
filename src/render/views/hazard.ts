import { Container, Graphics } from 'pixi.js'

import {
  HAZARD_AFTERBURN,
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_FREEZE,
  HAZARD_TRAIL,
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
    /**
     * Orientation de la zone, en radians. Portée par `Facing` quand la zone
     * en a un (le sillage de la ruée) ; `null` pour les zones sans direction
     * propre (Bombe, Gel, Buvard, Rémanence).
     *
     * `null` et non 0 : « aucune direction connue » et « direction plein est »
     * ne doivent pas se dessiner pareil. Un 0 par défaut ferait pointer un
     * chevron vers +x avec l'aplomb d'une information vraie.
     */
    angle: number | null
  }): void
}

const COLORS: Record<number, number> = {
  [HAZARD_BLAST]: INK.blast,
  [HAZARD_FREEZE]: INK.frost,
  [HAZARD_TRAIL]: INK.paper,
  [HAZARD_BLOTTER]: INK.paper,
  [HAZARD_AFTERBURN]: INK.danger,
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

// Géométrie du chevron, en fraction de `radius` — le rayon du disque mortel
// réel. Toutes dérivées de `radius` pour que le chevron reste par construction
// inscrit dans le disque : les ailes sont à √(0,45² + 0,62²) = 0,766 · radius
// du centre, la pointe touche le bord sans le dépasser.
const CHEVRON_TIP_RATIO = 1
const CHEVRON_WING_BACK_RATIO = 0.45
const CHEVRON_WING_HALF_RATIO = 0.62
const CHEVRON_NOTCH_RATIO = 0.1

/**
 * Un segment de sillage : le disque mortel réel (exactement le cercle testé
 * par la collision), avec un chevron inscrit dedans qui donne le sens de la
 * ruée. Le disque n'est pas une décoration — un chevron seul laisserait une
 * bande mortelle invisible sur ses flancs, et l'allonger pour la couvrir
 * annoncerait du danger là où il n'y en a pas. Le disque dit la vérité, le
 * chevron donne la lecture (spec §4.2).
 *
 * `visible` est le plancher de visibilité propre au sillage : la fenêtre de
 * fondu partagée vaut 400 ms contre 800 ms de vie, si bien que la seconde
 * moitié de la vie d'un segment était quasi transparente — et toujours
 * mortelle. Un segment reste lisible tant qu'il tue.
 *
 * Les opacités du disque (0,22 en remplissage, 0,5 au trait) sont celles
 * d'avant l'ajout du chevron : les flancs du couloir — les 38 % extérieurs du
 * rayon, ~27 px de chaque côté — ne sont signalés que par le disque, et la
 * frontière de ce qui tue ne doit pas être *moins* visible depuis qu'une forme
 * plus vive (le chevron, à 0,75) lui dispute l'attention.
 *
 * `angle` à `null` (aucune direction connue) : on dessine le disque seul. Le
 * disque dit toujours la vérité ; une flèche inventée, non.
 */
function drawWake(
  gfx: Graphics,
  radius: number,
  color: number,
  angle: number | null,
  lifeRatio: number,
): void {
  const visible = 0.25 + 0.75 * lifeRatio

  gfx.circle(0, 0, radius).fill({ color, alpha: 0.22 * visible })
  gfx.circle(0, 0, radius).stroke({ color, width: 1.5, alpha: 0.5 * visible })

  if (angle === null) {
    return
  }

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const tip = radius * CHEVRON_TIP_RATIO
  const back = radius * CHEVRON_WING_BACK_RATIO
  const half = radius * CHEVRON_WING_HALF_RATIO
  const notch = radius * CHEVRON_NOTCH_RATIO

  // Coordonnées nommées plutôt que des tuples indexés : `src/render/` n'a pas
  // droit à `!`, et indexer un tableau littéral l'exigerait sous
  // `noUncheckedIndexedAccess`.
  const tipX = cos * tip
  const tipY = sin * tip
  const wingX = -cos * back
  const wingY = -sin * back
  const sideX = -sin * half
  const sideY = cos * half
  const notchX = -cos * notch
  const notchY = -sin * notch

  gfx
    .moveTo(tipX, tipY)
    .lineTo(wingX + sideX, wingY + sideY)
    .lineTo(notchX, notchY)
    .lineTo(wingX - sideX, wingY - sideY)
    .closePath()
    .fill({ color, alpha: 0.75 * visible })
}

export function createHazardView(): HazardView {
  const container = new Container()
  const gfx = new Graphics()
  container.addChild(gfx)

  return {
    container,
    update({ x, y, radius, kind, lifeRatio, time, angle }) {
      container.x = x
      container.y = y
      gfx.clear()

      const color = COLORS[kind] ?? INK.paper

      if (kind === HAZARD_BLOTTER) {
        drawVortex(gfx, radius, color, lifeRatio, time)
      } else if (kind === HAZARD_FREEZE) {
        gfx.circle(0, 0, radius).fill({ color, alpha: 0.1 * lifeRatio })
        gfx.circle(0, 0, radius).stroke({ color, width: 1.6, alpha: 0.7 * lifeRatio })
      } else if (kind === HAZARD_TRAIL) {
        drawWake(gfx, radius, color, angle, lifeRatio)
      } else {
        gfx.circle(0, 0, radius).stroke({ color, width: 3, alpha: lifeRatio })
      }
    },
  }
}
