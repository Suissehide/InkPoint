import { addComponent, addEntity, defineQuery } from 'bitecs'

import { Facing, Hazard, Lifetime, Position, PrevPosition, Ricochet } from '../components'
import { HAZARD_SPLATTER, POWERUP_BASE } from '../data/powerups'
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
