/** Interpolation linéaire simple entre deux valeurs. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
