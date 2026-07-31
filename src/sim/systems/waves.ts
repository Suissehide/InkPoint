import { addComponent, defineQuery, hasComponent, removeComponent } from 'bitecs'

import { Enemy, Formation, Homing, Invulnerable, Movement, Position } from '../components'
import {
  ambushChance,
  enemyMaxSpeed,
  formationInterval,
  formationSize,
  MAX_ENEMIES,
  spawnInterval,
  WAVE_DURATION_MS,
  WAVE_START_INVULN_MS,
} from '../data/difficulty'
import {
  AMBUSH_MIN_DISTANCE,
  ENEMIES,
  ENEMY_TYPES,
  type EnemyType,
  MATERIALIZE_AMBUSH_MS,
  MATERIALIZE_EDGE_MS,
} from '../data/enemies'
import {
  crossingDurationMs,
  enclosingOffsets,
  FORMATION_CHOREO,
  FORMATION_EDGE_MARGIN,
  FORMATION_KINDS,
  type FormationKind,
  formationBaseRotation,
  formationOffsets,
  type Offset,
} from '../data/formations'
import { spawnEnemy } from '../spawn'
import { FIXED_DT, type SimWorld } from '../world'

const enemies = defineQuery([Enemy])
// Deux minuteurs indépendants (spec pacing-pass §1) : le ruissellement est
// bien plus fréquent que les formations, chacun a besoin de son propre rythme.
const trickleTimers = new WeakMap<SimWorld, number>()
const formationTimers = new WeakMap<SimWorld, number>()

function pickType(world: SimWorld): EnemyType {
  const available = ENEMY_TYPES.filter((t) => ENEMIES[t].unlockWave <= world.wave)
  const total = available.reduce((sum, t) => sum + ENEMIES[t].weight, 0)
  let roll = world.rng.next() * total
  for (const t of available) {
    roll -= ENEMIES[t].weight
    if (roll <= 0) {
      return t
    }
  }
  return 'point'
}

/**
 * Origine hors-écran d'un ennemi ou d'une formation de bord, avec la
 * direction qui l'amène vers l'intérieur. Deux tirages (bord, position sur ce
 * bord) : `dirX/dirY` se déduit du bord tiré, sans tirage supplémentaire.
 */
function edgeOrigin(world: SimWorld): { x: number; y: number; dirX: number; dirY: number } {
  const { width, height } = world.arena
  const m = FORMATION_EDGE_MARGIN
  switch (world.rng.int(4)) {
    case 0:
      return { x: -m, y: world.rng.range(0, height), dirX: 1, dirY: 0 }
    case 1:
      return { x: width + m, y: world.rng.range(0, height), dirX: -1, dirY: 0 }
    case 2:
      return { x: world.rng.range(0, width), y: -m, dirX: 0, dirY: 1 }
    default:
      return { x: world.rng.range(0, width), y: height + m, dirX: 0, dirY: -1 }
  }
}

const AMBUSH_MARGIN = 20

/**
 * Points d'une embuscade, en cercle autour du joueur, en **exactement deux
 * tirages** quelle que soit la géométrie ET quel que soit `count` : le
 * nombre de tirages ne doit jamais dépendre de la position du joueur ou de
 * la taille de l'arène (déterminisme, prérequis du netcode v3). Le miroir —
 * refléter un décalage sur un axe — ramène un point dans l'arène sans tirage
 * supplémentaire et sans changer sa distance au joueur.
 */
