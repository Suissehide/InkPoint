import { Filter, GlProgram } from 'pixi.js'

import { INK } from '../ink'
import { FILTER_VERTEX } from './vertex'
import fragment from './vignette.frag?raw'

export interface VignetteFilter extends Filter {
  setIntensity(v: number): void
}

/** Décompose une couleur hexadécimale Pixi (0xRRGGBB) en vec3 normalisé [0, 1]. */
function toVec3(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255]
}

export function createVignetteFilter(): VignetteFilter {
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment }),
    resources: {
      vignetteUniforms: {
        uIntensity: { value: 0, type: 'f32' },
        // Teinte de danger (INK.danger) — réservée aux ennemis dans tout le
        // projet ; ici elle signale qu'un ennemi approche, ce qui est
        // exactement le sens de cette couleur.
        uColor: { value: toVec3(INK.danger), type: 'vec3<f32>' },
      },
    },
  }) as VignetteFilter

  filter.setIntensity = (v: number) => {
    filter.resources.vignetteUniforms.uniforms.uIntensity = v
  }
  return filter
}
