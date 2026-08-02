import { describe, expect, it } from 'vitest'

import { ENEMIES } from './enemies'
import {
  POWERUP_BASE,
  POWERUP_BY_ID,
  POWERUP_DISABLED,
  POWERUP_DRAWABLE,
  POWERUP_ID,
  POWERUP_KINDS,
  POWERUP_WEIGHT,
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

/**
 * Le sac de tirage (`pickup.ts`) somme ces poids : un genre sans poids ou de
 * poids nul y serait indistinguable d'un genre absent. Tout est exprimé en
 * rangs relatifs, jamais en pourcentages — les proportions bougent à chaque
 * réglage, la hiérarchie qu'elles servent, non.
 */
describe('poids de tirage des power-ups', () => {
  it('donne un poids défini et strictement positif à chaque genre', () => {
    for (const kind of POWERUP_KINDS) {
      const weight = POWERUP_WEIGHT[kind]
      expect(weight, `poids manquant pour « ${kind} »`).toBeTypeOf('number')
      expect(weight, `poids non tirable pour « ${kind} »`).toBeGreaterThan(0)
    }
  })

  it('ne pondère aucun genre étranger à POWERUP_KINDS', () => {
    expect(Object.keys(POWERUP_WEIGHT).sort()).toEqual([...POWERUP_KINDS].sort())
  })

  it('garde le Halo plus rare que les cinq offensifs : c’est lui qui empêche de mourir', () => {
    const offensifs = POWERUP_KINDS.filter((kind) => kind !== 'halo' && kind !== 'bramble')
    for (const kind of offensifs) {
      expect(POWERUP_WEIGHT[kind], `« ${kind} » descendu au niveau du Halo`).toBeGreaterThan(
        POWERUP_WEIGHT.halo,
      )
    }
  })

  it('garde la Ronce sous le Halo : c’est le power-up le plus rare du jeu', () => {
    expect(POWERUP_WEIGHT.halo).toBeGreaterThan(POWERUP_WEIGHT.bramble)
  })
})

describe('étanchéité de la couronne de Ronce', () => {
  // Tout est dérivé des constantes réelles, jamais recopié : un futur réglage
  // de `count`, `orbitRadius` ou `thornRadius` qui rouvrirait la couronne doit
  // faire échouer ce test plutôt que passer inaperçu. Le sens de l'assertion
  // est l'inverse de celui d'avant le playtest : la couronne laissait alors
  // passer les deux petits ennemis de propos délibéré (voir `powerups.ts`).
  const { count, orbitRadius, thornRadius } = POWERUP_BASE.bramble
  /** Distance entre les centres de deux épines voisines. */
  const ecart = 2 * orbitRadius * Math.sin(Math.PI / count)
  /** Largeur que deux épines voisines barrent à un ennemi de rayon `r`. */
  const barre = (r: number): number => 2 * (thornRadius + r)

  it('n’ouvre de passage à aucun genre d’ennemi', () => {
    for (const def of Object.values(ENEMIES)) {
      expect(ecart, `« ${def.type} » se faufile entre deux épines`).toBeLessThan(barre(def.radius))
    }
  })

  it('garde une marge sur le plus petit ennemi, faute de quoi un pas de simulation suffirait à passer', () => {
    const plusPetit = Math.min(...Object.values(ENEMIES).map((def) => def.radius))
    // 20 % : le seuil le plus serré des trois genres ne doit pas être frôlé,
    // un réglage de `count` d'un cran ne doit pas suffire à rouvrir la couronne.
    expect(ecart).toBeLessThan(barre(plusPetit) * 0.8)
  })
})

/**
 * Le Buvard est désactivé, pas supprimé : il garde son identifiant, son poids
 * et tout son code. Un poids nul aurait fait la même chose en apparence, mais
 * `powerups.test.ts` exige un poids strictement positif — précisément parce
 * qu'un zéro se lit comme un oubli, là où un ensemble nommé dit ce qu'il fait.
 */
describe('genres retirés du tirage', () => {
  it('ne désactive que des genres qui existent', () => {
    for (const kind of POWERUP_DISABLED) {
      expect([...POWERUP_KINDS], `« ${kind} » désactivé mais absent de POWERUP_KINDS`).toContain(
        kind,
      )
    }
  })

  it('laisse le sac de tirage non vide', () => {
    expect(POWERUP_DRAWABLE.length).toBeGreaterThan(0)
  })

  it('exclut du sac exactement les genres désactivés', () => {
    const attendu = POWERUP_KINDS.filter((kind) => !POWERUP_DISABLED.has(kind))
    expect([...POWERUP_DRAWABLE]).toEqual(attendu)
  })

  // La désactivation ne touche pas l'identité : le Buvard doit rester
  // interprétable si une sauvegarde ou un test le pose au sol à la main.
  it('garde un identifiant et un poids aux genres désactivés', () => {
    for (const kind of POWERUP_DISABLED) {
      expect(POWERUP_ID[kind]).toBeGreaterThan(0)
      expect(POWERUP_WEIGHT[kind]).toBeGreaterThan(0)
    }
  })
})
