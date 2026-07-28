import { addComponent, defineQuery, hasComponent, Not, removeComponent } from 'bitecs'

import { Collider, Doomed, Enemy, Halo, Invulnerable, Materializing, Position } from '../components'
import { MAX_ENEMY_RADIUS } from '../data/enemies'
import { createSpatialHash } from '../spatial-hash'
import { FIXED_DT, type SimWorld } from '../world'

// Un ennemi en cours de matérialisation est exclu de la requête : la règle
// « pointillé = inoffensif, plein = mortel » doit être vraie sans exception,
// sinon les embuscades ne sont plus des embuscades mais des pièges injustes.
const activeEnemies = defineQuery([Enemy, Position, Collider, Not(Materializing)])
const invulnerables = defineQuery([Invulnerable])

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

export function collisionSystem(world: SimWorld): SimWorld {
  const dt = FIXED_DT * world.timeScale

  for (const eid of invulnerables(world)) {
    const remaining = Invulnerable.remaining[eid]! - dt
    if (remaining <= 0) {
      removeComponent(world, Invulnerable, eid)
    } else {
      Invulnerable.remaining[eid] = remaining
    }
  }

  if (!world.alive || world.playerEid < 0) {
    return world
  }

  const player = world.playerEid
  const hash = hashFor(world)
  hash.clear()

  const list = activeEnemies(world)
  for (const eid of list) {
    hash.insert(eid, Position.x[eid]!, Position.y[eid]!)
  }

  if (hasComponent(world, Invulnerable, player)) {
    return world
  }

  const px = Position.x[player]!
  const py = Position.y[player]!
  const pr = Collider.radius[player]!

  // Marge dérivée des définitions d'ennemis, jamais écrite en dur (voir
  // MAX_ENEMY_RADIUS) : sinon un ennemi plus large ajouté plus tard sortirait
  // de la fenêtre de recherche et traverserait le joueur sans être touché.
  for (const eid of hash.query(px, py, pr + MAX_ENEMY_RADIUS, scratch)) {
    const r = pr + Collider.radius[eid]!
    const dx = Position.x[eid]! - px
    const dy = Position.y[eid]! - py
    if (dx * dx + dy * dy > r * r) {
      continue
    }

    if (hasComponent(world, Halo, player)) {
      removeComponent(world, Halo, player)
      addComponent(world, Doomed, eid)
      addComponent(world, Invulnerable, player)
      Invulnerable.remaining[player] = 1000
      world.events.push({ type: 'haloBroken', x: px, y: py })
      return world
    }

    world.alive = false
    world.events.push({ type: 'playerDied', x: px, y: py })
    return world
  }

  return world
}
