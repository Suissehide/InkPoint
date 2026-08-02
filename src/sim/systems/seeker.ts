import { addComponent, addEntity, defineQuery, entityExists, hasComponent, Not } from 'bitecs'

import {
  Collider,
  Doomed,
  Enemy,
  Facing,
  Hazard,
  Lifetime,
  Materializing,
  Position,
  PrevPosition,
  Seeker,
} from '../components'
import { HAZARD_BLAST, HAZARD_QUILL, POWERUP_BASE } from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * La Volée de plumes.
 *
 * Les plumes ne portent **pas** de `Collider` : `integrationSystem` interroge
 * `[Position, PrevPosition, Velocity, Collider, …]` et *bloque aux murs* ce
 * qu'il déplace. En rester dehors leur laisse gouverner leur propre
 * déplacement, exactement comme `brambleSystem` le fait pour ses épines, sans
 * introduire d'exception dans un système que tout le reste traverse.
 *
 * Elles ne sont pas non plus dans `LETHAL` (voir `hazards.ts`) : une plume ne
 * tue pas au passage, elle pose une explosion à l'impact et disparaît. C'est
 * cette explosion qui tue, donc ce que le joueur voit est exactement ce qui
 * tue (spec §3.1).
 */

const quills = defineQuery([Seeker, Hazard, Position, PrevPosition, Facing])
const preys = defineQuery([Enemy, Position, Collider, Not(Materializing), Not(Doomed)])

/** « Aucune cible ». Voir le commentaire de `Seeker` : 0 est une entité valide. */
const NO_TARGET = -1

function isPrey(world: SimWorld, eid: number): boolean {
  return (
    eid >= 0 &&
    entityExists(world, eid) &&
    hasComponent(world, Enemy, eid) &&
    !hasComponent(world, Materializing, eid) &&
    !hasComponent(world, Doomed, eid)
  )
}

/**
 * Les proies vivantes triées de la plus proche à la plus lointaine de (x, y).
 *
 * `sort` est stable et l'ordre d'itération d'une requête bitECS est
 * déterministe : deux mondes identiques rendent la même liste, ex æquo
 * compris. Rien ici ne consomme `world.rng`.
 */
function preysByDistance(world: SimWorld, x: number, y: number): number[] {
  const distSq = (eid: number): number => {
    const dx = Position.x[eid]! - x
    const dy = Position.y[eid]! - y
    return dx * dx + dy * dy
  }
  return [...preys(world)].sort((a, b) => distSq(a) - distSq(b))
}

/**
 * La proie la plus proche de (x, y), ou `NO_TARGET` s'il n'y en a aucune.
 *
 * `exclude` écarte une entité précise : au point de relance, l'ennemi qui
 * vient d'être touché est encore dans `preys` (`seekerSystem` ne pose
 * `Doomed` sur lui qu'après, voir plus bas) et serait sinon systématiquement
 * le plus proche, à distance nulle.
 */
function nearestPrey(world: SimWorld, x: number, y: number, exclude = NO_TARGET): number {
  return preysByDistance(world, x, y).find((eid) => eid !== exclude) ?? NO_TARGET
}

