/**
 * Tampon circulaire des positions du joueur, horodatées en temps de simulation.
 * Les ennemis y lisent où le joueur était il y a N ms : c'est ce délai qui rend
 * l'esquive par changement de direction lisible (spec §3.3).
 */
export interface PositionHistory {
  push(t: number, x: number, y: number): void
  sample(t: number): { x: number; y: number }
}

export function createPositionHistory(capacity: number): PositionHistory {
  const ts = new Float64Array(capacity)
  const xs = new Float32Array(capacity)
  const ys = new Float32Array(capacity)
  let count = 0
  let head = 0 // prochain indice d'écriture

  const at = (i: number) => (head - count + i + capacity * 2) % capacity

  return {
    push(t: number, x: number, y: number): void {
      ts[head] = t
      xs[head] = x
      ys[head] = y
      head = (head + 1) % capacity
      if (count < capacity) {
        count++
      }
    },

    sample(t: number): { x: number; y: number } {
      if (count === 0) {
        return { x: 0, y: 0 }
      }

      const oldest = at(0)
      if (t <= ts[oldest]!) {
        return { x: xs[oldest]!, y: ys[oldest]! }
      }

      const newest = at(count - 1)
      if (t >= ts[newest]!) {
        return { x: xs[newest]!, y: ys[newest]! }
      }

      for (let i = count - 1; i > 0; i--) {
        const cur = at(i)
        const prev = at(i - 1)
        if (t >= ts[prev]! && t <= ts[cur]!) {
          const span = ts[cur]! - ts[prev]!
          const f = span === 0 ? 0 : (t - ts[prev]!) / span
          return {
            x: xs[prev]! + (xs[cur]! - xs[prev]!) * f,
            y: ys[prev]! + (ys[cur]! - ys[prev]!) * f,
          }
        }
      }
      return { x: xs[newest]!, y: ys[newest]! }
    },
  }
}
