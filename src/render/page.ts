import { Container, Graphics, type Mask, Sprite, Texture } from 'pixi.js'

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
 * Sous-ensemble de `Container` utilisé pour poser ou retirer le masque de
 * halo — juste assez pour être imité par un faux objet en test, l'environnement
 * de test n'ayant ni DOM ni WebGL pour instancier un vrai `Container` Pixi.
 */
interface MaskTarget {
  mask: Mask
  setMask(options: { mask: Mask; channel?: 'red' | 'alpha' }): void
}

/**
 * Pose ou retire le masque de halo sur `target`. Extraite en fonction pure
 * (pas de dépendance à un vrai `Container` Pixi) précisément parce que ce
 * chemin a un piège qu'un test doit verrouiller : dans Pixi v8.19,
 * `Container#setMask` n'appelle le setter `mask` — celui qui retire
 * réellement l'effet — que si `options.mask` est vérité
 * (`effectsMixin.js` : `if (options.mask) { this.mask = options.mask }`),
 * contrairement à ce que promet son typage. `target.setMask({ mask: null })`
 * est donc un no-op silencieux dans cette version : retirer un masque doit
 * passer par l'assignation directe `target.mask = null`, jamais par
 * `setMask`.
 */
export function applyHaloMask(target: MaskTarget, mask: Mask, haloEnabled: boolean): void {
  if (haloEnabled) {
    target.setMask({ mask, channel: 'alpha' })
  } else {
    target.mask = null
  }
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
    // Le rouge/vert/bleu ici ne sont pas de la couleur : le masque est posé
    // avec `channel: 'alpha'` (voir `applyHaloMask`), donc seul le canal
    // alpha de ce dégradé est jamais lu. Blanc choisi par convention, pas
    // remplacé par une teinte d'`INK` — ça n'aurait aucun effet visuel.
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

  const applyMode = (): void => {
    // Voir `applyHaloMask` : jamais `layer.setMask({ mask: null })` pour
    // retirer le masque, Pixi l'ignore silencieusement dans cette version.
    applyHaloMask(layer, mask, haloEnabled)
    // Un `Sprite` ne devient `renderable: false` (invisible en tant que
    // sprite normal) que lorsque Pixi l'engage comme masque actif
    // (`AlphaMask.init`, déclenché par `setMask` ci-dessus) — et cet
    // indicateur n'est jamais restauré au retrait (`AlphaMask.reset` ne
    // touche que `measurable`, pas `renderable`). Si le mouvement réduit est
    // déjà actif à la création de la page (préférence persistée dès le
    // lancement), le masque n'est jamais engagé une seule fois : sans cette
    // ligne, le sprite du dégradé se rendrait comme un sprite ordinaire,
    // visible, au lieu de rester un simple masque en attente.
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
