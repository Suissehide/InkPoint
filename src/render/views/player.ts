import { Container, Graphics } from 'pixi.js'

import { INK } from '../ink'

/** Durée d'installation du halo, en ms. */
export const HALO_INSTALL_MS = 320
/** Amplitude de la respiration, en fraction du rayon. */
export const HALO_BREATHE_AMPLITUDE = 0.045
/** Pulsation de la respiration, en rad/ms — une période d'environ 1,25 s. */
const HALO_BREATHE_RATE = 0.005
/** Rayon nominal de l'anneau. */
const HALO_RADIUS = 17
/** Nombre de motes en orbite. */
const MOTE_COUNT = 7
/** Vitesse angulaire des motes, en rad/ms. */
const MOTE_RATE = 0.0011

export interface PlayerView {
  container: Container
  update(opts: {
    x: number
    y: number
    angle: number
    hasHalo: boolean
    invulnerable: boolean
    /** Temps réel écoulé depuis la frame précédente — anime le halo. */
    dtMs: number
  }): void
}

/**
 * La silhouette de la pointe de plume, à l'origine et pointant vers +x.
 * Exportée parce que les images rémanentes de la ruée (`fx/afterimage.ts`) la
 * dessinent aussi : un fantôme qui ne ressemble pas au joueur ne se lit pas
 * comme sa trace, et deux copies du même tracé finissent toujours par diverger.
 */
export function drawNib(gfx: Graphics, color: number): void {
  gfx.moveTo(13, 0).lineTo(-8, 9).lineTo(-4, 0).lineTo(-8, -9).closePath().fill({ color })
}

/** Installation du halo sur [0, 1]. Courbe ease-out cubique : se pose vite puis s'ancre. */
export function haloInstall(elapsedMs: number): number {
  const k = Math.min(1, Math.max(0, elapsedMs / HALO_INSTALL_MS))
  return 1 - (1 - k) ** 3
}

/** Facteur de rayon de la respiration, borné à ±`HALO_BREATHE_AMPLITUDE`. */
export function haloBreathe(elapsedMs: number): number {
  return 1 + HALO_BREATHE_AMPLITUDE * Math.sin(elapsedMs * HALO_BREATHE_RATE)
}

/** Le joueur : une pointe de plume orientée vers son déplacement. */
export function createPlayerView(): PlayerView {
  const container = new Container()
  const body = new Graphics()
  const halo = new Graphics()
  const motes = new Graphics()
  container.addChild(halo, motes, body)

  drawNib(body, INK.paper)
  halo.circle(0, 0, HALO_RADIUS).stroke({ color: INK.paper, width: 2, alpha: 0.55 })

  // Le halo s'anime sur une horloge murale qui lui est propre : il doit
  // continuer à respirer pendant un hitstop, comme la secousse et les
  // particules, alors que le monde est gelé.
  let haloElapsed = 0
  let hadHalo = false

  return {
    container,
    update({ x, y, angle, hasHalo, invulnerable, dtMs }) {
      container.x = x
      container.y = y
      container.rotation = angle
      container.alpha = invulnerable && !hasHalo ? 0.55 : 1

      if (hasHalo && !hadHalo) {
        // Reprise à zéro à chaque nouveau halo : ramassé deux fois de suite,
        // il doit se réinstaller, pas continuer la respiration du précédent.
        haloElapsed = 0
      }
      hadHalo = hasHalo
      halo.visible = hasHalo
      motes.visible = hasHalo
      if (!hasHalo) {
        return
      }

      haloElapsed += dtMs
      const install = haloInstall(haloElapsed)
      const scale = install * haloBreathe(haloElapsed)
      halo.scale.set(scale)
      halo.alpha = install

      // La rotation des motes est portée par le tracé, pas par un conteneur :
      // le conteneur du joueur tourne déjà avec la plume, et les motes ne
      // doivent pas suivre son orientation.
      motes.clear()
      for (let i = 0; i < MOTE_COUNT; i++) {
        const a = (i / MOTE_COUNT) * Math.PI * 2 + haloElapsed * MOTE_RATE - angle
        const r = HALO_RADIUS * 3.8 * scale
        motes.circle(Math.cos(a) * r, Math.sin(a) * r, 2.1)
      }
      motes.fill({ color: INK.paper, alpha: 0.55 * install })
    },
  }
}
