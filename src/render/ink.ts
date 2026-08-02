/** Miroir de la palette Tailwind (src/styles/main.css). Un seul endroit fait foi
 *  côté simulation visuelle ; toute divergence est un bug. */
export const INK = {
  bg: 0x0a0f1e,
  bgDeep: 0x060a14,
  paper: 0xeae4d6,
  danger: 0xe04f4f,
  blast: 0xffd166,
  frost: 0x8fd8ff,
  /** Encre violette de l'Éclat. Seul créneau de teinte libre entre `danger`
   *  (0°), `blast` (45°) et `frost` (200°), et il reste distinguable du rouge
   *  en deutéranopie — le rouge y vire brun, le violet bleuté. */
  shard: 0xb25ce0,
} as const

/** Cadence du frémissement du trait, indépendante du framerate. */
export const BOIL_FPS = 8
export const BOIL_PERIOD_MS = 1000 / BOIL_FPS

/** Mélange deux couleurs de la palette, composante par composante. */
export function mixColor(from: number, to: number, t: number): number {
  const k = Math.min(1, Math.max(0, t))
  const mix = (shift: number): number => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff
    return Math.round(a + (b - a) * k) << shift
  }
  return mix(16) | mix(8) | mix(0)
}