function ambushPoints(world: SimWorld, count: number): { x: number; y: number }[] {
  const px = Position.x[world.playerEid]!
  const py = Position.y[world.playerEid]!
  const { width, height } = world.arena

  const baseAngle = world.rng.range(0, Math.PI * 2)
  const dist = world.rng.range(AMBUSH_MIN_DISTANCE, AMBUSH_MIN_DISTANCE + 140)

  const points: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i / count) * Math.PI * 2
    let x = px + Math.cos(angle) * dist
    let y = py + Math.sin(angle) * dist

    if (x < AMBUSH_MARGIN || x > width - AMBUSH_MARGIN) {
      x = px - Math.cos(angle) * dist
    }
    if (y < AMBUSH_MARGIN || y > height - AMBUSH_MARGIN) {
      y = py - Math.sin(angle) * dist
    }

    // Arène plus étroite que la distance minimale : on serre dans les bornes et
    // la distance peut alors être inférieure au minimum. C'est une fenêtre
    // dégénérée, pas une situation de jeu — mais mieux vaut un ennemi trop
    // proche qu'un ennemi hors écran, invisible et donc parfaitement injuste.
    points.push({
      x: Math.min(width - AMBUSH_MARGIN, Math.max(AMBUSH_MARGIN, x)),
      y: Math.min(height - AMBUSH_MARGIN, Math.max(AMBUSH_MARGIN, y)),
    })
  }
  return points
}

/**
 * Reflète un motif de décalages (autour de 0,0) pour que chaque point, une
 * fois posé sur le joueur, reste dans l'arène — même principe que
 * `ambushPoints`, généralisé à un motif quelconque. Zéro tirage : la
 * réflexion conserve exactement la distance au joueur (`|-x| = |x|`).
 */
function mirrorOffsetsAroundPlayer(world: SimWorld, offsets: readonly Offset[]): Offset[] {
  const px = Position.x[world.playerEid]!
  const py = Position.y[world.playerEid]!
  const { width, height } = world.arena

  return offsets.map((o) => {
    let x = px + o.x
    let y = py + o.y

    if (x < AMBUSH_MARGIN || x > width - AMBUSH_MARGIN) {
      x = px - o.x
    }
    if (y < AMBUSH_MARGIN || y > height - AMBUSH_MARGIN) {
      y = py - o.y
    }

    x = Math.min(width - AMBUSH_MARGIN, Math.max(AMBUSH_MARGIN, x))
    y = Math.min(height - AMBUSH_MARGIN, Math.max(AMBUSH_MARGIN, y))

    return { x: x - px, y: y - py }
  })
}

function typeOf(eid: number): EnemyType {
  const id = Enemy.type[eid] ?? 0
  return (['point', 'shard', 'blot'] as const)[id] ?? 'point'
}

/**
 * Fait avancer le minuteur donné et signale, sans tirage PRNG, s'il vient de
 * boucler — factorisé une fois pour les deux horloges indépendantes
 * (ruissellement, formations), qui partagent la même mécanique de rampe.
 */
function tick(
  timers: WeakMap<SimWorld, number>,
  world: SimWorld,
  dt: number,
  intervalMs: number,
): boolean {
  const timer = (timers.get(world) ?? intervalMs) - dt
  if (timer > 0) {
    timers.set(world, timer)
    return false
  }
  timers.set(world, intervalMs)
  return true
}

/** Le ruissellement : 1 à 3 ennemis isolés, la texture ordinaire du jeu (spec pacing-pass §1). */
function spawnTrickle(world: SimWorld, elapsedSec: number): void {
  const alive = enemies(world).length
  if (alive >= MAX_ENEMIES) {
    return
  }

  const count = Math.min(world.rng.int(3) + 1, MAX_ENEMIES - alive)
  // Aucun plancher de vague supplémentaire : `ambushChance` (difficulty.ts) est le seul frein.
  const isAmbush = world.rng.next() < ambushChance(elapsedSec)
  const type = pickType(world)

  if (isAmbush) {
    for (const point of ambushPoints(world, count)) {
      spawnEnemy(world, {
        type,
        x: point.x,
        y: point.y,
        materializeMs: MATERIALIZE_AMBUSH_MS,
      })
    }
    return
  }

  for (let i = 0; i < count; i++) {
    const origin = edgeOrigin(world)
    spawnEnemy(world, { type, x: origin.x, y: origin.y, materializeMs: MATERIALIZE_EDGE_MS })
  }
}

/**
 * Les figures enveloppantes (Cercle, Carré — spec pacing-pass v2
 * §Enveloppantes) : de grandes embuscades, mêmes garanties qu'une embuscade
 * individuelle. `originX/Y` reste le point du joueur au spawn, jamais
 * réactualisé — sinon la figure suivrait le joueur et deviendrait inéluctable.
 */
