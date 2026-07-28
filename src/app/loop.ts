import { FIXED_DT } from '@/sim/world'

/** Au-delà, on abandonne le rattrapage : un onglet en arrière-plan ne doit
 *  pas provoquer des centaines de pas d'un coup (« spirale de la mort »). */
const MAX_CATCHUP_MS = 250

/**
 * Tolérance pour absorber l'imprécision des flottants IEEE 754. FIXED_DT
 * (1000 / 60) n'a pas de représentation binaire exacte : soustraire cette
 * valeur plusieurs fois de suite dérive légèrement en dessous du nombre de
 * pas attendu (ex. 3 × FIXED_DT peut ne restituer que 2 pas). Diviser plutôt
 * que soustraire en boucle, avec cette marge, élimine la dérive.
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
      // À la limite de rattrapage (250 ms), la division ci-dessus peut
      // sous-dépasser zéro de quelques ULP (ex. -1.7e-15) : le contrat de
      // onRender est [0, 1), donc on referme la borne plutôt que de faire
      // confiance à l'arithmétique flottante.
      const alpha = Math.max(0, accumulator / FIXED_DT)
      cfg.onRender(alpha)
    },
  }
}
