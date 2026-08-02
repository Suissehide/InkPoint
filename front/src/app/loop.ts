import { FIXED_DT } from '@sim/world'

/**
 * Au-delà, on abandonne le rattrapage (« spirale de la mort »). Exporté :
 * `game.ts` plafonne le `dt` brut de `requestAnimationFrame` à cette même
 * valeur avant de le distribuer à `loop.advance` ET `deathSequence.update`.
 */
export const MAX_CATCHUP_MS = 250

/**
 * Tolérance pour l'imprécision flottante : FIXED_DT (1000/60) n'a pas de
 * représentation binaire exacte, et soustraire en boucle dérive sous le
 * nombre de pas attendu. Diviser avec cette marge élimine la dérive.
 */
const EPSILON = 1e-9

export interface FixedLoop {
  advance(elapsedMs: number): void
}

export function createFixedLoop(cfg: {
  onStep: () => void
  onRender: (alpha: number) => void
}): FixedLoop {
  let accumulator = 0

  return {
    advance(elapsedMs: number): void {
      accumulator += Math.min(elapsedMs, MAX_CATCHUP_MS)
      const steps = Math.floor(accumulator / FIXED_DT + EPSILON)
      for (let i = 0; i < steps; i++) {
        cfg.onStep()
      }
      accumulator -= steps * FIXED_DT
      // La division peut sous-dépasser zéro de quelques ULP : le contrat de
      // onRender est [0, 1), donc on referme la borne.
      const alpha = Math.max(0, accumulator / FIXED_DT)
      cfg.onRender(alpha)
    },
  }
}
