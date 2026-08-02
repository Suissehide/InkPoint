import { addComponent, addEntity, defineQuery } from 'bitecs'

import { Facing, Hazard, Lifetime, Position, PrevPosition, Ricochet } from '../components'
import { HAZARD_INK_TRAIL, HAZARD_SPLATTER, POWERUP_BASE } from '../data/powerups'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * La Bavure : une goutte d'encre qui rebondit sur les murs et tue au contact.
 *
 * Comme la plume (`seeker.ts`), elle ne porte **pas** de `Collider` :
 * `integrationSystem` bloquerait sinon la goutte contre le mur au lieu de la
 * laisser rebondir. En rester dehors lui laisse gouverner son déplacement,
 * sans introduire d'exception dans un système que tout le reste traverse.
 *
 * Elle est en revanche dans `LETHAL` (`hazards.ts`) : contrairement à la
 * plume, elle tue par elle-même, et le disque affiché est le disque qui tue.
 */

const drops = defineQuery([Ricochet, Hazard, Position, PrevPosition, Facing, Lifetime])

/**
 * Une tache de la trace peinte derrière la goutte. Même principe que le
 * sillage de la Ruée (`dashWakeSystem`) : une entité `Hazard` immobile, dans
 * `LETHAL`, dont le disque affiché est exactement le disque qui tue.
 *
 * Sa taille et son centre sont tirés au sort — c'est une coulure d'encre, pas
 * un chapelet de jetons calibrés. Le tirage a lieu **ici** et non au rendu,
 * pour la même raison que le reste du fichier : le rayon tiré est le rayon
 * mortel et le centre décalé est celui du disque qui tue. Une irrégularité qui
 * ne vivrait qu'à l'écran mentirait sur ce qui tue. Et passant par `world.rng`
 * plutôt que par `Math.random`, elle reste rejouable à graine égale.
 *
 * `ux, uy` est le cap unitaire de la goutte : le décalage lui est
 * perpendiculaire, seule forme qui ne peut pas ouvrir de trou dans le ruban
 * (voir `POWERUP_BASE.splatter.trailOffsetPx`).
 *
 * Pas de `PrevPosition` : la tache ne bouge pas, et `stage.ts` n'interpole que
 * ce qui en porte.
 */
function spawnInkTrail(world: SimWorld, x: number, y: number, ux: number, uy: number): number {
  const { trailRadius, trailRadiusJitter, trailOffsetPx } = POWERUP_BASE.splatter
  const radius = trailRadius * world.rng.range(1 - trailRadiusJitter, 1 + trailRadiusJitter)
  const offset = world.rng.range(-trailOffsetPx, trailOffsetPx)

  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  Position.x[eid] = x - uy * offset
  Position.y[eid] = y + ux * offset
  Hazard.kind[eid] = HAZARD_INK_TRAIL
  Hazard.radius[eid] = radius
  Hazard.maxRadius[eid] = radius
  // Zéro : `hazardSystem` fait grossir le rayon dès que `growthRate` est positif.
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = POWERUP_BASE.splatter.trailLifeMs
  return eid
}

function spawnDrop(
  world: SimWorld,
  x: number,
  y: number,
  angle: number,
  lifeMs: number,
  splitsLeft: number,
): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, PrevPosition, eid)
  addComponent(world, Facing, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)
  addComponent(world, Ricochet, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  PrevPosition.x[eid] = x
  PrevPosition.y[eid] = y
  Facing.angle[eid] = angle
  Hazard.kind[eid] = HAZARD_SPLATTER
  Hazard.radius[eid] = POWERUP_BASE.splatter.radius
  Hazard.maxRadius[eid] = POWERUP_BASE.splatter.radius
  // Zéro : `hazardSystem` fait grossir le rayon dès que `growthRate` est positif.
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = lifeMs
  Ricochet.splitsLeft[eid] = splitsLeft
  // Explicite et non laissé au défaut du tableau SoA : bitECS ne remet jamais
  // ses tableaux à zéro, une goutte reprenant un identifiant recyclé hériterait
  // sinon de l'accumulateur de la précédente et déposerait sa première trace à
  // contretemps.
  Ricochet.wakeAccMs[eid] = 0
  return eid
}

/**
 * Lance une goutte depuis (x, y), dans la direction du regard du joueur.
 * Comme la Ruée et non comme le Gel : c'est un geste orienté, pas une zone
 * posée sous les pieds.
 */
