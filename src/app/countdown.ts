/**
 * Le décompte de reprise. Sortir d'une pause ou d'un choix de carte relançait
 * la simulation à l'image suivante, sans laisser le temps de retrouver le
 * point ; trois chiffres s'intercalent désormais.
 *
 * Piloté par l'horloge réelle, comme `render/fx/death-sequence.ts` et pour la
 * même raison : pendant le décompte, la simulation ne fait aucun pas — son
 * horloge est arrêtée, elle ne peut rien cadencer.
 *
 * Aucun DOM, aucun Pixi : la mise en scène vit dans `ui/screens/countdown.ts`,
 * ce module ne connaît que des millisecondes.
 */

/** Durée d'affichage d'un chiffre, en ms. */
export const COUNTDOWN_STEP_MS = 600
/** Nombre de chiffres affichés : 3, 2, 1. */
export const COUNTDOWN_DIGITS = 3
/** Durée totale, et donc durée de l'état `countdown`. */
export const COUNTDOWN_MS = COUNTDOWN_DIGITS * COUNTDOWN_STEP_MS

export interface Countdown {
  /** 3, 2 ou 1 pendant le décompte ; 0 une fois terminé. */
  readonly digit: number
  readonly done: boolean
  start(): void
  update(dtMs: number): void
}

/**
 * Chiffre affiché à `elapsedMs` du début. Exportée à part de l'instance : le
 * découpage en paliers se teste sans avoir à simuler une horloge.
 *
 * Rend 0 une fois fini, jamais 3 : la vue doit pouvoir distinguer « plus rien
 * à afficher » de « ça recommence ».
 */
export function countdownDigitAt(elapsedMs: number): number {
  if (elapsedMs >= COUNTDOWN_MS) {
    return 0
  }
  return COUNTDOWN_DIGITS - Math.floor(Math.max(0, elapsedMs) / COUNTDOWN_STEP_MS)
}

export function createCountdown(): Countdown {
  // Naît terminé : un `update` reçu avant tout `start` ne doit rien afficher.
  let elapsed = COUNTDOWN_MS

  return {
    get digit(): number {
      return countdownDigitAt(elapsed)
    },
    get done(): boolean {
      return elapsed >= COUNTDOWN_MS
    },
    start(): void {
      elapsed = 0
    },
    update(dtMs: number): void {
      // Écrêté aux deux bouts : un `dt` négatif (horloge qui recule) ne doit
      // pas faire remonter le décompte, un `dt` énorme (onglet remis au premier
      // plan) doit le terminer plutôt que de le dépasser sans borne.
      elapsed = Math.min(COUNTDOWN_MS, elapsed + Math.max(0, dtMs))
    },
  }
}
