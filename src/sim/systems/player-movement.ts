import { addComponent, defineQuery, hasComponent, removeComponent } from 'bitecs'

import {
  Collider,
  Dashing,
  Facing,
  Invulnerable,
  Movement,
  Player,
  Position,
  Velocity,
} from '../components'
import { FIXED_DT, type SimWorld } from '../world'

const players = defineQuery([Player, Velocity, Movement, Facing])

// En dessous de ce seuil, `atan2` donnerait un angle arbitraire (vitesse
// quasi nulle) : on garde le dernier cap connu plutôt que de recalculer.
const FACING_MIN_SPEED = 1

/** Grâce accordée à l'atterrissage d'une ruée (spec §4.1). */
const DASH_LANDING_GRACE_MS = 200

/**
 * La ruée ne progresse plus : chacune de ses composantes de vitesse est soit
 * nulle, soit dirigée dans un mur déjà touché. Sans cette coupure, le clamp
 * d'`integrationSystem` arrête la position sans arrêter la ruée : le joueur
 * reste garé contre le mur, invulnérable et tuant dans son rayon, pour tout
 * le reste de sa durée.
 *
 * « Toutes les composantes bloquées », pas « un mur touché » : une ruée
 * diagonale qui rase le sol avance encore et ne doit pas être coupée.
 */
function dashFullyBlocked(world: SimWorld, eid: number): boolean {
  const r = Collider.radius[eid]!
  const x = Position.x[eid]!
  const y = Position.y[eid]!
  const vx = Dashing.vx[eid]!
  const vy = Dashing.vy[eid]!

  // Une ruée sans vélocité n'est pas « bloquée par un mur », elle n'avance
  // simplement pas : répondre `true` ici serait un faux diagnostic.
  if (vx === 0 && vy === 0) {
    return false
  }

  const blockedX = vx === 0 || (vx < 0 && x <= r) || (vx > 0 && x >= world.arena.width - r)
  const blockedY = vy === 0 || (vy < 0 && y <= r) || (vy > 0 && y >= world.arena.height - r)
  return blockedX && blockedY
}

export function playerMovementSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale

  for (const eid of players(world)) {
    // La ruée écrase le contrôle : trajectoire figée, invulnérable (spec §3.4).
    // Minuteur décrémenté avant d'appliquer la vitesse : sur l'image
    // terminale, le composant est retiré avant de retomber sur le mouvement
    // normal, sans image fantôme à pleine vitesse de ruée sans protection.
    if (hasComponent(world, Dashing, eid)) {
      const remaining = Dashing.remaining[eid]! - FIXED_DT * world.timeScale
      // Un seul chemin de sortie (expiration ou mur) : c'est lui qui accorde
      // la grâce ci-dessous.
      if (remaining <= 0 || dashFullyBlocked(world, eid)) {
        removeComponent(world, Dashing, eid)
        // Grâce d'atterrissage : la Plume s'active en situation d'encerclement,
        // s'arrêter en pleine foule y tuerait sans elle.
        // Toujours `Math.max`, jamais une écriture sèche : `Invulnerable` est
        // aussi posé par waves.ts (grâce de début de vague, 500 ms) et
        // collision.ts (rupture du Halo, 1000 ms) — écraser sans condition
        // remplacerait une protection plus longue par ces 200 ms.
        const grace = hasComponent(world, Invulnerable, eid)
          ? Math.max(Invulnerable.remaining[eid]!, DASH_LANDING_GRACE_MS)
          : DASH_LANDING_GRACE_MS
        addComponent(world, Invulnerable, eid)
        Invulnerable.remaining[eid] = grace
      } else {
        Dashing.remaining[eid] = remaining
        Velocity.x[eid] = Dashing.vx[eid]!
        Velocity.y[eid] = Dashing.vy[eid]!
        continue
      }
    }

    const maxSpeed = Movement.maxSpeed[eid]!
    let ix = world.input.moveX
    let iy = world.input.moveY

    // Normaliser la diagonale, sinon on va √2 fois plus vite en biais.
    const inputLen = Math.hypot(ix, iy)
    if (inputLen > 1) {
      ix /= inputLen
      iy /= inputLen
    }

    let vx = Velocity.x[eid]!
    let vy = Velocity.y[eid]!

    if (inputLen > 0.001) {
      vx += ix * Movement.accel[eid]! * dt
      vy += iy * Movement.accel[eid]! * dt
    } else {
      const speed = Math.hypot(vx, vy)
      if (speed > 0) {
        const drop = Math.min(speed, Movement.friction[eid]! * dt)
        vx -= (vx / speed) * drop
        vy -= (vy / speed) * drop
      }
    }

    const speed = Math.hypot(vx, vy)
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed
      vy = (vy / speed) * maxSpeed
    }

    Velocity.x[eid] = vx
    Velocity.y[eid] = vy

    // Le cap suit la vélocité, pas l'entrée : l'entrée clavier n'a que huit
    // directions, en lire l'angle ferait tourner le curseur par à-coups de 45°.
    const finalSpeed = Math.min(speed, maxSpeed)
    if (finalSpeed > FACING_MIN_SPEED) {
      Facing.angle[eid] = Math.atan2(vy, vx)
    }
  }

  return world
}
