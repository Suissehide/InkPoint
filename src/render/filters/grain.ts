import { Filter, GlProgram } from 'pixi.js'

import fragment from './grain.frag?raw'
import { FILTER_VERTEX } from './vertex'

export interface GrainFilter extends Filter {
  setPhase(phase: number): void
}

export function createGrainFilter(): GrainFilter {
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment }),
    resources: {
      grainUniforms: {
        uPhase: { value: 0, type: 'f32' },
        uAmount: { value: 0.05, type: 'f32' },
      },
    },
  }) as GrainFilter

  filter.setPhase = (phase: number) => {
    filter.resources.grainUniforms.uniforms.uPhase = phase
  }
  return filter
}
