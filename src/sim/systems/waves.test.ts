import { addComponent, defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Collider, Enemy, Formation, Invulnerable, Materializing, Position } from '../components'
import { MAX_ENEMIES, WAVE_DURATION_MS } from '../data/difficulty'
import { AMBUSH_MIN_DISTANCE, MATERIALIZE_AMBUSH_MS, MAX_ENEMY_RADIUS } from '../data/enemies'
import { FORMATION_KINDS } from '../data/formations'
import { spawnPlayer } from '../spawn'
import { ARENA, createWorld, FIXED_DT, type SimWorld } from '../world'
import { waveSystem } from './waves'

const enemies = defineQuery([Enemy])

const setup = () => {
  const w = createWorld({ seed: 12, width: 800, height: 600 })
  spawnPlayer(w)
  return w
}

const setupAt = (px: number, py: number, width = 800, height = 600, seed = 12) => {
  const w = createWorld({ seed, width, height })
  spawnPlayer(w)
  Position.x[w.playerEid] = px
  Position.y[w.playerEid] = py
  return w
}

/**
 * Positions de joueur balayées par les tests d'apparition, dans l'arène
 * nominale. Surtout pas le seul centre : à (640, 360) les bords sont à 346 px
 * et plus, aucun recalage d'apparition n'est jamais sollicité et les tests
 * passent par vacuité. Les quatre parois et les quatre coins le sont, eux.
 */
const PLAYER_SPOTS: readonly (readonly [number, number])[] = [
  [ARENA.width / 2, ARENA.height / 2],
  [30, ARENA.height / 2],
  [ARENA.width - 30, ARENA.height / 2],
  [ARENA.width / 2, 30],
  [ARENA.width / 2, ARENA.height - 30],
  [30, 30],
  [ARENA.width - 30, 30],
  [30, ARENA.height - 30],
  [ARENA.width - 30, ARENA.height - 30],
  // Juste dans la bande où écarter de 180 px le long du bord dépasse la
  // bordure : un écartement qui pousse d'abord puis reborne y rend moins que
  // la distance qu'il promet, alors qu'écarter de l'autre côté tenait.
  [30, ARENA.height - AMBUSH_MIN_DISTANCE - 5],
  [ARENA.width - AMBUSH_MIN_DISTANCE - 5, 30],
]

/**
 * Une figure traversante telle qu'on peut la relire depuis le monde : son
 * origine, son bord d'entrée et ses membres déjà tournés face à la marche.
 * Tout est reconstruit depuis le composant `Formation`, que `waveSystem`
 * renseigne au spawn — le test ne recopie de `waves.ts` que la géométrie de
 * l'arène et le rayon d'ennemi, jamais son placement.
 */
interface CrossingBatch {
  originX: number
  originY: number
  /** Axe le long duquel la figure peut glisser : perpendiculaire à sa marche. */
  axis: 'x' | 'y'
  dirX: number
  dirY: number
  kind: number
  members: { x: number; y: number }[]
}

const crossingBatches = (w: SimWorld): CrossingBatch[] => {
  const batches = new Map<string, CrossingBatch>()
  for (const eid of enemies(w)) {
    if (!hasComponent(w, Formation, eid)) {
      continue
    }
    const dirX = Formation.dirX[eid]!
    const dirY = Formation.dirY[eid]!
    // Les figures enveloppantes (Cercle, Carré) ne marchent pas : elles
    // naissent autour du joueur, pas sur un bord, et ne glissent nulle part.
    if (dirX === 0 && dirY === 0) {
      continue
    }
    const originX = Formation.originX[eid]!
    const originY = Formation.originY[eid]!
    const rotation = Formation.rotationOffset[eid]!
    const kind = Formation.kind[eid]!
    const key = `${originX}|${originY}|${rotation}|${kind}`
    const batch = batches.get(key) ?? {
      originX,
      originY,
      axis: dirX !== 0 ? ('y' as const) : ('x' as const),
      dirX,
      dirY,
      kind,
      members: [],
    }
    // Même rotation qu'au spawn : le composant garde le décalage LOCAL.
    const ox = Formation.offsetX[eid]!
    const oy = Formation.offsetY[eid]!
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    batch.members.push({ x: ox * cos - oy * sin, y: ox * sin + oy * cos })
    batches.set(key, batch)
  }
  return [...batches.values()]
}