export function launchSplatter(world: SimWorld, stats: RunStats, x: number, y: number): void {
  const angle = world.playerEid >= 0 ? (Facing.angle[world.playerEid] ?? 0) : 0
  const splits = stats.rules.has('splitSplatter') ? 1 : 0
  spawnDrop(world, x, y, angle, stats.splatterLifeMs, splits)
}

export function ricochetSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale
  const dtMs = FIXED_DT * world.timeScale

  // Photographie fixe : bitECS rend le tableau interne, et un dédoublement y
  // pousserait une goutte traitée dans la même passe selon l'ordre interne de
  // la bibliothèque. Même piège que `spawnAfterburn` dans `lifetime.ts`.
  for (const eid of [...drops(world)]) {
    // Sans PrevPosition à jour, le rendu ne peut pas interpoler : la goutte
    // avancerait par saccades d'un pas de simulation.
    PrevPosition.x[eid] = Position.x[eid]!
    PrevPosition.y[eid] = Position.y[eid]!

    const angle = Facing.angle[eid]!
    let ux = Math.cos(angle)
    let uy = Math.sin(angle)
    const speed = POWERUP_BASE.splatter.speed
    let x = Position.x[eid]! + ux * speed * dt
    let y = Position.y[eid]! + uy * speed * dt

    const r = Hazard.radius[eid]!
    // Normale du mur heurté, dirigée vers l'intérieur de l'arène. Elle sert au
    // rendu (l'éclaboussure gicle vers l'intérieur, jamais dans le mur) ; dans
    // un coin les deux composantes sont non nulles et la diagonale est la
    // bonne direction.
    let nx = 0
    let ny = 0
    if (x < r) {
      x = r
      ux = -ux
      nx = 1
    } else if (x > world.arena.width - r) {
      x = world.arena.width - r
      ux = -ux
      nx = -1
    }
    if (y < r) {
      y = r
      uy = -uy
      ny = 1
    } else if (y > world.arena.height - r) {
      y = world.arena.height - r
      uy = -uy
      ny = -1
    }
    const bounced = nx !== 0 || ny !== 0

    Position.x[eid] = x
    Position.y[eid] = y

    // La trace est peinte APRÈS le déplacement, à la position d'arrivée : une
    // tache déposée avant laisserait un trou d'un pas entre la queue du ruban
    // et la goutte. Soustraction plutôt que remise à zéro, comme
    // `dashWakeSystem`, pour ne pas dériver quand un pas dépasse l'intervalle.
    // `ux, uy` est ici le cap SORTANT — déjà réfléchi si le pas a heurté un
    // mur, ce qui est le bon repère : la tache ouvre le ruban qui suit.
    Ricochet.wakeAccMs[eid] = Ricochet.wakeAccMs[eid]! + dtMs
    if (Ricochet.wakeAccMs[eid]! >= POWERUP_BASE.splatter.trailIntervalMs) {
      Ricochet.wakeAccMs[eid] = Ricochet.wakeAccMs[eid]! - POWERUP_BASE.splatter.trailIntervalMs
      spawnInkTrail(world, x, y, ux, uy)
    }

    if (bounced) {
      // Normalisée ici plutôt que côté rendu : la simulation est la seule à
      // savoir quels murs ont été heurtés, et un coin doit donner une
      // diagonale unitaire, pas un vecteur de norme √2.
      const norme = Math.hypot(nx, ny) || 1
      world.events.push({ type: 'splatterBounced', x, y, nx: nx / norme, ny: ny / norme })
    }

    if (!bounced) {
      continue
    }

    const reflected = Math.atan2(uy, ux)
    Facing.angle[eid] = reflected

    if (Ricochet.splitsLeft[eid]! <= 0) {
      continue
    }

    // Les deux gouttes s'écartent SYMÉTRIQUEMENT du cap réfléchi : garder la
    // mère sur son cap et ne dévier que la fille donnerait une paire dont une
    // seule branche a vraiment été dirigée, et le rebond se lirait comme un bug.
    const half = POWERUP_BASE.splatter.splitAngle / 2
    Ricochet.splitsLeft[eid] = 0
    Facing.angle[eid] = reflected - half
    spawnDrop(world, x, y, reflected + half, Lifetime.remaining[eid]!, 0)
  }

  return world
}
