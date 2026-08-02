/**
 * Générateur pseudo-aléatoire à graine (mulberry32).
 * Toute la simulation passe par lui : c'est ce qui rend une run reproductible,
 * et donc le netcode possible en v3.
 */
export interface Rng {
  next(): number
  int(maxExclusive: number): number
  range(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive)

  return {
    next,
    int,
    range: (min, max) => min + next() * (max - min),
    pick<T>(items: readonly T[]): T {
      const item = items[int(items.length)]
      if (item === undefined) {
        throw new Error('pick() sur une liste vide')
      }
      return item
    },
  }
}
