/**
 * Tampon circulaire des positions du joueur, horodatées en temps de simulation.
 * Les ennemis y lisent où le joueur était il y a N ms : c'est ce délai qui rend
 * l'esquive par changement de direction lisible (spec §3.3).
 */
export interface PositionHistory {
  push(t: number, x: number, y: number): void
  sample(t: number): { x: number; y: number }
  /**
   * Horodatage du plus ancien échantillon retenu, `null` tant que rien n'a été
   * poussé. Sert à savoir si l'historique **couvre** un instant demandé :
   * `sample` retombe silencieusement sur le plus ancien échantillon quand ce
   * n'est pas le cas, ce qu'un appelant peut vouloir distinguer d'une vraie
   * réponse (le calque de « Papier calque » ne naît pas avant).
   */
  oldestTime(): number | null
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
      // Un pas où le temps de simulation n'a pas avancé ne pousse rien. C'est
      // le cas pendant un hitstop (`world.timeScale` à 0) : les pas continuent,
      // `world.time` non. Sans ce garde-fou, le tampon se remplirait
      // d'échantillons portant tous le même horodatage et l'historique utile se
      // raccourcirait d'autant — la capacité cesserait de se déduire du seul
      // retard à couvrir, pour dépendre de la durée et de la cadence des
      // hitstops, deux constantes qui vivent côté app et que la simulation ne
      // peut pas importer (le chemin n'est pas écrit ici : `purity.test.ts`
      // est un scan textuel, il le lirait comme un import interdit).
      //
      // Rien n'est perdu : pendant un hitstop la simulation est figée, le
      // joueur n'a pas bougé, l'échantillon ignoré est le sosie du précédent.
      if (count > 0 && t <= ts[at(count - 1)]!) {
        return
      }
      ts[head] = t
      xs[head] = x
      ys[head] = y
      head = (head + 1) % capacity
      if (count < capacity) {
        count++
      }
    },

    oldestTime(): number | null {
      return count === 0 ? null : ts[at(0)]!
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
