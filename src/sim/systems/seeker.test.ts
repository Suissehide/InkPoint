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

  /**
   * Le ciblage est **tiré au sort, pas par proximité**. Viser le plus proche
   * concentrait la volée sur le paquet déjà collé au joueur — là où une Bombe
   * ou une Ronce fait déjà le travail — et rendait le tir prévisible.
   *
   * Le test ne vérifie pas une distribution (ce serait fragile) mais la seule
   * propriété qui distingue les deux règles : sur plusieurs volées, la cible
   * **change**. Un ciblage par proximité renverrait toujours le même ennemi,
   * et `vues` n'aurait qu'un seul élément.
   */
  it('tire ses cibles au sort, et non par proximité', () => {
    const w = setup()
    // Alignés en s'éloignant : sous l'ancienne règle, le premier gagnait
    // systématiquement, à chaque volée.
    for (let i = 0; i < 8; i++) {
      spawnEnemy(w, { type: 'point', x: 420 + i * 30, y: 300, materializeMs: 0 })
    }
    const vues = new Set<number>()
    for (let volee = 0; volee < 12; volee++) {
      launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)
    }
    for (const eid of quills(w)) {
      vues.add(Seeker.target[eid]!)
    }
    expect(vues.size, 'toutes les volées ont visé le même ennemi').toBeGreaterThan(1)
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
  it('vire de son taux de virage, ni plus ni moins, quand la cible est derrière', () => {
    const w = setup()
    // Cible pile derrière la plume, une fois son cap remis à zéro ci-dessous.
    spawnEnemy(w, { type: 'point', x: 100, y: 300, materializeMs: 0 })
    launchVolley(w, createRunStats(), 400, 300)
    const eid = quills(w)[0]!
    // `launchVolley` oriente déjà la plume vers sa cible : sans ce cap remis à
    // zéro, l'écart demandé serait *nul* et ce test passerait avec un
    // téléguidage parfait (`Facing.angle[eid] = desired`), sans plafond ni
    // repli d'angle — les deux propriétés qu'il est censé protéger.
    Facing.angle[eid] = 0
    const avant = Facing.angle[eid]!
    seekerSystem(w)
    const ecart = Math.abs(
      Math.atan2(Math.sin(Facing.angle[eid]! - avant), Math.cos(Facing.angle[eid]! - avant)),
    )
    const maxTurn = POWERUP_BASE.volley.turnRate * FIXED_DT
    expect(ecart).toBeLessThanOrEqual(maxTurn + 1e-6)
    // Borne basse : sans elle, une plume qui ne tournerait pas du tout passerait.
    expect(ecart).toBeGreaterThanOrEqual(maxTurn - 1e-6)
  })

  it('reprend une cible quand la sienne meurt', () => {
    const w = setup()
    const proche = spawnEnemy(w, { type: 'point', x: 500, y: 300, materializeMs: 0 })
    const autre = spawnEnemy(w, { type: 'point', x: 400, y: 100, materializeMs: 0 })
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)
    const eid = quills(w)[0]!
    // Le tirage initial est aléatoire (voir `drawTargets`) et sans objet ici :
    // ce test porte sur la RÉACQUISITION. On impose donc la cible de départ,
    // plutôt que de dépendre d'une graine.
    Seeker.target[eid] = proche
    addComponentDoomedThenReap(w, proche)
    seekerSystem(w)
    expect(Seeker.target[eid]).toBe(autre)
  })

  /**
   * La règle qui justifie tout le power-up : « ce que le joueur voit est
   * exactement ce qui tue ». Elle ne tient qu'à l'absence de `HAZARD_QUILL` du
   * `Set` privé `LETHAL` (`hazards.ts`), qu'une ligne ajoutée par mégarde
   * suffirait à rompre.
   *
   * C'est le seul montage qui isole la létalité de la plume de celle de son
   * explosion : **sans `seekerSystem`, aucune explosion n'est jamais posée**,
   * donc la seule zone présente dans le monde est la plume elle-même. Un test
   * qui laisserait l'explosion naître ne prouverait rien — elle est
   * légitimement mortelle, et tuerait la cible que `HAZARD_QUILL` soit dans
   * `LETHAL` ou non.
   */
  it('la plume seule ne tue pas : sans son explosion, la cible survit', () => {
    const w = setup()
    // Ennemi posé sur la plume elle-même, au point de lancement : le contact
    // est acquis dès le premier passage de `hazardSystem`.
    const cible = spawnEnemy(w, { type: 'point', x: 400, y: 300, materializeMs: 0 })
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)
    expect(quills(w)).toHaveLength(1)

    // Volontairement PAS de `seekerSystem` : rien ne doit poser d'explosion.
    hazardSystem(w, createRunStats())
    deathSystem(w)

    expect(blasts(w)).toHaveLength(0)
    expect(entityExists(w, cible) && !hasComponent(w, Doomed, cible)).toBe(true)
  })

  /**
   * Le pendant du test ci-dessus, sur l'autre façon dont une plume pourrait
   * tuer : que `seekerSystem` marque lui-même `Doomed` l'ennemi qu'il touche.
   *
   * Ce test-là ne protège **pas** contre l'ajout de `HAZARD_QUILL` à `LETHAL`
   * (c'est le rôle du précédent) : sa seconde assertion serait satisfaite de
   * toute façon par l'explosion d'impact, qui est posée au même point et
   * légitimement mortelle. Ce qu'il prouve, c'est la *séquence* : au pas de
   * l'impact la cible est encore vivante, et c'est `hazardSystem` — donc le
   * disque que le joueur voit grandir — qui la condamne juste après.
   */
  it('ne condamne pas elle-même sa cible à l’impact : la mort vient au système suivant', () => {
    const w = setup()
    const cible = spawnEnemy(w, { type: 'point', x: 430, y: 300, materializeMs: 0 })
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)

    // `seekerSystem` seul, arrêté au pas de l'impact — reconnu à l'explosion
    // qui vient d'être posée. Aucun autre système n'a encore tourné.
    let pas = 0
    while (blasts(w).length === 0 && pas < 60) {
      seekerSystem(w)
      pas++
    }
    expect(blasts(w)).toHaveLength(1)

    // L'impact a eu lieu, et l'ennemi touché est toujours vivant.
    expect(hasComponent(w, Doomed, cible)).toBe(false)

    // C'est `hazardSystem`, au même pas dans `step.ts`, qui le condamne.
    hazardSystem(w)
    expect(hasComponent(w, Doomed, cible)).toBe(true)
  })

  /**
   * La raison d'être de l'explosion d'impact : une plume ne doit pas valoir
   * une exécution individuelle, elle doit emporter le voisinage de sa cible.
   *
   * **`GROUPE_SERRE` est une promesse de jeu, pas une valeur dérivée.** Elle
   * dit : « deux ennemis distants de 80 px meurent du même impact ». La
   * dériver de `blastRadius` rendrait le test tautologique — il bougerait avec
   * le réglage qu'il est censé surveiller, et un retour à 60 passerait
   * inaperçu. C'est exactement ce qu'on ne veut pas.
   *
   * Le placement tient compte d'un décalage facile à oublier : **l'explosion
   * naît au point de CONTACT, pas au centre de la cible.** La plume s'arrête à
   * `quillRadius + rayon de l'ennemi` de ce centre, donc le disque est excentré
   * d'autant et le second ennemi peut se retrouver jusqu'à 12 px plus loin
   * qu'il n'est de la cible.
   *
   * Les deux ennemis sont interchangeables : le ciblage étant tiré au sort, le
   * test ne doit pas dépendre de celui qui est visé. La géométrie est donc
   * symétrique, et l'assertion porte sur les deux.
   */
  it('emporte tout un groupe serré, pas seulement la cible visée', () => {
    /** Écart entre deux ennemis qu'un seul impact doit emporter ensemble. */
    const GROUPE_SERRE = 80
    const w = setup()
    const a = spawnEnemy(w, { type: 'point', x: 430, y: 300, materializeMs: 0 })
    const b = spawnEnemy(w, { type: 'point', x: 430 + GROUPE_SERRE, y: 300, materializeMs: 0 })
    launchVolley(w, { ...createRunStats(), volleyCount: 1 }, 400, 300)

    // Assez de pas pour l'impact puis la croissance complète du disque.
    run(w, 60)

    expect(entityExists(w, a), 'un ennemi du groupe a survécu à l’impact').toBe(false)
    expect(entityExists(w, b), 'un ennemi du groupe a survécu à l’impact').toBe(false)
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
    const proche = spawnEnemy(w, { type: 'point', x: 430, y: 300, materializeMs: 0 })
    spawnEnemy(w, { type: 'point', x: 430, y: 500, materializeMs: 0 })
    const stats: RunStats = {
      ...createRunStats(),
      volleyCount: 1,
      rules: new Set(['nestedQuills']),
    }
    launchVolley(w, stats, 400, 300)
    // Cible et cap imposés : le tirage est aléatoire, et ce test mesure une
    // FENÊTRE DE TEMPS (après la relance, avant son propre impact) qui dépend
    // de la distance parcourue. Le laisser au sort le rendrait intermittent.
    const partie = quills(w)[0]!
    Seeker.target[partie] = proche
    Facing.angle[partie] = 0

    run(w, 30)
    const restantes = quills(w)
    expect(restantes).toHaveLength(1)
    expect(Seeker.relaunches[restantes[0]!]).toBe(0)
  })

  /**
   * L'ennemi qui vient d'être touché n'est marqué `Doomed` que par
   * `hazardSystem`, au pas suivant (voir le test « ne condamne pas elle-même
   * sa cible » ci-dessus) : il est donc encore dans `preys` au moment de la
   * relance, à distance ~0 de l'impact. Sans exclusion, `nearestPrey` le
   * rendrait systématiquement — la plume relancée viserait le cadavre au lieu
   * de l'autre ennemi.
   */
  it('relance vise un autre ennemi, pas celui qui vient d’être touché', () => {
    const w = setup()
    const proche = spawnEnemy(w, { type: 'point', x: 430, y: 300, materializeMs: 0 })
    const loin = spawnEnemy(w, { type: 'point', x: 100, y: 550, materializeMs: 0 })
    const stats: RunStats = {
      ...createRunStats(),
      volleyCount: 1,
      rules: new Set(['nestedQuills']),
    }
    launchVolley(w, stats, 400, 300)
    // Cible et cap imposés : le tirage initial est aléatoire (`drawTargets`),
    // or ce test porte sur ce que vise la RELANCE. Il lui faut donc un impact
    // connu — celui sur `proche`.
    const partie = quills(w)[0]!
    Seeker.target[partie] = proche
    Facing.angle[partie] = 0

    // `seekerSystem` seul, arrêté au pas de l'impact : la relance naît dans
    // le même appel que le contact, avant que `hazardSystem` ne condamne
    // `proche`.
    let pas = 0
    while (blasts(w).length === 0 && pas < 60) {
      seekerSystem(w)
      pas++
    }
    expect(blasts(w)).toHaveLength(1)

    const relancee = quills(w)
    expect(relancee).toHaveLength(1)
    expect(Seeker.target[relancee[0]!]).toBe(loin)
  })
})
