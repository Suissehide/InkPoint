import { addComponent, defineQuery, hasComponent, Not, removeComponent } from 'bitecs'

import {
  Attractor,
  Collider,
  Dasher,
  Doomed,
  Enemy,
  Formation,
  Hazard,
  Homing,
  Materializing,
  Position,
  Velocity,
  Vortexed,
} from '../components'
import { ENEMIES, ENEMY_TYPE_BY_ID, MAX_ENEMY_RADIUS } from '../data/enemies'
import {
  HAZARD_AFTERBURN,
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_BRAMBLE,
  HAZARD_SPLATTER,
  HAZARD_TRAIL,
  POWERUP_BASE,
} from '../data/powerups'
import { createSpatialHash } from '../spatial-hash'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

const hazards = defineQuery([Hazard, Position])
// Un ennemi en matérialisation reste hors d'atteinte des zones (spec §3.3) :
// le pointillé reste inoffensif partout.
const targets = defineQuery([Enemy, Position, Collider, Not(Materializing)])
// Ennemis gouvernés par un tourbillon de Buvard, pour la passe de libération en fin de pas.
const vortexed = defineQuery([Vortexed, Enemy])

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

// La goutte de Bavure y est, la plume de la Volée non : la goutte tue par
// elle-même et le disque affiché est le disque qui tue, là où la plume ne fait
// que poser une explosion à l'impact (voir seeker.ts et ricochet.ts).
const LETHAL = new Set([
  HAZARD_BLAST,
  HAZARD_TRAIL,
  HAZARD_BRAMBLE,
  HAZARD_AFTERBURN,
  HAZARD_SPLATTER,
])

export function hazardSystem(world: SimWorld, _stats?: RunStats): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale

  const hash = hashFor(world)
  hash.clear()
  for (const eid of targets(world)) {
    hash.insert(eid, Position.x[eid]!, Position.y[eid]!)
  }

  // Sert à la passe de libération ci-dessous, qui doit couvrir toute façon de
  // sortir du tourbillon (zone expirée, ennemi repoussé), pas seulement le
  // cas où la zone est toujours là.
  const capturedThisFrame = new Set<number>()

  for (const hid of hazards(world)) {
    const kind = Hazard.kind[hid]!
    const growth = Hazard.growthRate[hid]!
    if (growth > 0) {
      Hazard.radius[hid] = Math.min(Hazard.maxRadius[hid]!, Hazard.radius[hid]! + growth * dt)
    }

    const hx = Position.x[hid]!
    const hy = Position.y[hid]!
    const hr = Hazard.radius[hid]!

    // Marge dérivée de MAX_ENEMY_RADIUS, jamais en dur : sinon un ennemi plus
    // large ajouté plus tard sortirait de la fenêtre de recherche.
    for (const eid of hash.query(hx, hy, hr + MAX_ENEMY_RADIUS, scratch)) {
      const r = hr + Collider.radius[eid]!
      const dx = Position.x[eid]! - hx
      const dy = Position.y[eid]! - hy
      const distSq = dx * dx + dy * dy

      if (distSq > r * r) {
        continue
      }

      if (LETHAL.has(kind)) {
        addComponent(world, Doomed, eid)
      } else if (kind === HAZARD_BLOTTER) {
        // Un Éclat en télégraphe/charge ne doit jamais être dévié (spec
        // §3.6). Un membre de formation est laissé intact : formationSystem
        // réécrit sa vélocité de toute façon.
        const dashing = hasComponent(world, Dasher, eid) && Dasher.state[eid] !== 0
        const inFormation = hasComponent(world, Formation, eid)
        if (dashing || inFormation) {
          continue
        }

        // Le noyau tue avant que le tourbillon ne pilote quoi que ce soit :
        // `Doomed`, appliqué par deathSystem en fin de pas, émet `enemyKilled` comme toute autre mort.
        if (distSq <= POWERUP_BASE.blotter.coreRadius * POWERUP_BASE.blotter.coreRadius) {
          addComponent(world, Doomed, eid)
          continue
        }

        capturedThisFrame.add(eid)
        if (!hasComponent(world, Vortexed, eid)) {
          addComponent(world, Vortexed, eid)
          removeComponent(world, Homing, eid)
        }

        // Trou noir : la zone gouverne seule la vélocité (radiale + tangentielle),
        // pas une impulsion ajoutée à la poursuite (sinon noyée dans le
        // plafond de homingSystem). Les deux taux sont proportionnels à la
        // distance au centre : la vitesse angulaire reste constante (rotation
        // visible propre), la radiale décroît d'autant en convergeant.
        const dist = Math.sqrt(distSq) || 1
        const intensity =
          (Attractor.strength[hid] ?? POWERUP_BASE.blotter.strength) / POWERUP_BASE.blotter.strength
        const inwardSpeed = dist * POWERUP_BASE.blotter.vortexInwardRate * intensity
        const tangentSpeed = dist * POWERUP_BASE.blotter.vortexAngularRate * intensity
        const ux = dx / dist
        const uy = dy / dist
        Velocity.x[eid] = -ux * inwardSpeed - uy * tangentSpeed
        Velocity.y[eid] = -uy * inwardSpeed + ux * tangentSpeed
      }
    }
  }

  // Libère tout ennemi plus dans le rayon d'aucun Buvard cette image. La
  // poursuite reprend avec le délai de visée propre à son type, pas un
  // délai remis à zéro par erreur (même piège que shardSystem).
  for (const eid of vortexed(world)) {
    if (capturedThisFrame.has(eid)) {
      continue
    }
    removeComponent(world, Vortexed, eid)
    const dashing = hasComponent(world, Dasher, eid) && Dasher.state[eid] !== 0
    if (!dashing) {
      const type = ENEMY_TYPE_BY_ID[Enemy.type[eid] ?? 0] ?? 'point'
      addComponent(world, Homing, eid)
      Homing.delayMs[eid] = ENEMIES[type].homingDelayMs
    }
  }

  return world
}
