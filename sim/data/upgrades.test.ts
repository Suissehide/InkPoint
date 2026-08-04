import { defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Hazard, Lifetime, Position, Ricochet, Seeker } from '../components'
import { spawnPlayer } from '../spawn'
import { launchSplatter } from '../systems/ricochet'
import { launchVolley } from '../systems/seeker'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, type SimWorld } from '../world'
import { HAZARD_QUILL, HAZARD_SPLATTER, POWERUP_DRAWABLE } from './powerups'
import { UPGRADES } from './upgrades'

/**
 * Les cartes rares de la Volée et de la Bavure activent une règle stockée
 * dans un `Set<string>` non typé (`RunStats.rules`) : une faute de frappe
 * dans la chaîne côté carte ne serait vue ni par le compilateur, ni par le
 * lint, ni par aucun test existant — la carte serait silencieusement sans
 * effet. Ces tests passent par `apply()`, comme `drawUpgrades` le ferait en
 * jeu, et vérifient l'effet réellement produit par le système concerné :
 * eux seuls mordent sur une chaîne mal orthographiée dans `upgrades.ts`.
 */

const setup = (): SimWorld => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  return w
}

const hazardsIn = defineQuery([Hazard, Position])

const quills = (w: SimWorld): number[] =>
  hazardsIn(w).filter((eid) => Hazard.kind[eid] === HAZARD_QUILL && !hasComponent(w, Doomed, eid))

const drops = (w: SimWorld): number[] =>
  hazardsIn(w).filter(
    (eid) => Hazard.kind[eid] === HAZARD_SPLATTER && !hasComponent(w, Doomed, eid),
  )

/** La carte d'id donné, ou une erreur si elle a disparu de `UPGRADES`. */
function cardById(id: string): (typeof UPGRADES)[number] {
  const card = UPGRADES.find((u) => u.id === id)
  if (!card) {
    throw new Error(`carte introuvable : ${id}`)
  }
  return card
}

describe('cartes de la Volée', () => {
  it('« Plumes gigognes » arme le budget de relance des plumes, à zéro sans elle', () => {
    const sans = setup()
    launchVolley(sans, createRunStats(), 400, 300)
    for (const eid of quills(sans)) {
      expect(Seeker.relaunches[eid]).toBe(0)
    }

    const avec = setup()
    const stats: RunStats = createRunStats()
    cardById('nested-quills').apply(stats)
    launchVolley(avec, stats, 400, 300)
    expect(quills(avec).length).toBeGreaterThan(0)
    for (const eid of quills(avec)) {
      expect(Seeker.relaunches[eid]).toBe(1)
    }
  })

  it('« Volée nourrie » prise deux fois fait partir 5 plumes au lieu de 3', () => {
    const w = setup()
    const stats: RunStats = createRunStats()
    cardById('volley-count').apply(stats)
    cardById('volley-count').apply(stats)
    launchVolley(w, stats, 400, 300)
    expect(quills(w)).toHaveLength(5)
  })
})

describe('cartes de la Bavure', () => {
  it('« Éclaboussure » arme le dédoublement de la goutte, à zéro sans elle', () => {
    const sans = setup()
    launchSplatter(sans, createRunStats(), 400, 300)
    expect(Ricochet.splitsLeft[drops(sans)[0]!]).toBe(0)

    const avec = setup()
    const stats: RunStats = createRunStats()
    cardById('splatter-split').apply(stats)
    launchSplatter(avec, stats, 400, 300)
    expect(Ricochet.splitsLeft[drops(avec)[0]!]).toBe(1)
  })

  it('« Bavure tenace » allonge le sursis de la goutte de 1500 ms', () => {
    const sans = setup()
    launchSplatter(sans, createRunStats(), 400, 300)
    const dureeSansCarte = Lifetime.remaining[drops(sans)[0]!]!

    const avec = setup()
    const stats: RunStats = createRunStats()
    cardById('splatter-life').apply(stats)
    launchSplatter(avec, stats, 400, 300)
    const dureeAvecCarte = Lifetime.remaining[drops(avec)[0]!]!

    expect(dureeAvecCarte - dureeSansCarte).toBe(1500)
  })
})

describe('couverture du pool', () => {
  /**
   * Le Halo a longtemps été le seul power-up qu'aucune carte ne touchait —
   * déséquilibre consigné au §5 de la spec de rebuild, et resserré à chaque
   * élagage sans jamais être refermé.
   *
   * L'assertion porte sur tous les genres tirables plutôt que sur `halo-burst`
   * nommément : ainsi elle garde sa valeur au prochain élagage, et elle attrape
   * le prochain power-up ajouté sans carte. `POWERUP_DRAWABLE` et non
   * `POWERUP_KINDS` : un genre retiré du sac (le Buvard aujourd'hui) n'a pas à
   * porter une carte que personne ne peut tirer.
   */
  it('chaque power-up tirable a au moins une carte', () => {
    for (const kind of POWERUP_DRAWABLE) {
      expect(
        UPGRADES.some((u) => u.requires === kind),
        `aucune carte pour ${kind}`,
      ).toBe(true)
    }
  })
})
