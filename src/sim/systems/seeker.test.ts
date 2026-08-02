import { addComponent, defineQuery, entityExists, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Doomed, Facing, Hazard, Position, Seeker } from '../components'
import { HAZARD_BLAST, HAZARD_QUILL, POWERUP_BASE } from '../data/powerups'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '../world'
import { deathSystem } from './death'
import { hazardSystem } from './hazards'
import { lifetimeSystem } from './lifetime'
import { launchVolley, seekerSystem } from './seeker'

const hazardsIn = defineQuery([Hazard, Position])

const setup = (): SimWorld => {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 400
  Position.y[w.playerEid] = 300
  return w
}

const ofKind = (w: SimWorld, kind: number): number[] =>
  hazardsIn(w).filter((eid) => Hazard.kind[eid] === kind && !hasComponent(w, Doomed, eid))

const quills = (w: SimWorld): number[] => ofKind(w, HAZARD_QUILL)
const blasts = (w: SimWorld): number[] => ofKind(w, HAZARD_BLAST)

/**
 * Un mini-pas de simulation : les quatre systèmes qui décident du sort d'une
 * plume, dans l'ordre de `step.ts`. Sans `lifetimeSystem`, aucune plume
 * n'expirerait jamais et le test du sursis écoulé passerait pour une
 * mauvaise raison (la sortie d'arène).
 *
 * `hazardSystem` en fait partie : c'est lui qui tue l'ennemi touché, donc lui
 * qui décide de la suite d'une plume relancée. Sans lui, la relance renaît
 * dans un ennemi toujours vivant et se redéclenche au pas suivant — un pas de
 * simulation qui n'existe nulle part dans le vrai jeu.
 */
const run = (w: SimWorld, steps: number): void => {
  for (let i = 0; i < steps; i++) {
    seekerSystem(w)
    hazardSystem(w)
    lifetimeSystem(w)
    deathSystem(w)
    w.time += FIXED_DT
  }
}

/** Tue un ennemi comme le ferait une zone mortelle, puis applique la mort. */
function addComponentDoomedThenReap(w: SimWorld, eid: number): void {
  addComponent(w, Doomed, eid)
  deathSystem(w)
}

describe('launchVolley', () => {
  it('lance autant de plumes que les stats en demandent', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    expect(quills(w)).toHaveLength(POWERUP_BASE.volley.count)
  })

  it('suit le compte des stats, pas la constante de base', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    const stats: RunStats = { ...createRunStats(), volleyCount: 5 }
    launchVolley(w, stats, 400, 300)
    expect(quills(w)).toHaveLength(5)
  })

  // Trois plumes sur un même ennemi quand trois sont disponibles gâcherait la
  // volée : elles doivent se répartir.
  it('vise des ennemis distincts quand il y en a assez', () => {
    const w = setup()
    const a = spawnEnemy(w, { type: 'point', x: 500, y: 300, materializeMs: 0 })
    const b = spawnEnemy(w, { type: 'point', x: 300, y: 300, materializeMs: 0 })
    const c = spawnEnemy(w, { type: 'point', x: 400, y: 200, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    const cibles = quills(w).map((eid) => Seeker.target[eid])
    expect(new Set(cibles)).toEqual(new Set([a, b, c]))
  })

  // Deux plumes sur une même cible valent mieux qu'une plume gâchée.
  it('ne perd aucune plume quand il y a moins d’ennemis que de plumes', () => {
    const w = setup()
    const seul = spawnEnemy(w, { type: 'point', x: 600, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    const lancees = quills(w)
    expect(lancees).toHaveLength(POWERUP_BASE.volley.count)
    for (const eid of lancees) {
      expect(Seeker.target[eid]).toBe(seul)
    }
  })

  it('part quand même sans aucun ennemi, en éventail', () => {
    const w = setup()
    launchVolley(w, createRunStats(), 400, 300)
    const lancees = quills(w)
    expect(lancees).toHaveLength(POWERUP_BASE.volley.count)
    expect(new Set(lancees.map((eid) => Facing.angle[eid])).size).toBe(POWERUP_BASE.volley.count)
    for (const eid of lancees) {
      expect(Seeker.target[eid]).toBe(-1)
    }
  })

  // Le pointillé est inoffensif ET hors d'atteinte partout ailleurs dans le jeu.
  it('ne cible jamais un ennemi en matérialisation', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 420, y: 300, materializeMs: 5_000 })
    const loin = spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    for (const eid of quills(w)) {
      expect(Seeker.target[eid]).toBe(loin)
    }
  })
})

