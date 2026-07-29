/** Miroir de la palette Tailwind (src/styles/main.css). Un seul endroit fait foi
 *  côté simulation visuelle ; toute divergence est un bug. */
export const INK = {
  bg: 0x0a0f1e,
  bgDeep: 0x060a14,
  paper: 0xeae4d6,
  danger: 0xe04f4f,
  blast: 0xffd166,
  frost: 0x8fd8ff,
} as const

/** Cadence du frémissement du trait, indépendante du framerate (spec §2). */
export const BOIL_FPS = 8
export const BOIL_PERIOD_MS = 1000 / BOIL_FPS
