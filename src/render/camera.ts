// Fraction de l'amplitude qui subsiste après une seconde pleine. 0.06 (valeur
// initialement envisagée) ne redescend sous 0.5 qu'après ~1.3 s pour une
// secousse de 20 — trop lent pour « décroît vite, sinon la secousse devient
// une nausée » (spec §3.8). 0.01 (1 % restant après 1 s) tient la promesse.
const DECAY_PER_SEC = 0.01
const MAX_AMPLITUDE = 26

export interface Camera {
  shake(amount: number): void
  update(dtMs: number): { x: number; y: number }
}

/**
 * Secousse d'écran. Purement cosmétique : `src/render/` n'écrit jamais dans
 * la simulation, donc rien ici ne peut influencer le déterminisme du jeu.
 * `Math.random()` est donc autorisé (contrairement à `src/sim/`).
 */
export function createCamera(): Camera {
  let amplitude = 0

  return {
    shake(amount: number): void {
      amplitude = Math.min(MAX_AMPLITUDE, amplitude + amount)
    },
    update(dtMs: number): { x: number; y: number } {
      if (amplitude <= 0.01) {
        amplitude = 0
        return { x: 0, y: 0 }
      }
      // Décroissance exponentielle : le retour au calme doit être rapide,
      // sinon la secousse devient une nausée.
      amplitude *= DECAY_PER_SEC ** (dtMs / 1000)
      const angle = Math.random() * Math.PI * 2
      return { x: Math.cos(angle) * amplitude, y: Math.sin(angle) * amplitude }
    },
  }
}