describe('seekerSystem', () => {
  it('rapproche la plume de sa cible', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 700, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    const eid = quills(w)[0]!
    const avant = Math.hypot(700 - Position.x[eid]!, 300 - Position.y[eid]!)
    run(w, 10)
    const apres = Math.hypot(700 - Position.x[eid]!, 300 - Position.y[eid]!)
    expect(apres).toBeLessThan(avant)
  })

  // Le virage est progressif : une plume doit pouvoir manquer sa cible et se
  // rabattre, pas la coller comme un aimant.
  it('ne tourne jamais de plus que son taux de virage sur un pas', () => {
    const w = setup()
    // Cible pile derrière la plume : l'écart de cap demandé vaut π.
    spawnEnemy(w, { type: 'point', x: 100, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    const eid = quills(w)[0]!
    const avant = Facing.angle[eid]!
    seekerSystem(w)
    const ecart = Math.abs(
      Math.atan2(Math.sin(Facing.angle[eid]! - avant), Math.cos(Facing.angle[eid]! - avant)),
    )
    expect(ecart).toBeLessThanOrEqual(POWERUP_BASE.volley.turnRate * FIXED_DT + 1e-6)
  })

  it('reprend une cible quand la sienne meurt', () => {
    const w = setup()
    const proche = spawnEnemy(w, { type: 'point', x: 500, y: 300, materializeMs: 0 })
    const autre = spawnEnemy(w, { type: 'point', x: 400, y: 100, materializeMs: 0 })
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)
    const eid = quills(w)[0]!
    expect(Seeker.target[eid]).toBe(proche)
    addComponentDoomedThenReap(w, proche)
    seekerSystem(w)
    expect(Seeker.target[eid]).toBe(autre)
  })

  it('pose une explosion à l’impact et retire la plume', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 430, y: 300, materializeMs: 0 })
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)
    const eid = quills(w)[0]!
    // 10 pas, pas 30 : l'impact tombe au 4e, et l'explosion ne vit que
    // 307,5 ms (~18 pas). À 30 pas elle a déjà expiré, et le test constaterait
    // son absence sans rien prouver sur sa naissance.
    run(w, 10)
    expect(entityExists(w, eid) && !hasComponent(w, Doomed, eid)).toBe(false)
    expect(blasts(w).length).toBeGreaterThan(0)
  })

  // Une explosion sans impact mentirait sur ce qui vient de tuer.
  it('expire sans explosion quand elle n’a jamais rencontré personne', () => {
    const w = setup()
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)
    run(w, 400)
    expect(quills(w)).toHaveLength(0)
    expect(blasts(w)).toHaveLength(0)
  })

  it('disparaît en sortant de l’arène plutôt que de voler hors de la page', () => {
    const w = setup()
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 795, 300)
    const eid = quills(w)[0]!
    Facing.angle[eid] = 0
    run(w, 20)
    expect(entityExists(w, eid) && !hasComponent(w, Doomed, eid)).toBe(false)
  })

  it('relance une plume à l’impact quand la règle est active, une seule fois', () => {
    const w = setup()
    spawnEnemy(w, { type: 'point', x: 430, y: 300, materializeMs: 0 })
    spawnEnemy(w, { type: 'point', x: 430, y: 500, materializeMs: 0 })
    const stats: RunStats = {
      ...createRunStats(),
      volleyCount: 1,
      rules: new Set(['nestedQuills']),
    }
    launchVolley(w, stats, 400, 300)
    run(w, 30)
    const restantes = quills(w)
    expect(restantes).toHaveLength(1)
    expect(Seeker.relaunches[restantes[0]!]).toBe(0)
  })
})
