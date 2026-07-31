/** Fraction de l'amplitude restant après 1 s : doit décroître vite, sinon la secousse devient une nausée. */
const DECAY_PER_SEC = 0.01
export const MAX_AMPLITUDE = 26
/** Part de l'amplitude convertie en poussée directionnelle initiale. */
const KICK_RATIO = 0.5

export interface Camera {
  /** `dirX`/`dirY` : direction de la poussée initiale (normalisée en interne). Omis, la secousse reste purement aléatoire. */
  shake(amount: number, dirX?: number, dirY?: number): void
  update(dtMs: number): { x: number; y: number }
}

/** Amplitude ressentie = carré de l'amplitude interne, renormalisé sur le plafond : la retombée est nerveuse, pas traînante. */
export function traumaAmplitude(amplitude: number): number {
  return (amplitude / MAX_AMPLITUDE) ** 2 * MAX_AMPLITUDE
}

/** Inverse de `traumaAmplitude` : amplitude interne à demander pour ressentir `felt` px. Les appelants raisonnent en pixels vus, pas dans la courbe carrée interne. */
export function shakeForFelt(felt: number): number {
  return Math.sqrt(Math.max(0, felt) * MAX_AMPLITUDE)
}

/**
 * Direction nulle = aucune poussée. Au-delà d'une longueur de 1 seule
 * l'orientation compte ; en dessous, la longueur module la force — l'appelant
 * peut donc passer une MOYENNE de directions sans la renormaliser.
 */
export function kickFor(amount: number, dirX: number, dirY: number): { x: number; y: number } {
  const length = Math.hypot(dirX, dirY)
  if (length === 0) {
    return { x: 0, y: 0 }
  }
  const strength = (Math.min(1, length) * amount * KICK_RATIO) / length
  return { x: dirX * strength, y: dirY * strength }
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
      // Dimensionnée sur `amount`, pas `amplitude` : sinon une secousse
      // héritait de la poussée du trauma résiduel, sans rapport avec l'impact.
      const kick = kickFor(amount, dirX, dirY)
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
      const decay = DECAY_PER_SEC ** (dtMs / 1000)
      amplitude *= decay
      const offsetX = kickX
      const offsetY = kickY
      kickX *= decay
      kickY *= decay

      const felt = traumaAmplitude(amplitude)
      const angle = Math.random() * Math.PI * 2
      const x = Math.cos(angle) * felt + offsetX
      const y = Math.sin(angle) * felt + offsetY
      // Borne le déplacement combiné (bruit + poussée), pas chacun de ses termes.
      const length = Math.hypot(x, y)
      if (length <= MAX_AMPLITUDE) {
        return { x, y }
      }
      const scale = MAX_AMPLITUDE / length
      return { x: x * scale, y: y * scale }
    },
  }
}
