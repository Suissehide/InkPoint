import { type Camera, shakeForFelt } from '@/render/camera'
import type { Flash } from '@/render/fx/flash'
import type { Shockwaves } from '@/render/fx/shockwave'
import { INK } from '@/render/ink'
import type { Particles } from '@/render/particles'
import { Position } from '@/sim/components'
import { comboMultiplier } from '@/sim/systems/score'
import type { SimWorld } from '@/sim/world'

export const HITSTOP_MS = 60
export const DEATH_SLOWMO_MS = 800
export const DEATH_SLOWMO_SCALE = 0.15
/**
 * Cadence minimale entre deux déclenchements de hitstop, mesurée depuis le
 * début du précédent (pas depuis sa fin). Une foule gelée tue à chaque pas où
 * le joueur la traverse : sans ce plancher, chaque kill de la chaîne relance
 * les 60 ms pleines de `HITSTOP_MS`, et vingt ennemis gelés produisent ~1,2 s
 * de gel quasi continu — mesuré par simulation directe (voir rapport de
 * tâche). Un seul kill isolé reste inchangé : le plancher ne fait que refuser
 * un *nouveau* déclenchement tant que le précédent est trop récent, jamais
 * raccourcir le premier.
 */
export const HITSTOP_CADENCE_MS = 200

/** Miroir de `COMBO_MAX_MULTIPLIER` (src/sim/systems/score.ts). */
const COMBO_MAX_MULTIPLIER = 10
/**
 * Seuil à partir duquel un kill mérite un flash et un anneau. En dessous, le
 * joueur tue en continu : ces effets deviendraient un bruit permanent au lieu
 * d'une récompense (spec §5.1).
 */
export const COMBO_FLASH_MIN_MULTIPLIER = 3
const KILL_PARTICLES_MIN = 10
const KILL_PARTICLES_MAX = 22
/** Ouverture du cône d'éclats projetés à l'opposé du joueur. */
const KILL_CONE = Math.PI * 0.8

/**
 * Secousse d'un kill, exprimée en PIXELS RESSENTIS (voir `shakeForFelt`) :
 * 3,5 px pour un kill isolé à ×1 — la valeur d'avant cette branche — et le
 * double à ×10. Le plafond borne les tueries de masse, où `kills` peut monter
 * à vingt dans un seul pas.
 */
const KILL_SHAKE_FELT_BASE = 2
const KILL_SHAKE_FELT_PER_KILL = 1.5
const KILL_SHAKE_FELT_CAP = 12

/** Position du combo sur 0 → 1 : le seul chiffre qui module tous les effets de kill. */
export function comboIntensity(multiplier: number): number {
  return Math.min(1, Math.max(0, (multiplier - 1) / (COMBO_MAX_MULTIPLIER - 1)))
}

/**
 * Position au-dessus du seuil de flash : 0 pile à ×3, 1 à ×10. `comboIntensity`
 * ne vaut que 0,22 à ×3, ce qui rendait le flash invisible (alpha 0,011) au
 * moment précis où il doit annoncer la récompense — c'est cette rampe-ci, pas
 * l'intensité générale, qui doit piloter sa force.
 */
export function flashGate(multiplier: number): number {
  const span = COMBO_MAX_MULTIPLIER - COMBO_FLASH_MIN_MULTIPLIER
  return Math.min(1, Math.max(0, (multiplier - COMBO_FLASH_MIN_MULTIPLIER) / span))
}

/**
 * Direction joueur → point d'impact, normalisée. `{0, 0}` si le joueur n'existe
 * pas (mort, entre deux runs) : l'appelant retombe alors sur une émission en
 * cercle complet.
 */
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

export interface JuiceState {
  hitstopRemaining: number
  deathSlowmoRemaining: number
  /** Temps restant avant qu'un nouveau hitstop soit à nouveau autorisé à se déclencher. */
  hitstopCooldownRemaining: number
}

export function createJuiceState(): JuiceState {
  return { hitstopRemaining: 0, deathSlowmoRemaining: 0, hitstopCooldownRemaining: 0 }
}

/**
 * Traduit les événements d'un pas de simulation en effets ressentis.
 * Le hitstop est ce qui fait qu'un kill *se sent* — c'est le seul effet de
 * cette liste dont l'absence se remarque immédiatement (spec §3.8).
 *
 * `fx.camera` et `fx.particles` sont des objets de `src/render/` : on les
 * pilote depuis ici (lecture de `world.events`), mais rien ne repart en sens
 * inverse vers la simulation — ce module n'écrit jamais dans `world`, à part
 * l'accumulation d'état purement local (`state`).
 *
 * `fx.motionEnabled` ne coupe QUE la secousse et les particules : ce sont les
 * seuls effets ici qui déplacent l'image à l'écran, donc les seuls candidats
 * à un futur mode « mouvement réduit » (confort vestibulaire). Le hitstop et
 * le ralenti de mort ne sont volontairement jamais gardés par ce booléen —
 * voir le commentaire à chacun de leurs points de réglage ci-dessous.
 *
 * L'intensité de combo (`comboIntensity`) module tout ce que ce module
 * déclenche sur un kill : nombre d'éclats, force de la secousse, présence du
 * flash et de l'anneau. `world.combo` est déjà à jour ici — `scoreSystem`
 * passe en dernier dans `stepWorld`, avant que `game.ts` n'appelle `applyJuice`.
 */
