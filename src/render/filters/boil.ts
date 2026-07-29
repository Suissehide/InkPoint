import { Filter, GlProgram } from 'pixi.js'

import { BOIL_PERIOD_MS } from '../ink'
import fragment from './boil.frag?raw'
import { FILTER_VERTEX } from './vertex'

/** Entier qui change exactement 8 fois par seconde, quel que soit le framerate. */
export function boilPhase(timeMs: number): number {
  return Math.floor(timeMs / BOIL_PERIOD_MS) % 8
}

export interface BoilFilter extends Filter {
  setPhase(phase: number): void
  setAmount(amount: number): void
}

export function createBoilFilter(): BoilFilter {
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment }),
    resources: {
      boilUniforms: {
        uPhase: { value: 0, type: 'f32' },
        uAmount: { value: 0.0022, type: 'f32' },
      },
    },
  }) as BoilFilter

  filter.setPhase = (phase: number) => {
    filter.resources.boilUniforms.uniforms.uPhase = phase
  }
  filter.setAmount = (amount: number) => {
    filter.resources.boilUniforms.uniforms.uAmount = amount
  }
  return filter
}
