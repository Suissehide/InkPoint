import type { Viewport } from '@/render/viewport'
import type { InputState } from '@/sim/input'
import { FIXED_DT } from '@/sim/world'
import type { InputSource, PlayerMotion, Point } from './input-source'

/** Durée d'un pas de simulation, en secondes — voir le commentaire de `aimInput`. */
const STEP_DT = FIXED_DT / 1000

/**
 * Au-delà de ce rayon, plein régime ; en deçà, l'intensité décroît mais reste
 * dirigée vers la cible. Ne gouverne pas l'arrêt : c'est la distance d'arrêt
 * calculée dans `aimInput` qui coupe la poussée à temps pour que la friction
 * pose le point sur la cible sans la dépasser.
 */
const FULL_THROTTLE_RADIUS = 32

/**
 * Sous ce seuil, l'entrée est nulle : la friction immobilise le point net, et
 * `Facing` garde son dernier cap (`FACING_MIN_SPEED`) au lieu de frémir. C'est
 * la constante à augmenter si l'arrêt paraît trop lâche ; elle garantit aussi
 * qu'aucun angle n'est calculé sur une distance nulle.
 */
const DEAD_ZONE = 3

/** Pas de quantification des entrées — prérequis du netcode v3 (spec §3.5). */
const QUANTUM = 1 / 128

function quantize(value: number): number {
  return Math.round(value / QUANTUM) * QUANTUM
}

/**
 * Position écran → coordonnées d'arène, bornée à l'arène (letterbox via
 * `computeViewport`) : sans ça, un curseur posé dans la marge tirerait le
 * point vers un point hors du cadre qu'il ne peut pas atteindre.
 */
export function screenToArena(clientX: number, clientY: number, viewport: Viewport): Point {
  const x = (clientX - viewport.x) / viewport.scale
  const y = (clientY - viewport.y) / viewport.scale
  return {
    x: Math.min(viewport.arenaWidth, Math.max(0, x)),
    y: Math.min(viewport.arenaHeight, Math.max(0, y)),
  }
}

/**
 * Poursuite : direction joueur→cible, intensité proportionnelle à la distance.
 * La sortie a la forme d'une entrée de manette — la simulation ne saura jamais
 * qu'une souris est derrière.
 *
 * La poussée est coupée dès que la distance restante passe sous la distance
 * d'arrêt : la friction pose alors le point exactement sur la cible. Sans
 * cela, le point arrivait à pleine vitesse là où il lui fallait 10,8 px pour
 * s'arrêter, dépassait d'environ 8 px, et oscillait autour du curseur.
 */
export function aimInput(player: PlayerMotion, target: Point): { moveX: number; moveY: number } {
  const dx = target.x - player.x
  const dy = target.y - player.y
  const distance = Math.hypot(dx, dy)
  if (distance <= DEAD_ZONE) {
    return { moveX: 0, moveY: 0 }
  }
  const ux = dx / distance
  const uy = dy / distance

  // Projection de la vélocité sur la direction de la cible, et non sa norme :
  // un point qui dérive de côté, ou qui s'éloigne, a une vitesse élevée mais
  // rien à freiner — lui couper la poussée le laisserait filer au lieu de le
  // redresser. Le plancher à zéro traite l'éloignement.
  const approach = Math.max(0, player.vx * ux + player.vy * uy)
  // Friction nulle ⇒ aucun arrêt passif : couper la poussée immobiliserait le
  // point pour toujours. C'est le cas des ennemis, jamais celui du joueur,
  // mais la division doit être gardée.
  const stopping = player.friction > 0 ? (approach * approach) / (2 * player.friction) : 0
  // Marge d'un pas : cette décision porte sur la distance d'avant le pas, qui
  // va encore avancer d'`approach * STEP_DT` si la poussée continue. Sans
  // cette marge, le dernier pas poussé franchit la distance d'arrêt pendant
  // le pas lui-même, et le freinage démarre trop tard d'une image.
  const lookahead = approach * STEP_DT
  if (distance <= stopping + lookahead) {
    return { moveX: 0, moveY: 0 }
  }

  const intensity = Math.min(1, distance / FULL_THROTTLE_RADIUS)
  return {
    moveX: quantize(ux * intensity),
    moveY: quantize(uy * intensity),
  }
}

export interface MouseSource extends InputSource {
  /** Rebranché par `game.ts` à chaque `applyLayout` : le zoom change avec la fenêtre. */
  setViewport(viewport: Viewport): void
  /** `null` tant qu'aucun pointeur n'a bougé : empêche le réticule d'apparaître au centre d'une partie que personne ne pilote encore. */
  target(): Point | null
  /**
   * Ramène la source à son état « aucun pointeur n'a encore bougé ». Appelé à
   * la reprise, car les écrans qui suspendent une partie se cliquent à la
   * souris : sans ça, le premier pas viserait le bouton qu'on vient de cliquer.
   */
  forgetTarget(): void
}

/**
 * Écoute `pointermove` en permanence, écrans compris : le joueur qui clique
 * « Jouer » a déjà donné une position, la partie démarre donc avec une cible.
 */
export function createMouse(): MouseSource {
  let viewport: Viewport | null = null
  let clientX = 0
  let clientY = 0
  let moved = false

  const onMove = (event: PointerEvent): void => {
    clientX = event.clientX
    clientY = event.clientY
    moved = true
  }

  window.addEventListener('pointermove', onMove)

  const target = (): Point | null => {
    if (!moved || viewport === null) {
      return null
    }
    return screenToArena(clientX, clientY, viewport)
  }

  return {
    setViewport(next: Viewport): void {
      viewport = next
    },

    target,

    forgetTarget(): void {
      moved = false
    },

    writeInto(input: InputState, player: PlayerMotion): void {
      const aim = target()
      if (aim === null) {
        input.moveX = 0
        input.moveY = 0
        return
      }
      const { moveX, moveY } = aimInput(player, aim)
      input.moveX = moveX
      input.moveY = moveY
    },

    destroy(): void {
      window.removeEventListener('pointermove', onMove)
    },
  }
}
