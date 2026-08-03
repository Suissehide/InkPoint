import type { InputState } from '@sim/input'

import type { Viewport } from '@/render/viewport'
import type { InputSource, Point } from './input-source'
import { type Display, screenToApp } from './orientation'

/** Rayon de saturation du joystick, en pixels de fenêtre. */
export const JOYSTICK_RADIUS = 56

/**
 * Fraction du rayon sous laquelle rien n'est commandé. Un pouce posé tremble ;
 * sans cette zone, le point dériverait dès qu'on touche l'écran.
 */
export const JOYSTICK_DEAD_ZONE = 0.15

/**
 * Pas de quantification des entrées — prérequis du netcode v3 (spec §3.5).
 * Si le chantier replay a déjà exporté `QUANTUM` depuis `@sim/input`,
 * l'importer de là plutôt que de le redéclarer ici (voir tâche 5, étape 3).
 */
const QUANTUM = 1 / 128

function quantize(value: number): number {
  return Math.round(value / QUANTUM) * QUANTUM
}

/**
 * Direction **unitaire** et magnitude séparées, et c'est le point clé : la
 * direction part dans `moveX`/`moveY`, donc l'accélération est toujours pleine,
 * et la magnitude part dans `speedCap`, donc c'est la VITESSE qui est dosée.
 * Une déflexion à mi-course donne « moins vite », pas « accélère moins » —
 * sans quoi la course finirait quand même à la vitesse maximale.
 *
 * Coordonnées attendues : locales à `#app`, pas écran. La rotation est absorbée
 * en amont par `screenToApp`.
 */
export function joystickVector(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
  radius: number,
): { x: number; y: number; magnitude: number } {
  const dx = currentX - originX
  const dy = currentY - originY
  const distance = Math.hypot(dx, dy)
  if (distance <= JOYSTICK_DEAD_ZONE * radius) {
    return { x: 0, y: 0, magnitude: 0 }
  }
  return {
    x: dx / distance,
    y: dy / distance,
    magnitude: Math.min(1, distance / radius),
  }
}

export interface JoystickSource extends InputSource {
  /** Rebranché par `game.ts` à chaque `applyLayout`. */
  setDisplay(display: Display): void
  setViewport(viewport: Viewport): void
  /** Origine courante en coordonnées locales à `#app`, `null` si aucun doigt n'est posé. Le halo la suit. */
  origin(): Point | null
  /** Relâche la commande sans attendre un `pointerup` — appelé à chaque changement d'état de jeu. */
  release(): void
}

/**
 * Joystick **ancré mais tolérant** : un halo dessiné en bas à gauche montre où
 * poser le pouce, mais tout contact dans le quart inférieur gauche de l'aire de
 * jeu arme le joystick à l'endroit du contact. Dans un jeu d'esquive, exiger de
 * viser une base dessinée coûte trop cher.
 */
export function createJoystick(target: HTMLElement): JoystickSource {
  let display: Display = { quarters: 0, windowWidth: 0, windowHeight: 0 }
  let viewport: Viewport | null = null
  let pointerId: number | null = null
  let originPoint: Point | null = null
  let currentPoint: Point | null = null

  /**
   * Le quart inférieur gauche de l'AIRE DE JEU, pas de la fenêtre : sur un
   * écran plus large que 16:9, la marge latérale n'appartient pas au jeu.
   */
  const inCaptureZone = (local: Point): boolean => {
    if (viewport === null) {
      return false
    }
    const left = viewport.x
    const right = viewport.x + viewport.arenaWidth * viewport.scale
    const bottom = viewport.y + viewport.arenaHeight * viewport.scale
    const top = viewport.y + (viewport.arenaHeight * viewport.scale) / 2
    return local.x >= left && local.x <= (left + right) / 2 && local.y >= top && local.y <= bottom
  }

  const onDown = (event: PointerEvent): void => {
    if (pointerId !== null) {
      // Un seul doigt : pas de multi-touch dans ce lot.
      return
    }
    const local = screenToApp(event.clientX, event.clientY, display)
    if (!inCaptureZone(local)) {
      return
    }
    pointerId = event.pointerId
    originPoint = local
    currentPoint = local
  }

  const onMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return
    }
    currentPoint = screenToApp(event.clientX, event.clientY, display)
  }

  const onUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return
    }
    pointerId = null
    originPoint = null
    currentPoint = null
  }

  target.addEventListener('pointerdown', onDown)
  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  // `pointercancel` n'est pas décoratif : un appel entrant, un geste système
  // ou un défilement l'émettent SANS `pointerup`, et le joystick resterait
  // armé sur sa dernière position — le joueur partirait tout droit dans un mur.
  target.addEventListener('pointercancel', onUp)

  return {
    setDisplay(next: Display): void {
      display = next
    },

    setViewport(next: Viewport): void {
      viewport = next
    },

    origin(): Point | null {
      return originPoint
    },

    release(): void {
      pointerId = null
      originPoint = null
      currentPoint = null
    },

    // Se conforme à `InputSource` sans déclarer son second paramètre, comme
    // `keyboard.ts` : le joystick n'a pas besoin de savoir où est le joueur.
    writeInto(input: InputState): void {
      if (originPoint === null || currentPoint === null) {
        input.moveX = 0
        input.moveY = 0
        // 1 et non 0 : un plafond nul survivrait au relâchement et
        // empêcherait la friction de ramener le point à l'arrêt proprement.
        input.speedCap = 1
        return
      }
      const v = joystickVector(
        originPoint.x,
        originPoint.y,
        currentPoint.x,
        currentPoint.y,
        JOYSTICK_RADIUS,
      )
      input.moveX = quantize(v.x)
      input.moveY = quantize(v.y)
      input.speedCap = v.magnitude === 0 ? 1 : quantize(v.magnitude)
    },

    destroy(): void {
      target.removeEventListener('pointerdown', onDown)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    },
  }
}
