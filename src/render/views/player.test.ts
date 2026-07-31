import { describe, expect, it } from 'vitest'

import { HALO_BREATHE_AMPLITUDE, HALO_INSTALL_MS, haloBreathe, haloInstall } from './player'

describe('haloInstall', () => {
  it('part de rien', () => {
    expect(haloInstall(0)).toBeCloseTo(0, 10)
  })

  it('est complètement installé au bout de sa durée', () => {
    expect(haloInstall(HALO_INSTALL_MS)).toBeCloseTo(1, 10)
  })

  it('ne dépasse jamais 1, même longtemps après', () => {
    expect(haloInstall(HALO_INSTALL_MS * 10)).toBe(1)
  })

  it('freine en fin de course : plus de la moitié du chemin à mi-temps', () => {
    expect(haloInstall(HALO_INSTALL_MS / 2)).toBeGreaterThan(0.5)
  })
})

describe('haloBreathe', () => {
  it('démarre à sa taille nominale', () => {
    expect(haloBreathe(0)).toBeCloseTo(1, 10)
  })

  it('reste borné par son amplitude', () => {
    for (let t = 0; t < 4000; t += 17) {
      expect(Math.abs(haloBreathe(t) - 1)).toBeLessThanOrEqual(HALO_BREATHE_AMPLITUDE + 1e-9)
    }
  })

  it('respire vraiment : il s’écarte de 1 quelque part', () => {
    let ecartMax = 0
    for (let t = 0; t < 4000; t += 17) {
      ecartMax = Math.max(ecartMax, Math.abs(haloBreathe(t) - 1))
    }
    expect(ecartMax).toBeGreaterThan(HALO_BREATHE_AMPLITUDE * 0.9)
  })
})
