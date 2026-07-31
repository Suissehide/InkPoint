import type { Viewport } from '@/render/viewport'
import type { Point } from './input-source'

/**
 * Au-delà de ce rayon, plein régime ; en deçà, l'intensité décroît et le point
 * se pose sur la cible au lieu de la dépasser en oscillant. Le point freine en
 * `v²/2a` = 240²/(2×2667) ≈ 11 px : 32 px laisse cette marge de freinage sans
 * amollir la course. Valeur de première passe, à régler en jouant.
 */
const FULL_THROTTLE_RADIUS = 32

/**
 * Sous ce seuil, l'entrée est nulle : la friction immobilise le point net, et
 * `Facing` conserve son dernier cap (`FACING_MIN_SPEED`) au lieu de frémir.
 * C'est aussi ce qui garantit qu'aucun angle n'est calculé sur une distance
 * nulle.
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
