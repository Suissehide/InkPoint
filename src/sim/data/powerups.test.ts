import { describe, expect, it } from 'vitest'

import { ENEMIES } from './enemies'
import {
  POWERUP_BASE,
  POWERUP_BY_ID,
  POWERUP_ID,
  POWERUP_KINDS,
  type PowerUpKind,
} from './powerups'

/**
 * Les identifiants sont des étiquettes opaques, jamais renumérotées :
 * `POWERUP_BY_ID` doit porter `null` aux indices libérés. Un `splice` au lieu
 * d'un `null` décalerait tout silencieusement d'un cran — seul symptôme, un
 * mauvais pictogramme au sol.
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

describe('perméabilité de la couronne de Ronce', () => {
  // Tout est dérivé des constantes réelles, jamais recopié : un futur réglage
  // de `count`, `orbitRadius` ou `thornRadius` qui refermerait la couronne
  // doit faire échouer ce test plutôt que passer inaperçu.
  const { count, orbitRadius, thornRadius } = POWERUP_BASE.bramble
  /** Distance entre les centres de deux épines voisines. */
  const ecart = 2 * orbitRadius * Math.sin(Math.PI / count)
  /** Largeur que deux épines voisines barrent à un ennemi de rayon `r`. */
  const barre = (r: number): number => 2 * (thornRadius + r)

  it('laisse encore se faufiler le Point et l’Éclat', () => {
    expect(ecart).toBeGreaterThan(barre(ENEMIES.point.radius))
    expect(ecart).toBeGreaterThan(barre(ENEMIES.shard.radius))
  })

  it('arrête toujours le Bloc', () => {
    expect(ecart).toBeLessThan(barre(ENEMIES.blot.radius))
  })
})
