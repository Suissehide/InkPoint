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

// Requête bitECS, pas un balayage d'indices bruts : les eid viennent d'un
// compteur global au processus, un balayage compterait aussi les autres `it()`.
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

  // 60 pas (1000 ms) : seule longueur qui distingue la soustraction de
  // l'accumulateur (33 segments, `floor(1000/30)`) d'une remise à zéro (30
  // seulement) — sur peu de pas les deux politiques coïncident.
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