function spawnEnclosingFormation(
  world: SimWorld,
  type: EnemyType,
  kind: 'circle' | 'square',
  count: number,
): void {
  const px = Position.x[world.playerEid]!
  const py = Position.y[world.playerEid]!
  // Même plage que `ambushPoints` : ces figures sont de grandes embuscades,
  // même vocabulaire de distance (un seul tirage, fixe quel que soit `count`).
  const radius = world.rng.range(AMBUSH_MIN_DISTANCE, AMBUSH_MIN_DISTANCE + 140)
  const offsets = mirrorOffsetsAroundPlayer(world, enclosingOffsets(kind, count, radius))
  const kindIndex = FORMATION_KINDS.indexOf(kind)
  const cfg = FORMATION_CHOREO[kind]

  for (const offset of offsets) {
    const eid = spawnEnemy(world, {
      type,
      x: px + offset.x,
      y: py + offset.y,
      materializeMs: MATERIALIZE_AMBUSH_MS,
    })

    // La poursuite reprendra à la dislocation (formationSystem) : pendant la
    // chorégraphie, c'est la figure qui gouverne la vélocité, pas homingSystem.
    removeComponent(world, Homing, eid)
    addComponent(world, Formation, eid)
    Formation.kind[eid] = kindIndex
    Formation.offsetX[eid] = offset.x
    Formation.offsetY[eid] = offset.y
    Formation.originX[eid] = px
    Formation.originY[eid] = py
    Formation.dirX[eid] = 0
    Formation.dirY[eid] = 0
    Formation.travelSpeed[eid] = 0
    Formation.rotationOffset[eid] = 0
    Formation.durationMs[eid] = cfg.holdMs
    Formation.elapsed[eid] = 0
  }
}

/**
 * Les figures traversantes (Ligne, V, Spirale) : apparition en bord d'écran,
 * traversée de l'arène en formation, sursaut sur le joueur à la dislocation
 * (formationSystem).
 */
function spawnCrossingFormation(
  world: SimWorld,
  type: EnemyType,
  kind: FormationKind,
  count: number,
): void {
  const origin = edgeOrigin(world)
  const offsets = formationOffsets(kind, count, 34)

  // L'Éclat garde sa propre machine à états (shardSystem) : lui imposer une
  // chorégraphie externe forcerait à arbitrer laquelle des deux commande sa
  // vélocité (même choix que hazards.ts face au Buvard). Il garde le
  // positionnement de groupe mais poursuit immédiatement.
  if (type === 'shard') {
    for (const offset of offsets) {
      spawnEnemy(world, {
        type,
        x: origin.x + offset.x,
        y: origin.y + offset.y,
        materializeMs: MATERIALIZE_EDGE_MS,
      })
    }
    return
  }

  const cfg = FORMATION_CHOREO[kind]
  const rotationOffset = formationBaseRotation(origin.dirX, origin.dirY)
  const durationMs = crossingDurationMs(
    world.arena.width,
    world.arena.height,
    origin.dirX,
    cfg.travelSpeed,
  )

  const cos0 = Math.cos(rotationOffset)
  const sin0 = Math.sin(rotationOffset)
  const kindIndex = FORMATION_KINDS.indexOf(kind)

  for (const offset of offsets) {
    // Décalage tourné une première fois ici pour le spawn, avec exactement la
    // même formule (rotationOffset, pas de resserrement au temps 0) que
    // `formationSystem` au tout premier pas — sinon la formation « sauterait »
    // visiblement dès sa première image active.
    const rx = offset.x * cos0 - offset.y * sin0
    const ry = offset.x * sin0 + offset.y * cos0
    const eid = spawnEnemy(world, {
      type,
      x: origin.x + rx,
      y: origin.y + ry,
      materializeMs: MATERIALIZE_EDGE_MS,
    })

    removeComponent(world, Homing, eid)
    addComponent(world, Formation, eid)
    Formation.kind[eid] = kindIndex
    Formation.offsetX[eid] = offset.x
    Formation.offsetY[eid] = offset.y
    Formation.originX[eid] = origin.x
    Formation.originY[eid] = origin.y
    Formation.dirX[eid] = origin.dirX
    Formation.dirY[eid] = origin.dirY
    Formation.travelSpeed[eid] = cfg.travelSpeed
    Formation.rotationOffset[eid] = rotationOffset
    Formation.durationMs[eid] = durationMs
    Formation.elapsed[eid] = 0
  }
}