function spawnQuill(
  world: SimWorld,
  x: number,
  y: number,
  angle: number,
  target: number,
  relaunches: number,
): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, PrevPosition, eid)
  addComponent(world, Facing, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  addComponent(world, Seeker, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  PrevPosition.x[eid] = x
  PrevPosition.y[eid] = y
  Facing.angle[eid] = angle
  Hazard.kind[eid] = HAZARD_QUILL
  Hazard.radius[eid] = POWERUP_BASE.volley.quillRadius
  Hazard.maxRadius[eid] = POWERUP_BASE.volley.quillRadius
  // Zéro, pas le taux de virage : `hazardSystem` lit `growthRate` sur toute
  // entité `Hazard` et fait grossir le rayon dès qu'il est positif.
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = POWERUP_BASE.volley.lifeMs
  Seeker.target[eid] = target
  Seeker.speed[eid] = POWERUP_BASE.volley.speed
  Seeker.turnRate[eid] = POWERUP_BASE.volley.turnRate
  Seeker.relaunches[eid] = relaunches
  return eid
}

/**
 * L'explosion d'impact : une Bombe en réduction, mêmes réglages de lecture.
 *
 * Réutiliser `HAZARD_BLAST` fait délibérément hériter la Volée de
 * « Rémanence » (`spawnAfterburn`, `lifetime.ts`) : chaque impact de plume
 * laisse sa braise, jusqu'à une par relance de « Plumes gigognes ». En
 * revanche elle n'hérite PAS de « Large explosion » ni « Combustion lente »
 * (`blast-radius`, `blast-linger`) : ces deux cartes lisent `stats.blastRadius`
 * / `stats.blastLingerMs`, alors qu'ici les réglages viennent de
 * `POWERUP_BASE.volley`, pas de `stats`.
 */
function spawnQuillBlast(world: SimWorld, x: number, y: number): void {
  const { blastRadius, blastGrowth, blastLingerMs } = POWERUP_BASE.volley
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = HAZARD_BLAST
  Hazard.radius[eid] = 6
  Hazard.maxRadius[eid] = blastRadius
  Hazard.growthRate[eid] = blastGrowth
  Lifetime.remaining[eid] = (blastRadius / blastGrowth) * 1000 + blastLingerMs
}

/**
 * Lance une volée depuis (x, y).
 *
 * Trois cas, tranchés ici plutôt que laissés au hasard de l'implémentation :
 * — assez d'ennemis : une cible distincte par plume, les plus proches d'abord ;
 * — moins d'ennemis que de plumes : le surplus reprend le plus proche. Deux
 *   plumes sur une même cible valent mieux qu'une plume gâchée ;
 * — aucun ennemi : les plumes partent quand même, en éventail devant le
 *   joueur, et réacquerront une cible dès qu'un ennemi se matérialisera.
 */
export function launchVolley(world: SimWorld, stats: RunStats, x: number, y: number): void {
  const count = Math.max(1, Math.floor(stats.volleyCount))
  const relaunches = stats.rules.has('nestedQuills') ? 1 : 0
  const ranked = preysByDistance(world, x, y)
  // Éventail centré sur le regard du joueur, utilisé seulement faute de cible.
  const facing = world.playerEid >= 0 ? (Facing.angle[world.playerEid] ?? 0) : 0
  const spread = Math.PI / 3

  for (let i = 0; i < count; i++) {
    const target = ranked.length === 0 ? NO_TARGET : (ranked[i] ?? ranked[0]!)
    const angle =
      target === NO_TARGET
        ? facing + (count === 1 ? 0 : spread * (i / (count - 1) - 0.5))
        : Math.atan2(Position.y[target]! - y, Position.x[target]! - x)
    spawnQuill(world, x, y, angle, target, relaunches)
  }
}

export function seekerSystem(world: SimWorld): SimWorld {
  const dtMs = FIXED_DT * world.timeScale
  const dt = dtMs / 1000

  // Photographie fixe : bitECS rend le tableau interne, pas une copie, et une
  // relance (« Plumes gigognes ») y pousserait une plume traitée dans la même
  // passe selon l'ordre interne de la bibliothèque. Même piège que
  // `spawnAfterburn` dans `lifetime.ts`.
  for (const eid of [...quills(world)]) {
    // Sans PrevPosition à jour, le rendu ne peut pas interpoler ces zones
    // mobiles : elles avanceraient par saccades d'un pas de simulation.
    PrevPosition.x[eid] = Position.x[eid]!
    PrevPosition.y[eid] = Position.y[eid]!

    let target = Seeker.target[eid]!
    if (!isPrey(world, target)) {
      target = nearestPrey(world, Position.x[eid]!, Position.y[eid]!)
      Seeker.target[eid] = target
    }

    if (target !== NO_TARGET) {
      const desired = Math.atan2(
        Position.y[target]! - Position.y[eid]!,
        Position.x[target]! - Position.x[eid]!,
      )
      // Écart rabattu dans (-π, π] : sans ce repli, un écart de 350° ferait
      // virer la plume dans le mauvais sens sur presque un tour complet.
      const raw = desired - Facing.angle[eid]!
      const delta = Math.atan2(Math.sin(raw), Math.cos(raw))
      const maxTurn = Seeker.turnRate[eid]! * dtMs
      Facing.angle[eid] = Facing.angle[eid]! + Math.max(-maxTurn, Math.min(maxTurn, delta))
    }

    const angle = Facing.angle[eid]!
    const speed = Seeker.speed[eid]!
    const x = Position.x[eid]! + Math.cos(angle) * speed * dt
    const y = Position.y[eid]! + Math.sin(angle) * speed * dt
    Position.x[eid] = x
    Position.y[eid] = y

    // Sortie d'arène : la plume n'a pas de `Collider`, rien ne la bloque aux
    // murs. La laisser filer dessinerait une plume qui vole hors de la page
    // jusqu'à l'expiration de son sursis.
    if (x < 0 || y < 0 || x > world.arena.width || y > world.arena.height) {
      addComponent(world, Doomed, eid)
      continue
    }

    const hit = contactAt(world, x, y, Hazard.radius[eid]!)
    if (hit === NO_TARGET) {
      continue
    }

    // L'ennemi touché n'est pas marqué ici : c'est l'explosion qui tue, et
    // `hazardSystem` tourne juste après dans le pas (voir step.ts).
    spawnQuillBlast(world, x, y)
    addComponent(world, Doomed, eid)

    const left = Seeker.relaunches[eid]!
    if (left > 0) {
      const next = nearestPrey(world, x, y, hit)
      const angleOut =
        next === NO_TARGET ? angle : Math.atan2(Position.y[next]! - y, Position.x[next]! - x)
      spawnQuill(world, x, y, angleOut, next, left - 1)
    }
  }

  return world
}

/**
 * La première proie en contact avec un disque de rayon `r` centré en (x, y),
 * ou `NO_TARGET`. Teste toutes les proies, pas seulement la cible : une plume
 * qui frôle un autre ennemi en chemin doit exploser là, pas le traverser.
 */
function contactAt(world: SimWorld, x: number, y: number, r: number): number {
  for (const eid of preys(world)) {
    const reach = r + Collider.radius[eid]!
    const dx = Position.x[eid]! - x
    const dy = Position.y[eid]! - y
    if (dx * dx + dy * dy <= reach * reach) {
      return eid
    }
  }
  return NO_TARGET
}
