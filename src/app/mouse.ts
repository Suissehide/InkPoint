import type { Viewport } from '@/render/viewport'
import type { InputState } from '@/sim/input'
import type { InputSource, Point } from './input-source'

/**
 * Au-delà de ce rayon, plein régime ; en deçà, l'intensité décroît — mais
 * l'entrée continue de pointer vers la cible, donc le point continue
 * d'accélérer, juste moins fort. Rien ne freine avant que l'entrée
 * s'annule dans `DEAD_ZONE` : ce rayon gouverne l'approche depuis l'arrêt et
 * la finesse des petites corrections, pas l'arrêt lui-même. Arrivé plein
 * régime, le point dépasse donc le curseur d'environ 8 px avant de revenir
 * s'y poser — un dépassement unique de quelques pixels, accepté à ces
 * valeurs et à confirmer en jouant. Valeur de première passe.
 */
const FULL_THROTTLE_RADIUS = 32

/**
 * Sous ce seuil, l'entrée est nulle : la friction immobilise le point net, et
 * `Facing` conserve son dernier cap (`FACING_MIN_SPEED`) au lieu de frémir.
 * C'est cette zone morte qui gouverne l'arrêt, et avec lui le dépassement
 * résiduel à l'arrivée (`v²/2a` = 240²/(2×2667) ≈ 11 px de distance de
 * freinage une fois l'entrée nulle) : c'est la constante à augmenter si
 * l'arrêt paraît trop lâche. C'est aussi ce qui garantit qu'aucun angle n'est
 * calculé sur une distance nulle.
 */
const DEAD_ZONE = 3

/** Pas de quantification des entrées — prérequis du netcode v3 (spec §3.5). */
const QUANTUM = 1 / 128

function quantize(value: number): number {
  return Math.round(value / QUANTUM) * QUANTUM
}

/**
 * Position écran → coordonnées d'arène, bornée à l'arène. Le bornage n'est pas
 * cosmétique : l'arène est cadrée en letterbox (`computeViewport`), et sans lui
 * un curseur posé dans la marge tirerait le point vers un point hors du cadre
 * qu'il ne peut pas atteindre.
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
 */
export function aimInput(player: Point, target: Point): { moveX: number; moveY: number } {
  const dx = target.x - player.x
  const dy = target.y - player.y
  const distance = Math.hypot(dx, dy)
  if (distance <= DEAD_ZONE) {
    return { moveX: 0, moveY: 0 }
  }
  const intensity = Math.min(1, distance / FULL_THROTTLE_RADIUS)
  return {
    moveX: quantize((dx / distance) * intensity),
    moveY: quantize((dy / distance) * intensity),
  }
}

export interface MouseSource extends InputSource {
  /** Rebranché par `game.ts` à chaque `applyLayout` : le zoom change avec la fenêtre. */
  setViewport(viewport: Viewport): void
  /**
   * La cible en coordonnées d'arène, ou `null` tant qu'aucun pointeur n'a
   * bougé — c'est ce `null` qui empêche le réticule d'apparaître au centre
   * d'une partie que personne ne pilote encore.
   */
  target(): Point | null
  /**
   * Ramène la source à son état « aucun pointeur n'a encore bougé » : le point
   * reste immobile jusqu'au prochain mouvement de souris. Appelé à la reprise
   * d'une partie, parce que les écrans qui la suspendent se cliquent à la
   * souris : sans ça, le premier pas après la reprise viserait le bouton qu'on
   * vient de cliquer, et lancerait le point plein régime vers le centre de
   * l'arène sans que personne l'ait demandé.
   */
  forgetTarget(): void
}

/**
 * Écoute `pointermove` en permanence, écrans compris : le joueur qui clique
 * « Jouer » a déjà donné une position, et la partie démarre donc avec une cible
 * plutôt qu'à vide. Rien n'est réinitialisé quand le curseur quitte la fenêtre —
 * la dernière cible tient, le point la rejoint et s'y arrête.
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

    writeInto(input: InputState, player: Point): void {
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
