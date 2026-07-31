import { Container, Graphics, type Mask, Sprite, Texture } from 'pixi.js'

import { INK } from './ink'

/** Rayon du halo de révélation, en pixels d'arène. */
export const PAGE_HALO_RADIUS = 165
/** Opacité de la réglure sous la plume. */
export const PAGE_REVEAL_PEAK = 0.34
/** En mouvement réduit le halo est coupé (page visible, mais sans disque lumineux mobile qui suit le joueur) ; ceci en est l'opacité uniforme. */
export const PAGE_STATIC_ALPHA = 0.07

/** Espacement des lignes de réglure. */
const RULE_GAP = 32
/** Abscisse de la marge verticale. */
const MARGIN_X = 58
/** Côté de la texture de dégradé, en pixels. */
const MASK_SIZE = PAGE_HALO_RADIUS * 2

export interface Page {
  resize(width: number, height: number): void
  /** `null` quand le joueur n'est pas à l'écran : la page se retire. */
  update(position: { x: number; y: number } | null): void
  /** `false` = mouvement réduit : réglure statique et uniforme, pas de halo. */
  setHaloEnabled(enabled: boolean): void
  destroy(): void
}

/** Sous-ensemble de `Container` : assez pour être imité par un faux objet en test (pas de DOM/WebGL pour un vrai `Container` Pixi). */
interface MaskTarget {
  mask: Mask
  setMask(options: { mask: Mask; channel?: 'red' | 'alpha' }): void
}

/**
 * Piège Pixi v8.19 : `Container#setMask({ mask: null })` est un no-op
 * silencieux (`effectsMixin.js` n'appelle le setter `mask` que si
 * `options.mask` est vérité), malgré ce que son typage promet. Retirer un
 * masque doit passer par l'assignation directe `target.mask = null`.
 */
export function applyHaloMask(target: MaskTarget, mask: Mask, haloEnabled: boolean): void {
  if (haloEnabled) {
    target.setMask({ mask, channel: 'alpha' })
  } else {
    target.mask = null
  }
}

/** Pic au centre, nulle au bord et au-delà : hors du halo, le fond n'existe pas. */
export function revealAlpha(distance: number, radius: number): number {
  if (distance >= radius) {
    return 0
  }
  return PAGE_REVEAL_PEAK * (1 - distance / radius)
}

/** Disque dont l'alpha suit `revealAlpha`, normalisé sur [0, 1] : c'est `container.alpha` qui porte le pic, pour que le mouvement réduit puisse le remplacer sans retoucher la texture. */
function createMaskTexture(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = MASK_SIZE
  canvas.height = MASK_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('render/page: contexte 2D indisponible pour le masque de révélation')
  }
  const gradient = ctx.createRadialGradient(
    PAGE_HALO_RADIUS,
    PAGE_HALO_RADIUS,
    0,
    PAGE_HALO_RADIUS,
    PAGE_HALO_RADIUS,
    PAGE_HALO_RADIUS,
  )
  const stops = 12
  for (let i = 0; i <= stops; i++) {
    const t = i / stops
    const normalized = revealAlpha(t * PAGE_HALO_RADIUS, PAGE_HALO_RADIUS) / PAGE_REVEAL_PEAK
    // Masque posé avec `channel: 'alpha'` : seul le canal alpha est jamais lu, le blanc RGB n'a aucun effet visuel.
    gradient.addColorStop(t, `rgba(255,255,255,${normalized})`)
  }
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE)
  return Texture.from(canvas)
}

/** Vit dans `content`, avant `worldLayer` : prend le masque d'arène et la vignette, mais pas le boil — c'est du papier, pas de l'encre. */
export function createPage(container: Container): Page {
  const layer = new Container()
  const ruling = new Graphics()
  layer.addChild(ruling)
  container.addChild(layer)

  const maskTexture = createMaskTexture()
  const mask = new Sprite(maskTexture)
  mask.anchor.set(0.5)
  container.addChild(mask)

  let haloEnabled = true

  const applyMode = (): void => {
    applyHaloMask(layer, mask, haloEnabled)
    // Si le mouvement réduit est déjà actif à la création, `setMask` n'est
    // jamais engagé : sans cette ligne le masque, jamais rendu `renderable: false`
    // par Pixi (`AlphaMask.init`), s'afficherait comme un sprite ordinaire.
    mask.visible = haloEnabled
    layer.alpha = haloEnabled ? PAGE_REVEAL_PEAK : PAGE_STATIC_ALPHA
  }
  applyMode()

  return {
    resize(width, height): void {
      ruling.clear()
      for (let y = RULE_GAP; y < height; y += RULE_GAP) {
        ruling.moveTo(0, y).lineTo(width, y)
      }
      ruling.stroke({ color: INK.paper, width: 1.3 })
      ruling.moveTo(MARGIN_X, 0).lineTo(MARGIN_X, height)
      ruling.stroke({ color: INK.danger, width: 1.3, alpha: 0.85 })
    },

    update(position): void {
      if (!position) {
        layer.visible = false
        mask.visible = false
        return
      }
      layer.visible = true
      if (haloEnabled) {
        mask.visible = true
        mask.position.set(position.x, position.y)
      }
    },

    setHaloEnabled(enabled): void {
      haloEnabled = enabled
      applyMode()
    },

    destroy(): void {
      layer.destroy({ children: true })
      mask.destroy()
      maskTexture.destroy(true)
    },
  }
}
