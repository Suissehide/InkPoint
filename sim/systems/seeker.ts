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
 * Une proie au hasard, ou `NO_TARGET` s'il n'y en a aucune.
 *
 * **Au hasard et non la plus proche.** Viser le plus proche concentrait toute
 * la volée sur le paquet déjà collé au joueur — c'est-à-dire là où une Bombe
 * ou une Ronce fait déjà le travail — et rendait le tir prévisible. Un tirage
 * au sort disperse les plumes dans la vague et donne à la Volée son rôle
 * propre : atteindre ce que les zones ne couvrent pas.
 *
 * Le tirage passe par `world.rng`, le flux déterministe de la simulation :
 * c'est lui qui rend une run reproductible, donc le netcode possible. L'aléa
 * du navigateur est interdit ici, et `purity.test.ts` le vérifie.
 *
 * `exclude` écarte une entité précise : au point de relance, l'ennemi qui
 * vient d'être touché est encore dans `preys` (`seekerSystem` ne pose `Doomed`
 * sur lui qu'après, voir plus bas) et la relance repartirait vers un cadavre.
 */
function randomPrey(world: SimWorld, exclude = NO_TARGET): number {
  const pool = [...preys(world)].filter((eid) => eid !== exclude)
  // Le test de vacuité vient AVANT tout appel au tirage : une plume sans cible
  // possible ne doit pas consommer le flux à chaque pas, sinon deux runs
  // identiques divergeraient selon le nombre d'ennemis vivants.
  return pool.length === 0 ? NO_TARGET : world.rng.pick(pool)
}

/**
 * Les cibles d'une volée : `count` proies tirées au sort, **sans remise** tant
 * qu'il en reste. Deux plumes sur une même cible ne se justifient que faute de
 * mieux — quand il y a moins d'ennemis que de plumes, le surplus retire dans
 * l'ensemble complet plutôt que de se perdre.
 *
 * Tableau vide s'il n'y a aucun ennemi : l'appelant part alors en éventail.
 */
function drawTargets(world: SimWorld, count: number): number[] {
  const toutes = [...preys(world)]
  if (toutes.length === 0) {
    return []
  }
  const restantes = [...toutes]
  const cibles: number[] = []
  for (let i = 0; i < count; i++) {
    if (restantes.length === 0) {
      cibles.push(world.rng.pick(toutes))
      continue
    }
    const index = world.rng.int(restantes.length)
    cibles.push(restantes[index]!)
    restantes.splice(index, 1)
  }
  return cibles
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
 * Réutiliser `HAZARD_BLAST` n'a plus qu'une conséquence : elle n'hérite PAS de
 * « Large explosion » ni « Combustion lente » (`blast-radius`, `blast-linger`)
 * — ces deux cartes lisent `stats.blastRadius` / `stats.blastLingerMs`, alors
 * qu'ici les réglages viennent de `POWERUP_BASE.volley`, pas de `stats`.
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
 * — assez d'ennemis : une cible distincte par plume, **tirées au sort** ;
 * — moins d'ennemis que de plumes : le surplus retire dans l'ensemble complet.
 *   Deux plumes sur une même cible valent mieux qu'une plume gâchée ;
 * — aucun ennemi : les plumes partent quand même, en éventail devant le
 *   joueur, et réacquerront une cible dès qu'un ennemi se matérialisera.
 */
export function launchVolley(world: SimWorld, stats: RunStats, x: number, y: number): void {
  const count = Math.max(1, Math.floor(stats.volleyCount))
  const relaunches = stats.rules.has('nestedQuills') ? 1 : 0
  const cibles = drawTargets(world, count)
  // Éventail centré sur le regard du joueur, utilisé seulement faute de cible.
  const facing = world.playerEid >= 0 ? (Facing.angle[world.playerEid] ?? 0) : 0
  const spread = Math.PI / 3

  for (let i = 0; i < count; i++) {
    const target = cibles[i] ?? NO_TARGET
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
      target = randomPrey(world)
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
      const next = randomPrey(world, hit)
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
