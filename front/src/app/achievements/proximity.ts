import { Position } from '@/sim/components'
import { activeEnemies } from '@/sim/systems/collision'
import type { SimWorld } from '@/sim/world'

/**
 * Distance du joueur à l'ennemi le plus proche **capable de le tuer** —
 * `activeEnemies` exclut le pointillé, le gelé et le condamné, exactement
 * comme la collision. `Infinity` quand il n'y en a aucun.
 *
 * Seul fichier de `achievements/` à faire une requête bitECS : le reste du
 * dossier se teste sur des littéraux.
 */
export function nearestActiveEnemyDistance(world: SimWorld): number {
  const player = world.playerEid
  if (player < 0) {
    return Number.POSITIVE_INFINITY
  }
  const px = Position.x[player] ?? 0
  const py = Position.y[player] ?? 0

  let best = Number.POSITIVE_INFINITY
  for (const eid of activeEnemies(world)) {
    const dx = (Position.x[eid] ?? 0) - px
    const dy = (Position.y[eid] ?? 0) - py
    const d2 = dx * dx + dy * dy
    if (d2 < best) {
      best = d2
    }
  }
  // Une seule racine, à la fin : la comparaison se fait sur les carrés.
  return best === Number.POSITIVE_INFINITY ? best : Math.sqrt(best)
}