/** Distance du membre le plus proche du joueur, pour une origine donnée. */
const nearestMember = (w: SimWorld, batch: CrossingBatch, originValue: number): number => {
  const px = Position.x[w.playerEid]!
  const py = Position.y[w.playerEid]!
  const ox = batch.axis === 'x' ? originValue : batch.originX
  const oy = batch.axis === 'y' ? originValue : batch.originY
  let nearest = Number.POSITIVE_INFINITY
  for (const member of batch.members) {
    nearest = Math.min(nearest, Math.hypot(ox + member.x - px, oy + member.y - py))
  }
  return nearest
}

/** Pas du balayage de l'intervalle admissible, en px. */
const SWEEP_STEP = 0.5

/**
 * Le contrat que doit tenir le placement d'une figure traversante : ou bien
 * elle dégage `AMBUSH_MIN_DISTANCE` du joueur, ou bien AUCUNE position
 * admissible le long de son bord n'aurait fait mieux — c'est-à-dire que c'est
 * son envergure, et elle seule, qui l'a empêchée de s'écarter davantage.
 *
 * Formulé ainsi et pas « toujours 180 px » parce que c'est la seule garantie
 * vraie : une figure qui barre toute l'étendue de son bord d'entrée ne peut
 * pas dégager un joueur collé à cette paroi, aucune position ne le permet.
 *
 * L'optimum est cherché en BALAYANT tout l'intervalle, et surtout pas en
 * comparant aux seules bornes : `c ↦ distance au membre le plus proche` est un
 * minimum de fonctions convexes, son maximum peut tomber à l'intérieur de
 * l'intervalle. Se limiter aux bornes reviendrait à valider le placement
 * contre l'exact jeu de candidats qu'il utilise — un test qui ne peut pas voir
 * l'erreur qu'il est censé garder.
 */
