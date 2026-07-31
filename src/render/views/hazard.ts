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

// Géométrie de l'éclat, en fraction de `radius` — le rayon du disque mortel
// réel (cercle testé dans sim/systems/hazards.ts). Toutes dérivées de
// `radius` pour que l'éclat reste par construction inscrit dans le disque.
const SPIKE_TIP_RATIO = 1 // pointe : touche le bord du disque, jamais au-delà
const SPIKE_HALF_WIDTH_RATIO = 0.62 // demi-largeur perpendiculaire à l'axe
const SPIKE_BACK_RATIO = 0.55 // base arrière, en retrait du centre
// Plage du rétrécissement de fin de vie : 70 % à 100 % de la taille normale,
// interpolée linéairement sur la fenêtre `warnMs`.
const SPIKE_SHRINK_MIN = 0.7
const SPIKE_SHRINK_RANGE = 0.3

/**
 * Une pique : le disque mortel réel (cercle de `radius`, exactement la zone
 * testée par la collision), avec un éclat d'encre effilé inscrit dedans pour
 * donner l'orientation. Le disque n'est pas une décoration : sans lui, la
 * silhouette effilée seule laisserait une bande mortelle invisible entre son
 * flanc et le bord réel du cercle — exactement ce que « ce qui est affiché
 * est ce qui tue » interdit (spec §3.1). L'éclat est centré sur sa propre
 * entité, donc exactement là où la zone tue. Sur les dernières `warnMs`,
 * l'éclat pulse et se rétracte (le disque, lui, reste à `radius` constant :
 * c'est la zone mortelle, elle ne bouge pas) : c'est l'avertissement que la
 * couronne va tomber. La pulsation est sinusoïdale et non binaire — même
 * lisibilité qu'un clignotement, sans le stroboscope.
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
  // 5 Hz : assez rapide pour dire « ça va finir », assez lent pour rester
  // lisible. Amplitude bornée à [0,40 ; 1,00] et non [0,10 ; 1,00] : la pique
  // tue à plein rayon pendant toute la pulsation, un creux qui la rendait
  // optiquement absente (0,18 × 0,10 sur le disque de vérité) est exactement le
  // stroboscope que la sinusoïde était censée éviter.
  const pulse = ending ? 0.7 + 0.3 * Math.sin((time / 1000) * Math.PI * 2 * 5) : 1
  // Ne s'applique qu'à l'éclat (plus bas) — jamais au disque ci-dessous.
  const shrink = ending ? SPIKE_SHRINK_MIN + SPIKE_SHRINK_RANGE * (remainingMs / warn) : 1

  // Le disque de vérité, à `radius` constant, quel que soit `shrink` : c'est
  // la zone qui tue réellement. Encre légère avec un liseré discret — il doit
  // se lire comme un halo de danger, pas écraser l'éclat qui donne
  // l'orientation.
  gfx.circle(0, 0, radius).fill({ color, alpha: 0.18 * pulse })
  gfx.circle(0, 0, radius).stroke({ color, width: 1, alpha: 0.35 * pulse })

  const len = radius * SPIKE_TIP_RATIO * shrink
  const half = radius * SPIKE_HALF_WIDTH_RATIO * shrink
  const back = radius * SPIKE_BACK_RATIO * shrink
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Losange allongé dans l'axe de l'orbite : pointe en avant (au bord du
  // disque, jamais au-delà), base en arrière. Coordonnées nommées plutôt que
  // des tuples indexés : `src/render/` n'a pas droit à `!`, et indexer un
  // tableau littéral l'aurait exigé sous `noUncheckedIndexedAccess`.
  const tipX = cos * len
  const tipY = sin * len
  const backX = -cos * back
  const backY = -sin * back
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
      } else if (kind === HAZARD_TRAIL) {
        // Tache pleine et non anneau : c'est de l'encre déposée, et le joueur
        // doit lire d'un coup d'œil que tout l'intérieur du couloir tue.
        //
        // Plancher de visibilité local au sillage (pas dans le `lifeRatio`
        // partagé, qui règle la disparition de toutes les autres zones) : la
        // fenêtre de fondu vaut 400 ms contre 800 ms de vie, si bien que la
        // seconde moitié de la vie d'un segment était un disque de 80 px
        // quasiment transparent — et toujours mortel. Une ruée en dépose une
        // douzaine juste sous le joueur : ils doivent rester visibles tant
        // qu'ils tuent, et disparaître d'un coup à l'expiration.
        const visible = 0.25 + 0.75 * lifeRatio
        gfx.circle(0, 0, radius).fill({ color, alpha: 0.22 * visible })
        gfx.circle(0, 0, radius).stroke({ color, width: 2, alpha: 0.5 * visible })
      } else {
        gfx.circle(0, 0, radius).stroke({ color, width: 3, alpha: lifeRatio })
      }
    },
  }
}
