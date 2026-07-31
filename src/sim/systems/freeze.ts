import { addComponent, defineQuery, hasComponent, Not, removeComponent } from 'bitecs'

import {
  Collider,
  Doomed,
  Enemy,
  FreshlyFrozen,
  Frozen,
  Materializing,
  Position,
  Velocity,
} from '../components'
import { RULE_TUNING } from '../data/powerups'
import { createSpatialHash } from '../spatial-hash'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

const frozen = defineQuery([Frozen, Position, Collider])
// Candidats à la contagion de Givre rampant : un ennemi déjà gelé est exclu,
// garde-fou qui empêche une foule de se regeler elle-même en boucle.
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
 */
export function freezeSystem(world: SimWorld, stats?: RunStats): SimWorld {
  const dt = FIXED_DT * world.timeScale
  const player = world.playerEid
  const px = player >= 0 ? Position.x[player]! : Number.NaN
  const py = player >= 0 ? Position.y[player]! : Number.NaN
  const pr = player >= 0 ? Collider.radius[player]! : 0

  const creepingFrostActive = stats?.rules.has('creepingFrost') ?? false
  let hash: ReturnType<typeof createSpatialHash> | null = null
  if (creepingFrostActive) {
    hash = hashFor(world)
    hash.clear()
    for (const eid of thawed(world)) {
      hash.insert(eid, Position.x[eid]!, Position.y[eid]!)
    }
  }

  // Photographie fixe avant toute mutation : un ennemi tout juste contaminé
  // ne doit pas se propager dans la même passe, sinon le résultat dépendrait
  // de l'ordre d'itération de bitECS plutôt que du seul état du monde.
  for (const eid of [...frozen(world)]) {
    Velocity.x[eid] = 0
    Velocity.y[eid] = 0

    // La contagion ne se déclenche qu'à la transition vers l'état gelé
    // (`FreshlyFrozen`), jamais tant qu'un ennemi reste simplement gelé :
    // ça casse le ping-pong mutuel entre voisins déjà contaminés.
    if (hasComponent(world, FreshlyFrozen, eid)) {
      // Consommé ici : un ennemi qui reste gelé au pas suivant ne repropage
      // plus, tant qu'il ne dégèle puis regèle pas.
      removeComponent(world, FreshlyFrozen, eid)

      if (hash) {
        // Chaque saut emporte une fraction du temps restant, pas la durée
        // pleine : la chaîne s'éteint géométriquement au lieu de se relancer
        // à l'identique à chaque contact.
        const spreadRemaining = Frozen.remaining[eid]! * RULE_TUNING.freezeSpreadFactor
        if (spreadRemaining >= RULE_TUNING.freezeSpreadFloorMs) {
          const fx = Position.x[eid]!
          const fy = Position.y[eid]!
          for (const neighbor of hash.query(fx, fy, RULE_TUNING.freezeSpreadRadius, scratch)) {
            // Un même voisin peut être vu par deux sources cette image : le
            // garde évite de le regeler deux fois dans la boucle.
            if (hasComponent(world, Frozen, neighbor)) {
              continue
            }
            addComponent(world, Frozen, neighbor)
            Frozen.remaining[neighbor] = spreadRemaining
            addComponent(world, FreshlyFrozen, neighbor)
            Velocity.x[neighbor] = 0
            Velocity.y[neighbor] = 0
          }
        }
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
