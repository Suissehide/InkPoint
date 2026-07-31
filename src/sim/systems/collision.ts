import { addComponent, defineQuery, hasComponent, Not, removeComponent } from 'bitecs'

import {
  Collider,
  Dashing,
  Doomed,
  Enemy,
  Frozen,
  Halo,
  Invulnerable,
  Materializing,
  Position,
} from '../components'
import { MAX_ENEMY_RADIUS } from '../data/enemies'
import { createSpatialHash } from '../spatial-hash'
import { FIXED_DT, type SimWorld } from '../world'

// `Not(Materializing)` : « pointillé = inoffensif, plein = mortel » doit être
// vrai sans exception, sinon les embuscades deviennent des pièges injustes.
// `Not(Frozen)` est indispensable, pas défensif : la mort est différée
// (`freezeSystem` marque `Doomed` mais ne supprime qu'en fin de pas) — sans
// cette exclusion, un ennemi gelé traversé par le joueur tuerait ce dernier.
// `Not(Doomed)` de même : un ennemi tué par une bombe reste présent jusqu'à
// la fin du pas, sans quoi une bombe au contact tuerait le joueur en retour.
const activeEnemies = defineQuery([
  Enemy,
  Position,
  Collider,
  Not(Materializing),
  Not(Frozen),
  Not(Doomed),
])
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

  // La ruée vaut invulnérabilité, sans composant séparé : deux minuteurs pour
  // un même état finissent par diverger d'un pas, ce qui a déjà tué le
  // joueur sur la dernière image de la ruée.
  if (hasComponent(world, Invulnerable, player) || hasComponent(world, Dashing, player)) {
    return world
  }

  const px = Position.x[player]!
  const py = Position.y[player]!
  const pr = Collider.radius[player]!

  // Marge dérivée de MAX_ENEMY_RADIUS, jamais en dur : sinon un ennemi plus
  // large ajouté plus tard sortirait de la fenêtre de recherche.
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
