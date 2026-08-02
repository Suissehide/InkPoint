import { Container, Graphics } from 'pixi.js'

import { INK } from '../ink'
import { NIBS, type SkinId } from './nibs'

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

/**
 * Rayon de l'arc de grâce : au-dessus de la pointe (13 px de long) et
 * franchement sous l'anneau du Halo (17), pour que les deux se lisent comme
 * deux objets et non comme un anneau qui aurait épaissi.
 */
const GRACE_RADIUS = 15
/** Épaisseur de l'arc. Fin : c'est une jauge, pas une seconde silhouette. */
const GRACE_WIDTH = 2
/**
 * Opacité de l'arc **avant** le voile du conteneur. Pendant une grâce sans
 * Halo, `container.alpha` vaut 0,55 et l'arc retombe donc à ~0,5 — le poids de
 * l'anneau du Halo, dont la lisibilité est déjà éprouvée sur ce fond.
 */
const GRACE_ALPHA = 0.9
/**
 * En dessous de cette part restante, l'arc n'est plus tracé. Un arc de moins
 * d'un degré est un point, pas une jauge, et Pixi finit par en faire un
 * artefact ; le voile à 55 %, lui, dit encore « protégé » jusqu'au bout.
 */
const GRACE_MIN_RATIO = 0.002

export interface PlayerView {
  container: Container
  /** Change la silhouette. Appelée entre deux parties, jamais pendant. */
  setSkin(skin: SkinId): void
  update(opts: {
    x: number
    y: number
    angle: number
    hasHalo: boolean
    invulnerable: boolean
    /**
     * Part de grâce restante, de 1 (elle vient d'être accordée) à 0 (aucune) —
     * `Invulnerable.remaining / total`, calculé par `sim/invulnerability.ts`.
     * Un rapport et non deux durées : la vue n'a pas à savoir laquelle des
     * quatre sources a accordé la grâce, ni combien de temps elle valait.
     */
    graceRatio: number
    /** Temps réel écoulé depuis la frame précédente — anime le halo. */
    dtMs: number
  }): void
}

/**
 * La silhouette de la pointe, à l'origine et pointant vers +x.
 * Exportée parce que les images rémanentes de la ruée (`fx/afterimage.ts`) la
 * dessinent aussi : un fantôme qui ne ressemble pas au joueur ne se lit pas
 * comme sa trace, et deux copies du même tracé finissent toujours par diverger.
 */
export function drawNib(gfx: Graphics, color: number, skin: SkinId = 'quill'): void {
  const pts = NIBS[skin]
  const [first = [0, 0], ...rest] = pts
  gfx.moveTo(first[0], first[1])
  for (const [x, y] of rest) {
    gfx.lineTo(x, y)
  }
  gfx.closePath().fill({ color })
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

/**
 * L'angle balayé par l'arc de grâce, en radians, pour une part restante
 * donnée : un tour plein quand la grâce vient d'être accordée, rien quand elle
 * expire.
 *
 * Borné aux deux bouts plutôt que de faire confiance à l'appelant. Un rapport
 * au-dessus de 1 ferait dépasser l'arc du tour complet et il se replierait
 * par-dessus lui-même ; sous 0, Pixi tracerait l'arc **complémentaire**, donc
 * une jauge qui se remplit au lieu de se vider — le contresens exact.
 *
 * Le test `ratio > 0` et non `ratio <= 0` : il est faux pour `NaN`, qui repart
 * donc à 0. Le bornage par `Math.min`/`Math.max`, lui, laisse passer `NaN`
 * intact, et un angle `NaN` fait disparaître le tracé entier de Pixi — halo et
 * silhouette compris, pas seulement l'arc.
 */
export function graceSweep(ratio: number): number {
  if (!(ratio > 0)) {
    return 0
  }
  return Math.min(1, ratio) * Math.PI * 2
}

/** Le joueur : une pointe de plume orientée vers son déplacement. */
export function createPlayerView(): PlayerView {
  const container = new Container()
  const body = new Graphics()
  const halo = new Graphics()
  const motes = new Graphics()
  const grace = new Graphics()
  container.addChild(halo, motes, grace, body)

  let skin: SkinId = 'quill'
  drawNib(body, INK.paper, skin)
  halo.circle(0, 0, HALO_RADIUS).stroke({ color: INK.paper, width: 2, alpha: 0.55 })

  // Le halo s'anime sur une horloge murale qui lui est propre : il doit
  // continuer à respirer pendant un hitstop, comme la secousse et les
  // particules, alors que le monde est gelé.
  let haloElapsed = 0
  let hadHalo = false

  return {
    container,
    setSkin(next: SkinId): void {
      if (next === skin) {
        return
      }
      skin = next
      body.clear()
      drawNib(body, INK.paper, skin)
    },
    update({ x, y, angle, hasHalo, invulnerable, graceRatio, dtMs }) {
      container.x = x
      container.y = y
      container.rotation = angle
      // Le voile reste : il dit « protégé ». L'arc, lui, dit « jusqu'à quand ».
      // Deux questions différentes, deux réponses.
      container.alpha = invulnerable && !hasHalo ? 0.55 : 1

      // L'arc de grâce. `- angle` comme les motes : le conteneur tourne avec la
      // plume, et une jauge dont l'origine pivote avec le joueur ne se lit
      // pas — le vide paraîtrait tourner au lieu de se combler.
      grace.clear()
      if (graceRatio > GRACE_MIN_RATIO) {
        const sweep = graceSweep(graceRatio)
        // Tête fixe en haut, queue qui la rejoint dans le sens horaire (angles
        // croissants, l'axe y pointant vers le bas) : c'est l'arc qui SE
        // REFERME sur midi, et non un vide qui s'ouvre à rebours.
        const head = -Math.PI / 2 - angle
        grace.arc(0, 0, GRACE_RADIUS, head - sweep, head)
        grace.stroke({ color: INK.paper, width: GRACE_WIDTH, alpha: GRACE_ALPHA })
      }

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
