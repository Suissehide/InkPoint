import { addComponent, defineQuery, hasComponent, removeComponent } from 'bitecs'

import { Dashing, Facing, Invulnerable, Movement, Player, Velocity } from '../components'
import { FIXED_DT, type SimWorld } from '../world'

const players = defineQuery([Player, Velocity, Movement, Facing])

// En dessous de ce seuil, la vitesse est trop faible (ou nulle) pour donner un
// cap fiable : `atan2(0, 0)` (ou un signe de zéro qui varie d'une image à
// l'autre) donnerait un angle arbitraire, faisant tourner ou sauter le curseur
// à chaque arrêt. On garde alors le dernier cap connu plutôt que de recalculer.
const FACING_MIN_SPEED = 1

/** Grâce accordée à l'atterrissage d'une ruée (spec §4.1). */
const DASH_LANDING_GRACE_MS = 200

export function playerMovementSystem(world: SimWorld): SimWorld {
  const dt = (FIXED_DT / 1000) * world.timeScale

  for (const eid of players(world)) {
    // La ruée écrase le contrôle : trajectoire figée, invulnérable (spec §3.4).
    // Le minuteur est décrémenté avant d'appliquer la vitesse : sur l'image
    // terminale, le composant est retiré et le joueur retombe proprement sur
    // le mouvement normal, plutôt que de subir une image fantôme à pleine
    // vitesse de ruée sans plus aucune des protections qui vont avec.
    if (hasComponent(world, Dashing, eid)) {
      const remaining = Dashing.remaining[eid]! - FIXED_DT * world.timeScale
      if (remaining <= 0) {
        removeComponent(world, Dashing, eid)
        // Grâce d'atterrissage : la Plume s'active quand on est encerclé, et
        // s'arrêter en pleine foule tuait dans la situation même où on
        // l'utilise. `collisionSystem` décrémente `Invulnerable` plus tard dans
        // le même pas, donc la grâce vaut en pratique une image de moins — c'est
        // sans conséquence à cette durée, et l'aligner coûterait un cas
        // particulier dans les deux systèmes.
        //
        // Le maximum, jamais une écriture sèche : deux autres systèmes posent
        // ce même champ (waves.ts, 500 ms au début d'une vague ; collision.ts,
        // 1000 ms à la rupture du Halo, donc précisément quand on est
        // encerclé). Écraser inconditionnellement remplaçait une protection
        // plus longue par 200 ms et relâchait le joueur en pleine foule — le
        // défaut même que cette grâce existe pour éviter, par une autre porte.
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
    // directions possibles, donc en lire l'angle fait tourner le curseur par
    // à-coups de 45°. La vélocité, elle, tourne en continu sous l'effet de
    // l'accélération/friction — le cap devient un balayage entre les huit
    // directions au repos plutôt qu'un saut instantané entre elles.
    const finalSpeed = Math.min(speed, maxSpeed)
    if (finalSpeed > FACING_MIN_SPEED) {
      Facing.angle[eid] = Math.atan2(vy, vx)
    }
  }

  return world
}