/**
 * Le set-piece : une formation, sur son propre minuteur (spec pacing-pass §1),
 * bien plus lent que le ruissellement. Cercle et Carré encerclent désormais le
 * joueur (§Enveloppantes) ; Ligne, V et Spirale continuent de traverser l'arène
 * depuis un bord (§Traversantes).
 */
function spawnFormation(world: SimWorld, elapsedSec: number): void {
  const alive = enemies(world).length
  if (alive >= MAX_ENEMIES) {
    return
  }

  const type = pickType(world)
  const kind = world.rng.pick(FORMATION_KINDS)
  const budget = Math.min(formationSize(elapsedSec), MAX_ENEMIES - alive)

  // L'Éclat garde son propre opt-out (voir spawnCrossingFormation) quelle que
  // soit la figure tirée : une figure enveloppante autour du joueur n'a de
  // sens que pour des ennemis qui restent en formation jusqu'à dislocation.
  if ((kind === 'circle' || kind === 'square') && type !== 'shard') {
    spawnEnclosingFormation(world, type, kind, budget)
    return
  }

  spawnCrossingFormation(world, type, kind, budget)
}

/**
 * Fait apparaître les ennemis, avance la vague et boucle sur la vague suivante
 * une fois le délai écoulé (spec §3.1) : la vague se termine sur un minuteur,
 * pas quand l'arène est vidée — le joueur n'ayant pas d'arme permanente, exiger
 * une arène vide rendrait la partie potentiellement ingagnable.
 */
export function waveSystem(world: SimWorld): SimWorld {
  if (!world.alive || world.playerEid < 0) {
    return world
  }

  const dt = FIXED_DT * world.timeScale
  const elapsedSec = world.time / 1000

  world.waveElapsed += dt
  if (world.waveElapsed >= WAVE_DURATION_MS) {
    world.waveElapsed = 0
    world.events.push({ type: 'waveEnded', wave: world.wave })
    world.wave += 1
    // Grâce de début de vague : la formation qui vient d'apparaître ne doit
    // pas pouvoir tuer le joueur avant qu'il n'ait repris la main (spec §3.7).
    // Toujours `Math.max`, jamais une écriture sèche : `collision.ts` (1000 ms
    // à la rupture du Halo) et `player-movement.ts` (200 ms à l'atterrissage
    // d'une ruée) posent aussi ce champ ; écraser sans condition raccourcirait une protection plus longue.
    const grace = hasComponent(world, Invulnerable, world.playerEid)
      ? Math.max(Invulnerable.remaining[world.playerEid]!, WAVE_START_INVULN_MS)
      : WAVE_START_INVULN_MS
    addComponent(world, Invulnerable, world.playerEid)
    Invulnerable.remaining[world.playerEid] = grace
    world.events.push({ type: 'waveStarted', wave: world.wave })
    return world
  }

  const maxSpeed = enemyMaxSpeed(elapsedSec)
  // La courbe de vitesse s'applique aussi aux ennemis déjà en jeu.
  for (const eid of enemies(world)) {
    Movement.maxSpeed[eid] = maxSpeed * ENEMIES[typeOf(eid)].speedFactor
  }

  if (tick(trickleTimers, world, dt, spawnInterval(elapsedSec) * 1000)) {
    spawnTrickle(world, elapsedSec)
  }
  if (tick(formationTimers, world, dt, formationInterval(elapsedSec) * 1000)) {
    spawnFormation(world, elapsedSec)
  }

  return world
}
