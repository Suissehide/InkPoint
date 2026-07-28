/**
 * Grille de hachage spatial. Avec 200+ ennemis, une comparaison naïve deux à
 * deux ferait 20 000 tests par image : c'est le goulot d'étranglement évident.
 * On ne compare que les entités des cellules voisines.
 */
export interface SpatialHash {
  clear(): void
  insert(eid: number, x: number, y: number): void
  query(x: number, y: number, radius: number, out: number[]): number[]
}

export function createSpatialHash(cellSize: number): SpatialHash {
  const cells = new Map<number, number[]>()

  // Clé entière stable pour un couple de coordonnées de cellule, négatives comprises.
  const key = (cx: number, cy: number): number => (cx + 0x8000) * 0x10000 + (cy + 0x8000)

  return {
    clear(): void {
      cells.clear()
    },

    insert(eid: number, x: number, y: number): void {
      const k = key(Math.floor(x / cellSize), Math.floor(y / cellSize))
      const bucket = cells.get(k)
      if (bucket) {
        bucket.push(eid)
      } else {
        cells.set(k, [eid])
      }
    },

    query(x: number, y: number, radius: number, out: number[]): number[] {
      out.length = 0
      const minX = Math.floor((x - radius) / cellSize)
      const maxX = Math.floor((x + radius) / cellSize)
      const minY = Math.floor((y - radius) / cellSize)
      const maxY = Math.floor((y + radius) / cellSize)

      for (let cx = minX; cx <= maxX; cx++) {
        for (let cy = minY; cy <= maxY; cy++) {
          const bucket = cells.get(key(cx, cy))
          if (!bucket) {
            continue
          }
          for (const eid of bucket) {
            out.push(eid)
          }
        }
      }
      return out
    },
  }
}