const expectClearedOrBestPossible = (w: SimWorld, batch: CrossingBatch, label: string): void => {
  let min = 0
  let max = 0
  for (const member of batch.members) {
    const value = batch.axis === 'x' ? member.x : member.y
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  const span = batch.axis === 'x' ? ARENA.width : ARENA.height
  const lo = MAX_ENEMY_RADIUS - min
  const hi = span - MAX_ENEMY_RADIUS - max
  // `lo > hi` : figure plus large que l'arène, une seule position possible.
  let best = nearestMember(w, batch, lo)
  if (hi > lo) {
    for (let c = lo; c < hi; c += SWEEP_STEP) {
      best = Math.max(best, nearestMember(w, batch, c))
    }
    best = Math.max(best, nearestMember(w, batch, hi))
  }

  const actual = nearestMember(w, batch, batch.axis === 'x' ? batch.originX : batch.originY)
  // 2 px de tolérance : le pas du balayage (0,5 px, dont la dérivée vaut au
  // plus 1) et les décalages relus en float32.
  expect(
    actual,
    `${label} : membre le plus proche à ${actual.toFixed(1)} px, une origine admissible en aurait dégagé ${best.toFixed(1)}`,
  ).toBeGreaterThanOrEqual(Math.min(AMBUSH_MIN_DISTANCE, best) - 2)
}

const runFor = (w: ReturnType<typeof setup>, ms: number) => {
  const steps = Math.ceil(ms / FIXED_DT)
  for (let i = 0; i < steps; i++) {
    waveSystem(w)
    w.time += FIXED_DT
  }
}

describe('waveSystem', () => {
  it('fait apparaître des ennemis au fil du temps', () => {
    const w = setup()
    runFor(w, 6000)
    expect(enemies(w).length).toBeGreaterThan(0)
  })

  it('émet waveEnded après 40 secondes et incrémente la vague', () => {
    const w = setup()
    runFor(w, WAVE_DURATION_MS + FIXED_DT * 2)
    expect(w.events.some((e) => e.type === 'waveEnded' && e.wave === 1)).toBe(true)
    expect(w.wave).toBe(2)
  })

  it("n'utilise que le type Point à la vague 1", () => {
    const w = setup()
    runFor(w, 20_000)
    expect(enemies(w).length).toBeGreaterThan(0)
    for (const eid of enemies(w)) {
      expect(Enemy.type[eid]).toBe(0)
    }
  })

  it("respecte le plafond d'ennemis simultanés", () => {
    const w = setup()
    runFor(w, 400_000)
    expect(enemies(w).length).toBeLessThanOrEqual(MAX_ENEMIES)
  })

  it('les embuscades respectent la distance minimale au joueur', () => {
    const w = setup()
    w.wave = 8
    runFor(w, 60_000)
    const px = Position.x[w.playerEid]!
    const py = Position.y[w.playerEid]!
    let ambushCount = 0
    for (const eid of enemies(w)) {
      // On ne teste que les ennemis encore en apparition, apparus via une embuscade :
      // les autres ont bougé, ou proviennent d'une apparition en bord d'écran.
      if (hasComponent(w, Materializing, eid) && Materializing.total[eid] === 1600) {
        ambushCount += 1
        expect(Math.hypot(Position.x[eid]! - px, Position.y[eid]! - py)).toBeGreaterThanOrEqual(
          AMBUSH_MIN_DISTANCE - 1,
        )
      }
    }
    // Sans cette assertion le test passerait aussi si aucune embuscade n'avait eu lieu.
    expect(ambushCount).toBeGreaterThan(0)
  })

  it("accorde 0,5 s d'invulnérabilité au début de chaque vague", () => {
    const w = setup()
    runFor(w, WAVE_DURATION_MS + FIXED_DT * 2)
    expect(hasComponent(w, Invulnerable, w.playerEid)).toBe(true)
    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(500, 0)
  })

  it("n'écourte pas une grâce déjà plus longue", () => {
    const w = setup()
    // 1000 ms : ce que `collision.ts` accorde à la rupture du Halo, c'est-à-dire
    // précisément quand le joueur est encerclé. Un passage de vague juste après
    // ne doit pas ramener cette protection à 500 ms et le relâcher dans la
    // formation qui vient d'apparaître.
    addComponent(w, Invulnerable, w.playerEid)
    Invulnerable.remaining[w.playerEid] = 1000

    runFor(w, WAVE_DURATION_MS + FIXED_DT * 2)

    expect(Invulnerable.remaining[w.playerEid]).toBeCloseTo(1000, 0)
  })

  it('est déterministe : même graine, mêmes apparitions', () => {
    const a = setup()
    const b = setup()
    runFor(a, 30_000)
    runFor(b, 30_000)
    expect(enemies(a).length).toBe(enemies(b).length)
    const posA = Array.from(enemies(a)).map((e) => Position.x[e])
    const posB = Array.from(enemies(b)).map((e) => Position.x[e])
    expect(posA).toEqual(posB)
  })

  it("les embuscades restent dans l'arène même près d'un coin", () => {
    // Joueur près d'un coin (pas au centre comme les autres tests) : le cas
    // dégénéré est rare, on cumule plusieurs graines pour obtenir un
    // échantillon d'embuscades assez grand pour trancher.
    let ambushCount = 0
    for (let seed = 1; seed <= 60; seed++) {
      const w = setupAt(30, 30, 800, 600, seed)
      w.wave = 8
      runFor(w, 60_000)
      const px = Position.x[w.playerEid]!
      const py = Position.y[w.playerEid]!
      for (const eid of enemies(w)) {
        if (
          hasComponent(w, Materializing, eid) &&
          Materializing.total[eid] === MATERIALIZE_AMBUSH_MS
        ) {
          ambushCount += 1
          const x = Position.x[eid]!
          const y = Position.y[eid]!
          expect(x).toBeGreaterThan(0)
          expect(x).toBeLessThan(w.arena.width)
          expect(y).toBeGreaterThan(0)
          expect(y).toBeLessThan(w.arena.height)
          expect(Math.hypot(x - px, y - py)).toBeGreaterThanOrEqual(AMBUSH_MIN_DISTANCE - 1)
        }
      }
    }
    // Sans cette assertion le test passerait aussi si aucune embuscade n'avait eu lieu.
    expect(ambushCount).toBeGreaterThan(0)
  })

  it("ne fait naître aucun ennemi hors de l'arène sur les deux axes à la fois", () => {
    // Une figure traversante naît hors-champ le long de sa marche : c'est
    // voulu, elle entre ensuite à vitesse lisible. Perpendiculairement à cette
    // marche, en revanche, elle doit tenir dans l'arène — sinon ses membres
    // naissent derrière le masque de découpe (render/stage.ts), y achèvent
    // leur apparition sans jamais montrer leur contour pointillé, et
    // `formationSystem` puis `integrationSystem` les plaquent pleins et
    // mortels contre la paroi en un seul pas.
    for (const startMs of [600_000, 1_200_000]) {
      const w = createWorld({ seed: 7, width: ARENA.width, height: ARENA.height })
      spawnPlayer(w)
      w.wave = 8
      w.time = startMs
      runFor(w, 20_000)

      const spawns = w.events.filter((e) => e.type === 'enemySpawned')
      expect(spawns.length).toBeGreaterThan(0)
      for (const spawn of spawns) {
        if (spawn.type !== 'enemySpawned') {
          continue
        }
        const insideX = spawn.x >= 0 && spawn.x <= w.arena.width
        const insideY = spawn.y >= 0 && spawn.y <= w.arena.height
        expect(
          insideX || insideY,
          `à t=${startMs} ms, apparition en (${spawn.x.toFixed(0)}, ${spawn.y.toFixed(0)}) : hors arène sur les deux axes`,
        ).toBe(true)
      }
    }
  })

  it("consomme un nombre de tirages PRNG indépendant de la taille de l'arène", () => {
    // Déterminisme (netcode v3) : deux mondes à la même graine mais des
    // arènes différentes ne doivent jamais diverger. Témoin indirect : la
    // séquence des *types* d'ennemis apparus, qui puise dans le même flux de
    // tirages, doit être identique quelle que soit la taille de l'arène.
    const a = createWorld({ seed: 12, width: 800, height: 600 })
    spawnPlayer(a)
    a.wave = 6

    const b = createWorld({ seed: 12, width: 300, height: 220 })
    spawnPlayer(b)
    b.wave = 6

    // 60 s pour laisser le temps à au moins une embuscade de se produire :
    // c'est uniquement pendant l'échantillonnage d'une embuscade que l'ancien
    // code pouvait consommer un nombre de tirages variable.
    runFor(a, 60_000)
    runFor(b, 60_000)

    const ambushCountOf = (w: ReturnType<typeof setup>) =>
      Array.from(enemies(w)).filter(
        (eid) =>
          hasComponent(w, Materializing, eid) && Materializing.total[eid] === MATERIALIZE_AMBUSH_MS,
      ).length

    // Sans cette assertion le test passerait aussi si aucune embuscade n'avait
    // jamais eu lieu dans l'un ou l'autre monde — la seule situation où la
    // divergence de tirages testée ici peut apparaître.
    expect(ambushCountOf(a)).toBeGreaterThan(0)

    const typesOf = (w: ReturnType<typeof setup>) =>
      w.events
        .filter((e) => e.type === 'enemySpawned')
        .map((e) => (e.type === 'enemySpawned' ? Enemy.type[e.eid] : undefined))

    const typesA = typesOf(a)
    const typesB = typesOf(b)
    expect(typesA.length).toBeGreaterThan(0)
    expect(typesA).toEqual(typesB)
  })

  it('consomme un nombre de tirages PRNG indépendant de la position du joueur', () => {
    // Le cas symétrique du précédent, et le plus exposé depuis que le chemin
    // d'apparition contient un calcul qui dépend du joueur (l'écartement des
    // figures de bord) : à arène égale, deux joueurs placés ailleurs ne
    // doivent pas non plus diverger. Même témoin indirect — la séquence des
    // types puise dans le même flux de tirages.
    const worldAt = (px: number, py: number) => {
      const w = setupAt(px, py, ARENA.width, ARENA.height, 12)
      w.wave = 6
      runFor(w, 60_000)
      return w
    }
    const typesOf = (w: SimWorld) =>
      w.events
        .filter((e) => e.type === 'enemySpawned')
        .map((e) => (e.type === 'enemySpawned' ? Enemy.type[e.eid] : undefined))

    const centre = typesOf(worldAt(ARENA.width / 2, ARENA.height / 2))
    expect(centre.length).toBeGreaterThan(0)
    for (const [px, py] of PLAYER_SPOTS) {
      expect(typesOf(worldAt(px, py)), `joueur en (${px}, ${py})`).toEqual(centre)
    }
  })
})

describe('les ennemis apparaissent dans l’arène', () => {
  it('ne fait jamais naître un ennemi à cheval sur une bordure', () => {
    // Le DISQUE entier, pas seulement le centre : un centre posé pile sur la
    // bordure laisse le masque de découpe (render/stage.ts) en rogner la
    // moitié — pendant le contour pointillé compris, c'est-à-dire pendant la
    // seule image qui annonce « pas encore mortel ».
    //
    // Dérivé d'ARENA, jamais recopié : un futur changement de taille d'arène
    // doit continuer d'être couvert. Le joueur ne reste pas au centre : les
    // recalages de bord ne mordent que lorsqu'on les sollicite depuis
    // plusieurs endroits de l'arène.
    let checked = 0
    for (const [px, py] of PLAYER_SPOTS) {
      for (let seed = 1; seed <= 6; seed++) {
        const w = setupAt(px, py, ARENA.width, ARENA.height, seed)
        w.wave = 8
        runFor(w, 3000 * FIXED_DT)
        for (const eid of enemies(w)) {
          const r = Collider.radius[eid]!
          expect(r).toBeGreaterThan(0)
          const x = Position.x[eid]!
          const y = Position.y[eid]!
          checked += 1
          const where = `graine ${seed}, ennemi en (${x.toFixed(1)}, ${y.toFixed(1)})`
          expect(x - r, where).toBeGreaterThanOrEqual(-0.001)
          expect(x + r, where).toBeLessThanOrEqual(ARENA.width + 0.001)
          expect(y - r, where).toBeGreaterThanOrEqual(-0.001)
          expect(y + r, where).toBeLessThanOrEqual(ARENA.height + 0.001)
        }
      }
    }
    // Sans cette assertion le test passerait aussi si aucun ennemi n'était né.
    expect(checked).toBeGreaterThan(0)
  })

  it('ne fait jamais naître un ennemi isolé trop près du joueur, où qu’il se tienne', () => {
    // Le joueur ne reste PAS au centre : c'est par là que ce test passait par
    // vacuité — à (640, 360) les apparitions de bord tombent à 346 px et plus,
    // l'écartement n'était jamais sollicité en 3000 pas.
    //
    // « Isolé » = tout ce qui n'appartient pas à une figure traversante :
    // ruissellement, embuscades, figures enveloppantes. Pour eux la garantie
    // est absolue. Les figures traversantes ont la leur, plus bas : leur
    // envergure peut rendre 180 px géométriquement inatteignable.
    let checked = 0
    for (const [px, py] of PLAYER_SPOTS) {
      for (let seed = 1; seed <= 4; seed++) {
        const w = setupAt(px, py, ARENA.width, ARENA.height, seed)
        // Moins de 80 s : on reste sous la vague 3, donc sans Éclat — le seul
        // type qui garde le placement de groupe sans le composant `Formation`,
        // et qu'on prendrait donc à tort pour un ennemi isolé.
        runFor(w, 60_000)
        for (const eid of enemies(w)) {
          // Seuls les ennemis encore en apparition sont contrôlés : une fois
          // matérialisés ils se déplacent vers le joueur, et se retrouver près
          // de lui est alors le jeu normal.
          if (!hasComponent(w, Materializing, eid) || hasComponent(w, Formation, eid)) {
            continue
          }
          checked += 1
          const distance = Math.hypot(Position.x[eid]! - px, Position.y[eid]! - py)
          expect(
            distance,
            `joueur en (${px}, ${py}), graine ${seed} : ennemi isolé à ${distance.toFixed(0)} px`,
          ).toBeGreaterThanOrEqual(AMBUSH_MIN_DISTANCE - 0.001)
        }
      }
    }
    // Sans cette assertion le test passerait aussi si rien n'était né.
    expect(checked).toBeGreaterThan(0)
  })

  it('écarte une figure traversante en glissant, mesuré sur ses membres', () => {
    // La garde ne portait que sur l'ORIGINE de la figure. Or `crossingLayout`
    // remplit exprès toute l'étendue perpendiculaire : écarter l'origine de
    // 180 px sur un axe où la figure s'étale de ±360 px ne garantit rien.
    let batches = 0
    const kinds = new Set<number>()
    for (const [px, py] of PLAYER_SPOTS) {
      for (let seed = 1; seed <= 4; seed++) {
        const w = setupAt(px, py, ARENA.width, ARENA.height, seed)
        runFor(w, 60_000)
        for (const batch of crossingBatches(w)) {
          batches += 1
          kinds.add(batch.kind)
          expectClearedOrBestPossible(
            w,
            batch,
            `joueur en (${px}, ${py}), graine ${seed}, ${FORMATION_KINDS[batch.kind]}`,
          )
        }
      }
    }
    expect(batches).toBeGreaterThan(0)
    // La Ligne seule ne suffit pas : le V et la Spirale traînent des membres
    // derrière leur origine, ce sont eux que le bornage déplaçait le plus.
    for (const kind of ['line', 'vee', 'spiral'] as const) {
      expect(kinds, `aucune figure « ${kind} » dans l'échantillon`).toContain(
        FORMATION_KINDS.indexOf(kind),
      )
    }
  })

  it('fait glisser la figure le long du bord quand le joueur est collé à sa paroi d’entrée', () => {
    // Le cas que les deux tests précédents ne couvraient pas, et le seul où le
    // glissement est réellement sollicité : la figure entre par la paroi même
    // contre laquelle le joueur est plaqué. Elle n'a alors qu'un seul degré de
    // liberté — glisser le long de ce bord.
    const walls = [
      { spot: [20, ARENA.height / 2] as const, dirX: 1, dirY: 0 },
      { spot: [ARENA.width - 20, ARENA.height / 2] as const, dirX: -1, dirY: 0 },
      { spot: [ARENA.width / 2, 20] as const, dirX: 0, dirY: 1 },
      { spot: [ARENA.width / 2, ARENA.height - 20] as const, dirX: 0, dirY: -1 },
      // Aussi le long du bord, pas seulement en son milieu : c'est près d'un
      // coin que le glissement a le plus de place, et donc le plus d'effet.
      { spot: [20, 120] as const, dirX: 1, dirY: 0 },
      { spot: [ARENA.width - 20, ARENA.height - 120] as const, dirX: -1, dirY: 0 },
      { spot: [220, 20] as const, dirX: 0, dirY: 1 },
    ]

    let batches = 0
    for (const wall of walls) {
      for (let seed = 1; seed <= 8; seed++) {
        const w = setupAt(wall.spot[0], wall.spot[1], ARENA.width, ARENA.height, seed)
        runFor(w, 60_000)
        for (const batch of crossingBatches(w)) {
          // Uniquement les figures entrant par la paroi du joueur.
          if (batch.dirX !== wall.dirX || batch.dirY !== wall.dirY) {
            continue
          }
          batches += 1
          expectClearedOrBestPossible(
            w,
            batch,
            `joueur collé en (${wall.spot[0]}, ${wall.spot[1]}), graine ${seed}, ${FORMATION_KINDS[batch.kind]}`,
          )
        }
      }
    }
    // Sans cette assertion le test passerait aussi si aucune figure n'était
    // jamais entrée par la paroi du joueur — la seule qui l'intéresse.
    expect(batches).toBeGreaterThan(0)
  })
})
