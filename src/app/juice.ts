import { type Camera, shakeForFelt } from '@/render/camera'
import type { Flash } from '@/render/fx/flash'
import type { FrostStars } from '@/render/fx/frost-star'
import type { Shockwaves } from '@/render/fx/shockwave'
import { INK } from '@/render/ink'
import type { Particles } from '@/render/particles'
import { Facing, Position } from '@/sim/components'
import type { PowerUpKind } from '@/sim/data/powerups'
import { POWERUP_BASE, POWERUP_BY_ID } from '@/sim/data/powerups'
import { COMBO_MAX_MULTIPLIER, comboMultiplier } from '@/sim/systems/score'
import type { SimWorld } from '@/sim/world'

export const HITSTOP_MS = 60
// Durée de l'état `dying` : voir `DEATH_SEQUENCE_MS` (render/fx/death-sequence.ts).
/**
 * Cadence minimale entre deux hitstops, mesurée depuis le déclenchement du
 * précédent : sans ce plancher, tuer une foule gelée en marchant dedans
 * relance les 60 ms pleines à chaque kill, gelant la simulation en continu.
 * Un kill isolé n'est jamais affecté.
 */
export const HITSTOP_CADENCE_MS = 200

/** Seuil à partir duquel un kill déclenche flash+anneau (spec §5.1) : en dessous, le joueur tue en continu et l'effet deviendrait du bruit. */
export const COMBO_FLASH_MIN_MULTIPLIER = 3
const KILL_PARTICLES_MIN = 10
const KILL_PARTICLES_MAX = 22
const KILL_CONE = Math.PI * 0.8
/** Ouverture de la gerbe d'un rebond de Bavure : large, mais jamais vers le mur. */
const SPLATTER_BOUNCE_SPREAD = Math.PI * 0.7

/**
 * Secousse d'un kill en pixels ressentis (`shakeForFelt`) : ~3,5 px à ×1, le
 * double à ×10. Le plafond borne les tueries de masse : l'effectif des
 * formations n'ayant plus de plafond (data/difficulty.ts), une Bombe au cœur
 * d'une arène dense peut rapporter un `kills` arbitrairement grand en un seul
 * pas — c'est ce plafond, et lui seul, qui empêche la secousse de suivre.
 */
const KILL_SHAKE_FELT_BASE = 2
const KILL_SHAKE_FELT_PER_KILL = 1.5
const KILL_SHAKE_FELT_CAP = 12

/** Position du combo sur 0 → 1 : le seul chiffre qui module tous les effets de kill. */
export function comboIntensity(multiplier: number): number {
  return Math.min(1, Math.max(0, (multiplier - 1) / (COMBO_MAX_MULTIPLIER - 1)))
}

/**
 * Position au-dessus du seuil de flash (0 à ×3, 1 à ×10) : `comboIntensity`
 * vaut trop peu à ×3 (0,22) pour piloter le flash sans le rendre quasi
 * invisible au seuil — d'où cette rampe dédiée.
 */
export function flashGate(multiplier: number): number {
  const span = COMBO_MAX_MULTIPLIER - COMBO_FLASH_MIN_MULTIPLIER
  return Math.min(1, Math.max(0, (multiplier - COMBO_FLASH_MIN_MULTIPLIER) / span))
}

/** Direction joueur → point d'impact, normalisée ; `{0, 0}` si le joueur n'existe pas (mort, entre deux runs) — l'appelant retombe alors sur une émission en cercle complet. */
function killDirection(world: SimWorld, x: number, y: number): { x: number; y: number } {
  const p = world.playerEid
  if (p < 0) {
    return { x: 0, y: 0 }
  }
  const px = Position.x[p]
  const py = Position.y[p]
  if (px === undefined || py === undefined) {
    return { x: 0, y: 0 }
  }
  const dx = x - px
  const dy = y - py
  const length = Math.hypot(dx, dy)
  return length === 0 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length }
}

/**
 * Orientation du joueur lue depuis `Facing` (même composant que le rendu de
 * la plume) plutôt qu'un champ ajouté à `SimEvent`. `null` si le joueur
 * n'existe pas (mort, entre deux runs).
 */
function playerFacing(world: SimWorld): number | null {
  const p = world.playerEid
  if (p < 0) {
    return null
  }
  const angle = Facing.angle[p]
  return angle === undefined ? null : angle
}

