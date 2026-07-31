import { Container, Graphics, Sprite, Texture } from 'pixi.js'

import { INK } from './ink'

/** Rayon du halo de révélation, en pixels d'arène. */
export const PAGE_HALO_RADIUS = 165
/** Opacité de la réglure sous la plume. */
export const PAGE_REVEAL_PEAK = 0.34
/**
 * Opacité uniforme de la réglure en mouvement réduit. Le halo est alors coupé :
 * un large disque lumineux qui suit le joueur est précisément le genre de
 * changement de luminance que ce réglage existe pour éviter (spec §6). La page
 * reste, seule sa révélation mobile disparaît.
 */
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

/**
 * Opacité de la page à `distance` de la plume. Pic au centre, nulle au bord et
 * au-delà : c'est la variante « révélation pure » — hors du halo, le fond
 * n'existe pas (spec §2.1).
 */
export function revealAlpha(distance: number, radius: number): number {
  if (distance >= radius) {
    return 0
  }
  return PAGE_REVEAL_PEAK * (1 - distance / radius)
}

/**
 * Texture du masque : un disque dont l'alpha suit `revealAlpha`, normalisé sur
 * [0, 1] — c'est `container.alpha` qui porte le pic, pour que le mouvement
 * réduit puisse le remplacer par une valeur uniforme sans retoucher la texture.
 */
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
    gradient.addColorStop(t, `rgba(255,255,255,${normalized})`)
  }
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE)
  return Texture.from(canvas)
}

/**
 * La page sous l'arène : une réglure de cahier révélée par un halo qui suit la
 * plume. Vit dans `content`, avant `worldLayer` — elle prend donc le masque
 * d'arène et la vignette, mais pas le boil : c'est du papier, pas de l'encre.
 */
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

  // Un `Sprite` posé en masque lit par défaut le canal rouge de sa texture
  // (utile pour des masques en niveaux de gris), pas son canal alpha. Notre
  // texture porte le dégradé dans l'alpha (le rouge, prémultiplié, ne suit
  // `revealAlpha` qu'au carré) : sans `channel: 'alpha'` ici, la révélation
  // suivrait une courbe plus resserrée que celle voulue par `revealAlpha`, pas
  // le dégradé linéaire attendu.
  const applyMode = (): void => {
    layer.setMask({ mask: haloEnabled ? mask : null, channel: 'alpha' })
    mask.visible = haloEnabled
    layer.alpha = haloEnabled ? PAGE_REVEAL_PEAK : PAGE_STATIC_ALPHA
  }
  applyMode()

  return {
    resize(width, height): void {
      // Tracée à opacité pleine : le dégradé du masque et `layer.alpha`
      // portent seuls l'atténuation, donc un redimensionnement n'a jamais à
      // rejouer les calculs de révélation.
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
