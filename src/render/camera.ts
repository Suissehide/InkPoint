// Fraction de l'amplitude qui subsiste après une seconde pleine. 0.06 (valeur
// initialement envisagée) ne redescend sous 0.5 qu'après ~1.3 s pour une
// secousse de 20 — trop lent pour « décroît vite, sinon la secousse devient
// une nausée » (spec §3.8). 0.01 (1 % restant après 1 s) tient la promesse.
const DECAY_PER_SEC = 0.01
export const MAX_AMPLITUDE = 26
/** Part de l'amplitude convertie en poussée directionnelle initiale. */
const KICK_RATIO = 0.5

export interface Camera {
  /**
   * `dirX`/`dirY` : direction de la poussée initiale (normalisée en interne).
   * Omis, la secousse reste purement aléatoire comme avant.
   */
  shake(amount: number, dirX?: number, dirY?: number): void
  update(dtMs: number): { x: number; y: number }
}

/**
 * Amplitude ressentie = carré de l'amplitude interne, renormalisé sur le
 * plafond. Une secousse à mi-course ne déplace qu'au quart : la retombée est
 * nerveuse au lieu de traîner, à niveau de secousse déclenché égal (spec §5.5).
 */
export function traumaAmplitude(amplitude: number): number {
  return (amplitude / MAX_AMPLITUDE) ** 2 * MAX_AMPLITUDE
}

/** Poussée initiale d'une secousse dirigée. Direction nulle = aucune poussée. */
export function kickFor(amount: number, dirX: number, dirY: number): { x: number; y: number } {
  const length = Math.hypot(dirX, dirY)
  if (length === 0) {
    return { x: 0, y: 0 }
  }
  return { x: (dirX / length) * amount * KICK_RATIO, y: (dirY / length) * amount * KICK_RATIO }
}

/**
 * Secousse d'écran. Purement cosmétique : `src/render/` n'écrit jamais dans
 * la simulation, donc rien ici ne peut influencer le déterminisme du jeu.
 * `Math.random()` est donc autorisé (contrairement à `src/sim/`).
 */
export function createCamera(): Camera {
  let amplitude = 0
  let kickX = 0
  let kickY = 0

  return {
    shake(amount: number, dirX = 0, dirY = 0): void {
      amplitude = Math.min(MAX_AMPLITUDE, amplitude + amount)
      const kick = kickFor(amplitude, dirX, dirY)
      // Remplace au lieu de cumuler : deux kills opposés dans la même frame
      // s'annuleraient sinon, alors que chacun devrait pousser l'image.
      if (kick.x !== 0 || kick.y !== 0) {
        kickX = kick.x
        kickY = kick.y
      }
    },

    update(dtMs: number): { x: number; y: number } {
      if (amplitude <= 0.01 && Math.hypot(kickX, kickY) <= 0.01) {
        amplitude = 0
        kickX = 0
        kickY = 0
        return { x: 0, y: 0 }
      }
      // Décroissance exponentielle : le retour au calme doit être rapide,
      // sinon la secousse devient une nausée.
      const decay = DECAY_PER_SEC ** (dtMs / 1000)
      amplitude *= decay
      const offsetX = kickX
      const offsetY = kickY
      kickX *= decay
      kickY *= decay

      const felt = traumaAmplitude(amplitude)
      const angle = Math.random() * Math.PI * 2
      return { x: Math.cos(angle) * felt + offsetX, y: Math.sin(angle) * felt + offsetY }
    },
  }
}