/**
 * Chaque power-up (sauf la Ronce) se distingue sur un axe structurel —
 * direction, rythme, comportement des éclats — pas seulement la couleur :
 * daltonisme, vignette de danger et grain suffiraient sinon à les confondre
 * (spec §4). `angle` vient de `Facing` ; la Ruée, la Volée et la Bavure s'en
 * servent, les autres l'ignorent.
 */
function powerupSignature(
  kind: PowerUpKind,
  x: number,
  y: number,
  angle: number | null,
  /** Portée publiée par l'événement ; `null` pour les genres qui n'en ont pas. */
  radius: number | null,
  fx: {
    camera: Camera
    particles: Particles
    flash: Flash
    shockwaves: Shockwaves
    frostStars: FrostStars
  },
): void {
  switch (kind) {
    case 'blast':
      // Deux temps : la seule à frapper deux fois, donc la plus violente.
      fx.flash.flash(INK.blast, 0.12)
      fx.shockwaves.emit(x, y, { color: INK.blast, radius: 92, durationMs: 300, thickness: 4 })
      fx.shockwaves.emit(x, y, {
        color: INK.blast,
        radius: 132,
        fromRadius: 10,
        durationMs: 560,
        thickness: 2,
        delayMs: 90,
      })
      fx.particles.emitBurst(x, y, {
        color: INK.blast,
        count: 22,
        speed: 280,
        streak: true,
      })
      break

    case 'freeze':
      // Une étoile plantée d'un coup, et des éclats qui prennent en glace en
      // plein vol. L'onde à aiguilles est partie : c'était un cercle hérissé,
      // et un cercle qui s'étend raconte une zone que le Gel ne pose plus.
      fx.flash.flash(INK.frost, 0.05)
      if (radius !== null) {
        // Jamais de repli sur une constante : la simulation publie toujours la
        // portée du Gel, et une étoile absente serait une panne visible plutôt
        // qu'une étoile de la mauvaise taille, silencieusement fausse.
        fx.frostStars.emit(x, y, { color: INK.frost, radius })
      }
      fx.particles.emitBurst(x, y, {
        color: INK.frost,
        count: 18,
        speed: 215,
        streak: true,
        stallAfterMs: 300,
      })
      break

    case 'blotter':
      // Le seul qui va vers l'intérieur : on comprend qu'il attire avant
      // qu'un ennemi ait bougé.
      fx.flash.flash(INK.paper, 0.03)
      fx.shockwaves.emit(x, y, {
        color: INK.paper,
        radius: 14,
        fromRadius: 100,
        durationMs: 620,
        thickness: 2.4,
      })
      fx.particles.emitBurst(x, y, {
        color: INK.paper,
        count: 26,
        speed: 150,
        spawnRadius: 108,
        converge: true,
        streak: true,
      })
      break

    case 'dash': {
      // Aucun anneau : un anneau dit « ça part de partout », or la ruée part
      // quelque part. La giclée se fait à l'opposé de la direction.
      fx.flash.flash(INK.paper, 0.045)
      const dir = angle ?? 0
      fx.particles.emitBurst(x, y, {
        color: INK.paper,
        count: 16,
        dir: dir + Math.PI,
        spread: 0.9,
        speed: 290,
        streak: true,
      })
      break
    }

    case 'volley': {
      // Aucun anneau, comme la Ruée mais pour une raison plus stricte encore :
      // rien n'explose au lancement. Les explosions de la Volée naissent plus
      // tard, à l'impact, et ce sont de vraies zones mortelles (seeker.ts). Un
      // anneau ici annoncerait une mort qui n'a pas lieu à cet endroit.
      fx.flash.flash(INK.paper, 0.04)
      const dir = angle ?? 0
      // Une giclée par plume, en éventail : la multiplicité est ce qui
      // distingue la Volée de la Ruée, qui part dans une seule direction.
      //
      // L'éventail reprend celui de `launchVolley`, pas les caps réels des
      // plumes. `powerupUsed` ne les porte pas, et les relire sur `world` (que
      // cette fonction ne reçoit pas, contrairement à `applyJuice`) obligerait
      // à faire remonter une requête bitECS jusqu'ici pour une giclée de
      // 90 ms. Choix de simplicité assumé : au départ les plumes sont encore
      // groupées, l'éventail et les vrais caps se lisent pareil.
      const jets = POWERUP_BASE.volley.count
      const spread = Math.PI / 3
      for (let i = 0; i < jets; i++) {
        fx.particles.emitBurst(x, y, {
          color: INK.paper,
          count: 7,
          // `jets > 1` et non `jets === 1` : `POWERUP_BASE` est `as const`, une
          // égalité sur un littéral serait rejetée comme comparaison impossible.
          dir: dir + (jets > 1 ? spread * (i / (jets - 1) - 0.5) : 0),
          spread: 0.3,
          speed: 320,
          streak: true,
        })
      }
      break
    }

    case 'splatter': {
      // Aucun anneau, pour la raison de la Ruée et de la Volée poussée d'un
      // cran : un anneau dit « ça part de partout », or la Bavure part
      // quelque part — et surtout elle EMPORTE sa létalité avec elle. Un
      // anneau marquerait comme dangereux un pourtour que la goutte a déjà
      // quitté, alors même que la goutte, elle, tue pour de bon (hazards.ts).
      fx.flash.flash(INK.paper, 0.05)
      const dir = angle ?? 0
      // Un jet unique et serré, vers l'avant : l'inversion exacte de la Ruée,
      // dont la giclée part à l'opposé du regard parce que le joueur s'y jette
      // lui-même. Ici rien ne part sous les pieds, c'est la goutte qu'on
      // lance — et une seule, contre l'éventail de la Volée.
      fx.particles.emitBurst(x, y, {
        color: INK.paper,
        count: 14,
        dir,
        spread: 0.35,
        speed: 330,
        streak: true,
      })
      // Puis l'encre qui bave sur place : quelques grosses gouttes lentes, non
      // étirées, tout autour, qui s'immobilisent et sèchent au point de lancer
      // (`stallAfterMs`). C'est le seul power-up dont l'effet continue de
      // travailler pendant qu'on esquive ailleurs ; son départ doit laisser
      // une trace, pas seulement une giclée qui file.
      fx.particles.emitBurst(x, y, {
        color: INK.paper,
        count: 8,
        speed: 90,
        sizeScale: 1.4,
        stallAfterMs: 120,
      })
      break
    }

    case 'halo':
      // Une protection ne devrait pas exploser ; l'anneau s'installe dans
      // `render/views/player.ts`, ici juste un accusé de réception.
      fx.flash.flash(INK.paper, 0.022)
      break

    case 'bramble':
      // Pas de signature propre : reprend volontairement le souffle générique
      // qu'avaient les power-ups avant leurs signatures dédiées.
      fx.camera.shake(shakeForFelt(6))
      fx.particles.emitBurst(x, y, { color: INK.blast, count: 12 })
      fx.flash.flash(INK.blast, 0.06)
      fx.shockwaves.emit(x, y, { color: INK.blast, radius: 160 })
      break

    default: {
      // Sans ce contrôle exhaustif, un power-up de plus compilerait en silence
      // et son déclenchement resterait muet.
      const exhaustif: never = kind
      void exhaustif
      break
    }
  }
}