export function applyJuice(
  world: SimWorld,
  state: JuiceState,
  fx: {
    camera: Camera
    particles: Particles
    flash: Flash
    shockwaves: Shockwaves
    /** Tremblement du HUD, `strength` dans [0, 1]. */
    punch(strength: number): void
    motionEnabled: boolean
  },
): void {
  let kills = 0
  // Somme des directions joueur → kill, accumulée derrière `motionEnabled`
  // comme tout ce qui déplace l'image.
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
            // Rampe depuis le seuil, et non `intensity` : le flash doit être
            // visible dès ×3. L'anneau, lui, reste sur `intensity` — 83 px de
            // rayon au seuil se lisent déjà très bien.
            fx.flash.flash(INK.paper, 0.025 + 0.035 * flashGate(multiplier))
            fx.shockwaves.emit(event.x, event.y, {
              color: INK.danger,
              radius: 70 + 60 * intensity,
            })
          }
        }
        break
      }
      case 'powerupUsed':
        if (fx.motionEnabled) {
          fx.camera.shake(shakeForFelt(6))
          fx.particles.emitBurst(event.x, event.y, { color: INK.blast, count: 12 })
          fx.flash.flash(INK.blast, 0.06)
          fx.shockwaves.emit(event.x, event.y, { color: INK.blast, radius: 160 })
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
        // Hors du garde `motionEnabled` : le ralenti de mort RALENTIT le
        // mouvement, il ne le crée pas. Le mode « mouvement réduit » cible
        // le confort vestibulaire (secousse, particules qui bougent à
        // l'écran) — un ralenti n'en déclenche pas, et le couper coûterait
        // du ressenti sans bénéfice pour qui que ce soit.
        state.deathSlowmoRemaining = DEATH_SLOWMO_MS
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
    // Hors du garde `motionEnabled` pour la même raison : le hitstop est un
    // gel (une absence de mouvement), pas un effet vestibulaire. La secousse
    // qui l'accompagne, elle, reste bien derrière `motionEnabled` ci-dessous.
    //
    // Le plancher de cadence (`HITSTOP_CADENCE_MS`) ne s'applique qu'au
    // *déclenchement* : marcher sur une foule gelée tue à chaque pas tant que
    // le joueur la traverse, et sans ce garde chaque kill relancerait les 60 ms
    // pleines — une foule de vingt ennemis gèle alors la simulation quasi en
    // continu (voir rapport de tâche). Un kill isolé, lui, a toujours
    // `hitstopCooldownRemaining` à 0 (aucun hitstop récent) : il se déclenche
    // donc exactement comme avant, plein 60 ms.
    if (state.hitstopCooldownRemaining <= 0) {
      state.hitstopRemaining = HITSTOP_MS
      state.hitstopCooldownRemaining = HITSTOP_CADENCE_MS
    }
    if (fx.motionEnabled) {
      // L'intensité de combo double la secousse au multiplicateur maximal.
      const felt =
        Math.min(KILL_SHAKE_FELT_CAP, KILL_SHAKE_FELT_BASE + kills * KILL_SHAKE_FELT_PER_KILL) *
        (1 + intensity)
      // Moyenne des directions de kill, et non leur somme : une foule qui
      // entoure le joueur s'annule presque, donc un nettoyage complet secoue
      // sans pousser l'image. Seul un amas de kills d'un même côté la déplace,
      // et d'autant plus qu'il est franchement latéral (voir `kickFor`, dont
      // une direction plus courte que 1 affaiblit la poussée d'autant).
      fx.camera.shake(shakeForFelt(felt), killDirX / kills, killDirY / kills)
      fx.punch(0.4 + 0.6 * intensity)
    }
  }
}

/** Facteur de temps à appliquer à la simulation pour ce pas. */
export function timeScaleFor(state: JuiceState, dtMs: number): number {
  // Décompte indépendamment de l'état du hitstop lui-même : la cadence se
  // mesure en temps réel écoulé depuis le dernier déclenchement, pas en temps
  // de simulation geleé (sinon elle ne s'écoulerait jamais tant qu'un hitstop
  // tourne, et la fenêtre de suppression n'aurait aucun effet).
  if (state.hitstopCooldownRemaining > 0) {
    state.hitstopCooldownRemaining -= dtMs
  }
  if (state.hitstopRemaining > 0) {
    state.hitstopRemaining -= dtMs
    return 0
  }
  if (state.deathSlowmoRemaining > 0) {
    state.deathSlowmoRemaining -= dtMs
    return DEATH_SLOWMO_SCALE
  }
  return 1
}
