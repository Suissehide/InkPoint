import { addComponent, defineQuery, hasComponent, Not } from 'bitecs'

import {
  Attractor,
  Collider,
  Dasher,
  Doomed,
  Enemy,
  FreshlyFrozen,
  Frozen,
  Hazard,
  Materializing,
  Position,
  Velocity,
} from '../components'
import { MAX_ENEMY_RADIUS } from '../data/enemies'
import {
  HAZARD_AFTERBURN,
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_FREEZE,
  HAZARD_STRIKE,
  HAZARD_TRAIL,
  POWERUP_BASE,
  RULE_TUNING,
} from '../data/powerups'
import { createSpatialHash } from '../spatial-hash'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

const hazards = defineQuery([Hazard, Position])
// Un ennemi en cours de matérialisation reste hors d'atteinte des zones, comme
// des collisions directes (spec §3.3) : le pointillé reste inoffensif partout.
const targets = defineQuery([Enemy, Position, Collider, Not(Materializing)])

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

const LETHAL = new Set([HAZARD_BLAST, HAZARD_TRAIL, HAZARD_STRIKE, HAZARD_AFTERBURN])

/**
 * `stats` est optionnel : les tests de ce fichier appellent `hazardSystem(w)`
 * sans lui, pour isoler la croissance de l'anneau et les effets de base. Sans
 * carte rare/mythique active, le comportement est strictement celui d'avant
 * cette tâche.
 */
export function hazardSystem(world: SimWorld, stats?: RunStats): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale
  // Lu depuis les stats (pas la constante) : « Gel prolongé » doit vraiment
  // allonger la durée du gel, y compris pour Givre rampant qui la réutilise.
  const freezeDurationMs = stats?.freezeDurationMs ?? POWERUP_BASE.freeze.durationMs
  const shockwaveActive = stats?.rules.has('shockwave') ?? false

  const hash = hashFor(world)
  hash.clear()
  for (const eid of targets(world)) {
    hash.insert(eid, Position.x[eid]!, Position.y[eid]!)
  }

  for (const hid of hazards(world)) {
    const kind = Hazard.kind[hid]!
    const growth = Hazard.growthRate[hid]!
    if (growth > 0) {
      Hazard.radius[hid] = Math.min(Hazard.maxRadius[hid]!, Hazard.radius[hid]! + growth * dt)
    }

    const hx = Position.x[hid]!
    const hy = Position.y[hid]!
    const hr = Hazard.radius[hid]!
    const isShockwaveBlast = kind === HAZARD_BLAST && shockwaveActive

    // Marge dérivée des définitions d'ennemis, jamais écrite en dur (voir
    // MAX_ENEMY_RADIUS) : sinon un ennemi plus large ajouté plus tard sortirait
    // de la fenêtre de recherche et traverserait les zones sans être touché.
    // Onde de choc : la fenêtre de recherche s'élargit jusqu'à l'anneau de
    // recul, au-delà du rayon mortel, seulement pour une Bombe qui a la règle.
    const searchRadius = isShockwaveBlast ? hr * RULE_TUNING.shockwave.ringMultiplier : hr
    for (const eid of hash.query(hx, hy, searchRadius + MAX_ENEMY_RADIUS, scratch)) {
      const enemyRadius = Collider.radius[eid]!
      const r = hr + enemyRadius
      const dx = Position.x[eid]! - hx
      const dy = Position.y[eid]! - hy
      const distSq = dx * dx + dy * dy

      if (distSq > r * r) {
        // Hors du rayon mortel : seule l'onde de choc d'une Bombe agit encore
        // ici, sur l'anneau juste au-delà (carte mythique « Onde de choc »).
        // Un Éclat en charge ne doit jamais être dévié — sa trajectoire figée
        // en ligne droite est toute sa lisibilité (spec §3.6) — et un ennemi
        // gelé est de toute façon remis à vitesse nulle juste après par
        // freezeSystem : autant ne pas écrire une vélocité qui ne survivra
        // pas au pas.
        if (
          isShockwaveBlast &&
          !hasComponent(world, Dasher, eid) &&
          !hasComponent(world, Frozen, eid)
        ) {
          const ringR = hr * RULE_TUNING.shockwave.ringMultiplier + enemyRadius
          if (distSq <= ringR * ringR) {
            const dist = Math.sqrt(distSq) || 1
            const speed = RULE_TUNING.shockwave.impulseSpeed
            Velocity.x[eid] = Velocity.x[eid]! + (dx / dist) * speed
            Velocity.y[eid] = Velocity.y[eid]! + (dy / dist) * speed
          }
        }
        continue
      }

      if (LETHAL.has(kind)) {
        addComponent(world, Doomed, eid)
      } else if (kind === HAZARD_FREEZE) {
        // Applique seulement à l'entrée dans la zone : un ennemi déjà gelé n'a
        // pas son minuteur remis à `freezeDurationMs` chaque image tant qu'il
        // reste dans le rayon, sinon il resterait gelé toute la vie de la
        // zone plus la durée pleine après en être sorti — et `FreshlyFrozen`
        // ne serait plus un marqueur de transition mais un état permanent.
        if (!hasComponent(world, Frozen, eid)) {
          addComponent(world, Frozen, eid)
          Frozen.remaining[eid] = freezeDurationMs
          addComponent(world, FreshlyFrozen, eid)
        }
        Velocity.x[eid] = 0
        Velocity.y[eid] = 0
      } else if (kind === HAZARD_BLOTTER) {
        // Aspire sans tuer : le Buvard n'existe que par ses combinaisons (spec §3.4).
        const dist = Math.sqrt(distSq) || 1
        const pull = Attractor.strength[hid] ?? POWERUP_BASE.blotter.strength
        Velocity.x[eid] = Velocity.x[eid]! - (dx / dist) * pull * dt
        Velocity.y[eid] = Velocity.y[eid]! - (dy / dist) * pull * dt
      }
    }
  }

  return world
}
