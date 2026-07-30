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

/**
 * Inverse de `traumaAmplitude` : quelle amplitude interne demander pour
 * ressentir `felt` pixels de déplacement. Les appelants raisonnent ainsi en
 * pixels réellement vus, et la courbe (carrée) reste un détail interne — sans
 * cette inversion, passer en trauma² divisait silencieusement toutes les
 * secousses déjà réglées (un kill à ×1 tombait de 3,5 px à 0,47 px).
 */
export function shakeForFelt(felt: number): number {
  return Math.sqrt(Math.max(0, felt) * MAX_AMPLITUDE)
}

/**
 * Poussée initiale d'une secousse dirigée. Direction nulle = aucune poussée.
 * Au-delà d'une longueur de 1, seule l'orientation compte ; en dessous, la
 * longueur module la force. L'appelant peut ainsi passer une MOYENNE de
 * directions : des impacts qui s'annulent mutuellement donnent un vecteur
 * court, donc une poussée faible, au lieu d'être renormalisés en une poussée
 * pleine dans une direction quasi arbitraire.
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
      // Dimensionnée sur `amount`, pas sur `amplitude` : sinon une petite
      // secousse dirigée arrivant sur un trauma résiduel héritait de la
      // poussée du résiduel, sans rapport avec l'impact qui la déclenche.
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
      const x = Math.cos(angle) * felt + offsetX
      const y = Math.sin(angle) * felt + offsetY
      // La poussée s'ajoutait au bruit HORS du plafond : bruit et poussée
      // alignés atteignaient 39 px contre les 26 px documentés. On borne le
      // déplacement combiné, pas chacun de ses termes.
      const length = Math.hypot(x, y)
      if (length <= MAX_AMPLITUDE) {
        return { x, y }
      }
      const scale = MAX_AMPLITUDE / length
      return { x: x * scale, y: y * scale }
    },
  }
}
