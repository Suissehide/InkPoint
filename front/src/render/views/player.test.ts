import { describe, expect, it } from 'vitest'

import {
  graceSweep,
  HALO_BREATHE_AMPLITUDE,
  HALO_INSTALL_MS,
  haloBreathe,
  haloInstall,
} from './player'

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

describe('graceSweep', () => {
  it("part d'un tour plein et se referme entièrement", () => {
    expect(graceSweep(1)).toBeCloseTo(Math.PI * 2, 10)
    expect(graceSweep(0)).toBe(0)
    expect(graceSweep(0.5)).toBeCloseTo(Math.PI, 10)
  })

  it('décroît avec la part restante', () => {
    let precedent = graceSweep(1)
    for (let r = 1; r >= 0; r -= 0.01) {
      const sweep = graceSweep(r)
      expect(sweep).toBeLessThanOrEqual(precedent + 1e-12)
      precedent = sweep
    }
  })

  /**
   * Les deux débordements que la vue ne doit jamais laisser passer. Au-dessus
   * de 1, l'arc dépasserait le tour complet et se replierait sur lui-même ;
   * sous 0, Pixi tracerait l'arc COMPLÉMENTAIRE — une jauge qui se remplit au
   * lieu de se vider, le contresens exact.
   */
  it('reste dans [0, 2π] pour un rapport aberrant', () => {
    for (const r of [-1, -1e9, 1.5, 1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const sweep = graceSweep(r)
      expect(sweep, `graceSweep(${r})`).toBeGreaterThanOrEqual(0)
      expect(sweep, `graceSweep(${r})`).toBeLessThanOrEqual(Math.PI * 2)
    }
  })
})