export interface JuiceState {
  hitstopRemaining: number
  /** Temps restant avant qu'un nouveau hitstop soit à nouveau autorisé à se déclencher. */
  hitstopCooldownRemaining: number
}

export function createJuiceState(): JuiceState {
  return { hitstopRemaining: 0, hitstopCooldownRemaining: 0 }
}

/**
 * Sans cet appel entre deux runs, un hitstop encore armé au moment de la mort
 * gèlerait les premiers pas de la run suivante (l'objet d'état est créé une
 * seule fois pour toute la session).
 */
export function resetJuiceState(state: JuiceState): void {
  state.hitstopRemaining = 0
  state.hitstopCooldownRemaining = 0
}

/**
 * Traduit les événements d'un pas en effets ressentis ; n'écrit jamais dans
 * `world`, seulement dans l'état local `state`. `fx.motionEnabled` ne coupe
 * que la secousse et les particules (ce qui déplace l'image) — jamais le
 * hitstop, qui est un gel, pas un effet vestibulaire. `world.combo` est déjà
 * à jour ici : `scoreSystem` s'exécute avant `applyJuice` dans `stepWorld`.
 */
export function applyJuice(
  world: SimWorld,
  state: JuiceState,
  fx: {
    camera: Camera
    particles: Particles
    flash: Flash
    shockwaves: Shockwaves
    frostStars: FrostStars
    /** Tremblement du HUD, `strength` dans [0, 1]. */
    punch(strength: number): void
    motionEnabled: boolean
  },
): void {
  let kills = 0
  let killDirX = 0
  let killDirY = 0
  const multiplier = comboMultiplier(world.combo)
  const intensity = comboIntensity(multiplier)

  for (const event of world.events) {
    switch (event.type) {
      case 'enemyKilled': {
        kills++
        if (fx.motionEnabled) {
          const dir = killDirection(world, event.x, event.y)
          const directed = dir.x !== 0 || dir.y !== 0
          killDirX += dir.x
          killDirY += dir.y
          fx.particles.emitBurst(event.x, event.y, {
            color: INK.danger,
            count: Math.round(
              KILL_PARTICLES_MIN + (KILL_PARTICLES_MAX - KILL_PARTICLES_MIN) * intensity,
            ),
            dir: directed ? Math.atan2(dir.y, dir.x) : 0,
            spread: directed ? KILL_CONE : Math.PI * 2,
            speed: 130 + 90 * intensity,
            sizeScale: 1 + 0.5 * intensity,
            streak: true,
          })
          if (multiplier >= COMBO_FLASH_MIN_MULTIPLIER) {
            // Flash sur flashGate (visible dès ×3) ; l'anneau reste sur intensity, déjà lisible au seuil.
            fx.flash.flash(INK.paper, 0.025 + 0.035 * flashGate(multiplier))
            fx.shockwaves.emit(event.x, event.y, {
              color: INK.danger,
              radius: 70 + 60 * intensity,
            })
          }
        }
        break
      }
      case 'powerupUsed': {
        if (fx.motionEnabled) {
          const kind = POWERUP_BY_ID[event.kind]
          if (kind) {
            powerupSignature(kind, event.x, event.y, playerFacing(world), event.radius, fx)
          }
        }
        break
      }
      case 'splatterBounced':
        if (fx.motionEnabled) {
          // Une gerbe courte projetée vers l'intérieur, qui s'immobilise vite
          // et sèche sur place : c'est l'encre qui gicle au choc, pas une
          // explosion. Aucun anneau, aucun flash — le mur ne détone pas, et
          // surtout rien ici ne doit se lire comme une zone mortelle : seule
          // la goutte tue.
          fx.particles.emitBurst(event.x, event.y, {
            color: INK.paper,
            count: 6,
            dir: Math.atan2(event.ny, event.nx),
            spread: SPLATTER_BOUNCE_SPREAD,
            speed: 70,
            sizeScale: 1.2,
            stallAfterMs: 110,
          })
        }
        break
      case 'haloBroken':
        if (fx.motionEnabled) {
          fx.camera.shake(shakeForFelt(14))
          fx.particles.emitBurst(event.x, event.y, { color: INK.paper, count: 24 })
          fx.flash.flash(INK.paper, 0.12)
          fx.shockwaves.emit(event.x, event.y, { color: INK.paper, radius: 200, thickness: 5 })
        }
        break
      case 'playerDied':
        if (fx.motionEnabled) {
          fx.camera.shake(shakeForFelt(24))
          fx.particles.emitBurst(event.x, event.y, { color: INK.paper, count: 40 })
          fx.flash.flash(INK.paper, 0.22, 260)
          fx.shockwaves.emit(event.x, event.y, {
            color: INK.paper,
            radius: 320,
            durationMs: 500,
            thickness: 6,
          })
        }
        break
      default:
        break
    }
  }

  if (kills > 0) {
    // Hors de `motionEnabled` (le hitstop n'est pas vestibulaire). Le plancher
    // de cadence (`HITSTOP_CADENCE_MS`) ne s'applique qu'au déclenchement,
    // jamais à un kill isolé.
    if (state.hitstopCooldownRemaining <= 0) {
      state.hitstopRemaining = HITSTOP_MS
      state.hitstopCooldownRemaining = HITSTOP_CADENCE_MS
    }
    if (fx.motionEnabled) {
      const felt =
        Math.min(KILL_SHAKE_FELT_CAP, KILL_SHAKE_FELT_BASE + kills * KILL_SHAKE_FELT_PER_KILL) *
        (1 + intensity)
      // Moyenne des directions, pas leur somme : une foule qui encercle le
      // joueur s'annule (secousse sans poussée) ; seul un amas latéral pousse l'image (voir `kickFor`).
      fx.camera.shake(shakeForFelt(felt), killDirX / kills, killDirY / kills)
      fx.punch(0.4 + 0.6 * intensity)
    }
  }
}

/** Facteur de temps à appliquer à la simulation pour ce pas. */
export function timeScaleFor(state: JuiceState, dtMs: number): number {
  // Décompte indépendant de l'état du hitstop : mesuré en temps réel, sinon il
  // ne s'écoulerait jamais tant qu'un hitstop est actif.
  if (state.hitstopCooldownRemaining > 0) {
    state.hitstopCooldownRemaining -= dtMs
  }
  if (state.hitstopRemaining > 0) {
    state.hitstopRemaining -= dtMs
    return 0
  }
  return 1
}
