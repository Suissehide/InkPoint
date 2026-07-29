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

// Un ennemi en cours de matérialisation est exclu de la requête : la règle
// « pointillé = inoffensif, plein = mortel » doit être vraie sans exception,
// sinon les embuscades ne sont plus des embuscades mais des pièges injustes.
/**
 * `Not(Frozen)` est indispensable, pas défensif. La mort est différée : quand le
 * joueur traverse un ennemi gelé, `freezeSystem` le marque `Doomed` mais ne le
 * supprime qu'en fin de pas — entre les deux, `collisionSystem` le verrait encore
 * comme un ennemi actif et **tuerait le joueur**. Le Gel, dont toute la raison
 * d'être est de faire du corps du joueur une arme, deviendrait mortel pour lui.
 */
// `Not(Doomed)` pour la même raison que `Not(Frozen)` : la mort étant différée,
// un ennemi tué par une bombe reste présent jusqu'à la fin du pas. Sans cette
// exclusion, une bombe déclenchée sur un ennemi au contact tue le joueur dans
// la même image — le power-up se retourne contre celui qui l'utilise.
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

  // La ruée vaut invulnérabilité, sans composant séparé : deux minuteurs pour un
  // même état finiraient toujours par diverger d'un pas, et c'est exactement ce
  // qui tuait le joueur sur la dernière image de sa Plume.
  if (hasComponent(world, Invulnerable, player) || hasComponent(world, Dashing, player)) {
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
