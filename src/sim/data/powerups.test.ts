import { describe, expect, it } from 'vitest'

import { POWERUP_BY_ID, POWERUP_ID, POWERUP_KINDS, type PowerUpKind } from './powerups'

/**
 * Trois power-ups ont été retirés (Rature, Séchage, Trait d'encre) et à chaque
 * fois la même vérification a été refaite à la main : les identifiants sont des
 * étiquettes opaques, jamais renumérotées, et `POWERUP_BY_ID` doit porter `null`
 * aux indices libérés. Le jour où quelqu'un fera un `splice` au lieu d'un `null`,
 * tout se décalerait silencieusement d'un cran — `POWERUP_BY_ID[6]` rendrait le
 * Halo au lieu de la Plume — et le seul symptôme serait un mauvais pictogramme
 * au sol. Ce test est ce qui manquait pour l'attraper.
 */
describe('table des identifiants de power-ups', () => {
  it('chaque genre se retrouve à son propre identifiant', () => {
    for (const kind of POWERUP_KINDS) {
      expect(POWERUP_BY_ID[POWERUP_ID[kind]], `aller-retour rompu pour « ${kind} »`).toBe(kind)
    }
  })

  it('POWERUP_KINDS et POWERUP_ID décrivent exactement les mêmes genres', () => {
    expect([...POWERUP_KINDS].sort()).toEqual(Object.keys(POWERUP_ID).sort())
  })

  it('aucune entrée de POWERUP_BY_ID ne désigne un genre disparu', () => {
    const live = new Set<PowerUpKind>(POWERUP_KINDS)
    POWERUP_BY_ID.forEach((kind, id) => {
      if (kind !== null) {
        expect(
          live.has(kind),
          `l'identifiant ${id} pointe vers « ${kind} », qui n'existe plus`,
        ).toBe(true)
      }
    })
  })

  // 0 n'est pas un power-up : c'est la valeur par défaut d'un champ bitECS,
  // donc « emplacement vide ». Lui donner un genre rendrait tout champ non
  // initialisé indiscernable d'un vrai power-up.
  it("l'identifiant 0 reste « emplacement vide »", () => {
    expect(POWERUP_BY_ID[0]).toBeNull()
    expect(Object.values(POWERUP_ID)).not.toContain(0)
  })
})
