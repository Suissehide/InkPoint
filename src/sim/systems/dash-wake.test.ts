import { addComponent, defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Dashing, Facing, Hazard, Position } from '../components'
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

  // 60 pas, et pas 6 : c'est la seule longueur qui teste vraiment son sujet. Le
  // système soustrait l'intervalle de l'accumulateur (`acc -= interval`) au lieu
  // de le remettre à zéro, précisément pour que la cadence ne dérive pas. Or sur
  // 6 pas les deux politiques donnent exactement 3 segments : le test
  // documentait une intention qu'il ne pouvait pas détecter. Sur 60 pas
  // (1 000 ms), elles divergent — 33 segments par soustraction (l'accumulateur
  // conserve son reste, `floor(1000 / 30)`), 30 seulement par remise à zéro (un
  // segment tous les 2 pas, puisque 16,67 ms < 30 ms ≤ 33,3 ms). La valeur est
  // écrite en dur : changer `wakeIntervalMs` doit faire échouer ce test, c'est
  // une décision de cadence à assumer explicitement.
  it("dépose un segment à l'intervalle prévu, sans dériver, pendant la ruée", () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 2000

    for (let i = 0; i < 60; i++) {
      dashWakeSystem(w, stats)
      w.time += FIXED_DT
    }
    expect(POWERUP_BASE.dash.wakeIntervalMs).toBe(30)
    expect(wakeEids(w)).toHaveLength(33)
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

  it('oriente le segment dans le sens de la ruée', () => {
    const w = setup()
    const stats = createRunStats()
    addComponent(w, Dashing, w.playerEid)
    Dashing.remaining[w.playerEid] = 1000
    // Ruée vers le haut-droite : angle attendu -π/4.
    Dashing.vx[w.playerEid] = 500
    Dashing.vy[w.playerEid] = -500

    dashWakeSystem(w, stats)
    w.time += FIXED_DT
    dashWakeSystem(w, stats)

    const eids = wakeEids(w)
    expect(eids.length).toBeGreaterThan(0)
    for (const eid of eids) {
      expect(hasComponent(w, Facing, eid)).toBe(true)
      expect(Facing.angle[eid]).toBeCloseTo(-Math.PI / 4, 4)
    }
  })
})
