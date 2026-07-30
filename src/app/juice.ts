import type { Camera } from '@/render/camera'
import { INK } from '@/render/ink'
import type { Particles } from '@/render/particles'
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
 */
export function applyJuice(
  world: SimWorld,
  state: JuiceState,
  fx: { camera: Camera; particles: Particles; motionEnabled: boolean },
): void {
  let kills = 0

  for (const event of world.events) {
    switch (event.type) {
      case 'enemyKilled':
        kills++
        if (fx.motionEnabled) {
          fx.particles.emitBurst(event.x, event.y, { color: INK.danger, count: 7 })
        }
        break
      case 'powerupUsed':
        if (fx.motionEnabled) {
          fx.camera.shake(6)
          fx.particles.emitBurst(event.x, event.y, { color: INK.blast, count: 12 })
        }
        break
      case 'haloBroken':
        if (fx.motionEnabled) {
          fx.camera.shake(14)
          fx.particles.emitBurst(event.x, event.y, { color: INK.paper, count: 24 })
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
          fx.camera.shake(24)
          fx.particles.emitBurst(event.x, event.y, { color: INK.paper, count: 40 })
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
      fx.camera.shake(Math.min(18, 2 + kills * 1.5))
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
