import { describe, expect, it } from 'vitest'

import { simSourceHash } from './scripts/sim-source-hash'
import { SIM_VERSION } from './version.generated'

describe('empreinte des sources de sim/', () => {
  it('correspond aux sources actuelles', () => {
    // Rouge = quelqu'un a modifié `sim/` sans régénérer. Ce n'est pas le test
    // qui est trop strict : un replay enregistré sous l'ancienne empreinte
    // serait rejoué sous une simulation différente, et rendrait un score faux.
    // `npm run version:sim` depuis front/.
    expect(SIM_VERSION).toBe(simSourceHash())
  })

  it('fait 16 caractères hexadécimaux', () => {
    expect(SIM_VERSION).toMatch(/^[0-9a-f]{16}$/)
  })
})
