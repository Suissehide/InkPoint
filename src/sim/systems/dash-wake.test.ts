import { addComponent, defineQuery } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Dashing, Hazard, Position } from '../components'
import { HAZARD_TRAIL, POWERUP_BASE } from '../data/powerups'
import { spawnPlayer } from '../spawn'
import { createRunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT } from '../world'
import { dashWakeSystem } from './dash-wake'

const setup = () => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

// Une requête bitECS, PAS un balayage d'indices bruts (`for eid = 0; eid < N`) :
// les ids d'entité viennent d'un compteur global au processus, pas par monde, si
// bien qu'un balayage voit les entités des autres `it()` du fichier et compte
// faux. C'est l'idiome déjà employé par les autres tests de simulation.
const hazardQuery = defineQuery([Hazard, Position])

const wakeEids = (w: ReturnType<typeof setup>): number[] =>
  hazardQuery(w).filter((eid) => Hazard.kind[eid] === HAZARD_TRAIL)

describe('dashWakeSystem', () => {
  it('ne dépose rien hors de la ruée', () => {
    const w = setup()
    for (let i = 0; i < 20; i++) {
      dashWakeSystem(w, createRunStats())
      w.time += FIXED_DT
    }
    expect(wakeEids(w)).toHaveLength(0)
  })

  it("dépose un segment à l'intervalle prévu pendant la ruée", () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 1000

    // 6 pas de 16,67 ms = 100 ms ; à 30 ms d'intervalle, on attend 3 segments
    // (t = 0 compris, puis 30 et 60 et 90 → 4 au plus, 3 au moins selon l'arrondi).
    for (let i = 0; i < 6; i++) {
      dashWakeSystem(w, stats)
      w.time += FIXED_DT
    }
    const expected = Math.floor(100 / POWERUP_BASE.dash.wakeIntervalMs)
    expect(wakeEids(w).length).toBeGreaterThanOrEqual(expected)
    expect(wakeEids(w).length).toBeLessThanOrEqual(expected + 2)
  })

  it('donne au segment le rayon de la ruée', () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 1000

    // Un seul appel n'accumule que 16,67 ms sur les 30 requis : aucun segment
    // ne naîtrait encore, et la boucle ci-dessous se contenterait de ne rien
    // vérifier (vrai par vacuité). Deux appels, avec l'avance de temps entre
    // les deux comme le fait réellement `stepWorld`, franchissent l'intervalle
    // et garantissent qu'au moins un segment existe à inspecter.
    dashWakeSystem(w, stats)
    w.time += FIXED_DT
    dashWakeSystem(w, stats)

    const eids = wakeEids(w)
    expect(eids.length).toBeGreaterThan(0)
    for (const eid of eids) {
      // Précision 4, pas 6 : les champs de composant bitECS sont des `f32`, et
      // exiger 1e-6 sur une valeur de cet ordre échoue sur l'arrondi seul.
      expect(Hazard.radius[eid]).toBeCloseTo(stats.dashRadius, 4)
    }
  })
})
