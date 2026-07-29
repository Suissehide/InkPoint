import { addComponent, defineQuery, hasComponent, Not, removeComponent } from 'bitecs'

import { Collider, Doomed, Enemy, Frozen, Materializing, Position, Velocity } from '../components'
import { POWERUP_BASE, RULE_TUNING } from '../data/powerups'
import { createSpatialHash } from '../spatial-hash'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

const frozen = defineQuery([Frozen, Position, Collider])
// Candidats à la contagion de Givre rampant : un ennemi déjà gelé est exclu —
// c'est le garde-fou qui empêche une foule de se regeler elle-même en boucle
// à chaque image (voir le rapport de tâche).
const thawed = defineQuery([Enemy, Position, Collider, Not(Materializing), Not(Frozen)])

const hashes = new WeakMap<SimWorld, ReturnType<typeof createSpatialHash>>()
const scratch: number[] = []

function hashFor(world: SimWorld) {
  let h = hashes.get(world)
  if (!h) {
    h = createSpatialHash(64)
    hashes.set(world, h)
  }
  return h
}

/**
 * Maintient les ennemis gelés immobiles, et les tue au contact du joueur :
 * le gel transforme le joueur lui-même en arme (spec §3.4).
 *
 * `stats` est optionnel : les tests existants appellent `freezeSystem(w)` sans
 * lui, pour isoler minuteur et mort au contact — sans carte, le comportement
 * est identique à avant cette tâche.
 */
export function freezeSystem(world: SimWorld, stats?: RunStats): SimWorld {
  const dt = FIXED_DT * world.timeScale
  const player = world.playerEid
  const px = player >= 0 ? Position.x[player]! : Number.NaN
  const py = player >= 0 ? Position.y[player]! : Number.NaN
  const pr = player >= 0 ? Collider.radius[player]! : 0

  const creepingFrostActive = stats?.rules.has('creepingFrost') ?? false
  const freezeDurationMs = stats?.freezeDurationMs ?? POWERUP_BASE.freeze.durationMs
  let hash: ReturnType<typeof createSpatialHash> | null = null
  if (creepingFrostActive) {
    hash = hashFor(world)
    hash.clear()
    for (const eid of thawed(world)) {
      hash.insert(eid, Position.x[eid]!, Position.y[eid]!)
    }
  }

  // Photographie fixe de la liste avant toute mutation : un ennemi tout juste
  // contaminé ci-dessous ne doit pas se propager lui-même dans la même passe,
  // sinon l'ordre d'itération (et donc le résultat) dépendrait de détails
  // internes de bitECS plutôt que du seul état du monde. Il se propagera au
  // pas suivant — c'est précisément ce qui fait « ramper » le givre plutôt
  // que d'envahir la carte d'un coup.
  for (const eid of [...frozen(world)]) {
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0

    if (hash) {
      const fx = Position.x[eid]!
      const fy = Position.y[eid]!
      for (const neighbor of hash.query(fx, fy, RULE_TUNING.freezeSpreadRadius, scratch)) {
        // Un même voisin peut être vu par deux ennemis gelés cette image (les
        // deux dans le hash query rendraient compte du même point) : le garde
        // `hasComponent` évite de le regeler une deuxième fois dans la boucle.
        if (hasComponent(world, Frozen, neighbor)) {
          continue
        }
        addComponent(world, Frozen, neighbor)
        Frozen.remaining[neighbor] = freezeDurationMs
        Velocity.x[neighbor] = 0
        Velocity.y[neighbor] = 0
      }
    }

    if (player >= 0 && world.alive) {
      const r = pr + Collider.radius[eid]!
      const dx = Position.x[eid]! - px
      const dy = Position.y[eid]! - py
      if (dx * dx + dy * dy <= r * r) {
        addComponent(world, Doomed, eid)
        continue
      }
    }

    const remaining = Frozen.remaining[eid]! - dt
    if (remaining <= 0) {
      removeComponent(world, Frozen, eid)
    } else {
      Frozen.remaining[eid] = remaining
    }
  }

  return world
}
