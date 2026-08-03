import { type InputState, QUANTUM } from '@sim/input'
import { FIXED_DT } from '@sim/world'

import type { Viewport } from '@/render/viewport'
import type { InputSource, PlayerMotion, Point } from './input-source'

/** Durée d'un pas de simulation, en secondes — ce qu'une image d'accélération peut fournir dans `aimInput`. */
const STEP_DT = FIXED_DT / 1000

/**
 * Sous ce seuil, l'entrée est nulle : la friction immobilise le point net, et
 * `Facing` garde son dernier cap (`FACING_MIN_SPEED`) au lieu de frémir. C'est
 * la constante à augmenter si l'arrêt paraît trop lâche ; elle garantit aussi
 * qu'aucun angle n'est calculé sur une distance nulle.
 */
const DEAD_ZONE = 3

/**
 * Intensité plancher dès qu'une correction est demandée. `playerMovementSystem`
 * n'applique la friction que si l'entrée est nulle : laisser l'intensité tomber
 * à zéro en croisière rendrait la main à la friction, qui ralentirait le point,
 * ce qui recréerait un écart — un battement à chaque image. Une intensité
 * minuscule suffit à garder la commande, sans accélérer notablement.
 */
const MIN_INTENSITY = 0.01

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
 * Poursuite : on vise une **vitesse**, pas une direction. La sortie a la forme
 * d'une entrée de manette — la simulation ne saura jamais qu'une souris est
 * derrière.
 *
 * `√(2 · accel · distance)` est la vitesse maximale depuis laquelle on peut
 * encore s'arrêter pile sur la cible. Trois régimes en découlent sans aucun
 * seuil : loin, elle dépasse `maxSpeed` et l'entrée pousse à plein ; près et
 * lancé, elle plafonne sous la vitesse actuelle et l'écart pointe à l'opposé,
 * donc freine ; et si la cible bouge, l'écart porte la correction latérale
 * **pendant** le freinage. C'est ce dernier point qui corrige la dérive de la
 * règle précédente, qui coupait toute commande pendant l'arrêt.
 *
 * `distance` est réduite d'`approche · STEP_DT` avant de calculer la vitesse
 * de freinage : la décision de ce pas ne s'applique qu'au pas suivant, pendant
 * lequel le point aura encore avancé d'environ un déplacement d'image. Sans
 * cette marge — supprimée avec le reste de l'ancienne règle, qui la portait
 * déjà sous le même nom — la vitesse souhaitée reste légèrement trop haute,
 * d'une erreur croissant avec la vitesse ; « Pas léger » multiplie `maxSpeed`
 * sans toucher `accel`, donc la distance d'arrêt réelle (`maxSpeed² /
 * (2·accel)`) grandit au carré du nombre d'exemplaires, et l'erreur avec elle.
 * Garanti seulement quand la distance restante n'est pas déjà inférieure à
 * cette distance d'arrêt : aucune règle ne peut stopper un point plus vite que
 * `accel` ne le permet physiquement.
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

  // Accélération nulle ⇒ aucune commande possible : rendre une entrée pleine
  // vers la cible est le comportement le moins surprenant.
  if (player.accel <= 0) {
    return { moveX: quantize(ux), moveY: quantize(uy) }
  }

  const approach = Math.max(0, player.vx * ux + player.vy * uy)
  const effectiveDistance = Math.max(0, distance - approach * STEP_DT)
  const braking = Math.sqrt(2 * player.accel * effectiveDistance)
  const desired = Math.min(player.maxSpeed, braking)
  const gapX = ux * desired - player.vx
  const gapY = uy * desired - player.vy
  const gap = Math.hypot(gapX, gapY)
  // Écart pile nul : la vitesse actuelle égale déjà la vitesse souhaitée.
  // `gapX / gap` diviserait par zéro, mais rendre une entrée nulle ici
  // rouvrirait le piège du battement (voir MIN_INTENSITY) — on retombe donc
  // sur la direction de la cible, à l'intensité plancher.
  if (gap === 0) {
    return { moveX: quantize(ux * MIN_INTENSITY), moveY: quantize(uy * MIN_INTENSITY) }
  }

  // Ce qu'une image d'accélération pleine peut fournir : au-delà, demander
  // plus ne servirait à rien ; en deçà, demander tout dépasserait la vitesse
  // souhaitée en un pas.
  const reach = player.accel * STEP_DT
  const intensity = Math.max(MIN_INTENSITY, Math.min(1, gap / reach))
  return {
    moveX: quantize((gapX / gap) * intensity),
    moveY: quantize((gapY / gap) * intensity),
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
