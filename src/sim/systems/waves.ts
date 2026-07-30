import { addComponent, defineQuery, removeComponent } from 'bitecs'

import { Enemy, Formation, Homing, Invulnerable, Movement, Position } from '../components'
import {
  ambushChance,
  enemyMaxSpeed,
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
  FORMATION_CHOREO,
  FORMATION_EDGE_MARGIN,
  FORMATION_INWARD_PUSH,
  FORMATION_KINDS,
  formationBaseRotation,
  formationOffsets,
} from '../data/formations'
import { spawnEnemy } from '../spawn'
import { FIXED_DT, type SimWorld } from '../world'

const enemies = defineQuery([Enemy])
const timers = new WeakMap<SimWorld, number>()

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
 * Origine hors-écran d'une formation de bord, avec la direction qui l'amène
 * vers l'intérieur de l'arène. Le nombre de tirages (1 pour le bord, 1 pour la
 * position le long de ce bord) est inchangé par l'ajout de `dirX/dirY` :
 * la direction se déduit du bord tiré, sans tirage supplémentaire.
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
 * tirages** quelle que soit la géométrie ET quel que soit `count`.
 *
 * La version initiale échantillonnait par rejet, jusqu'à douze essais, puis
 * retombait sur une apparition depuis le bord. Deux défauts :
 *   - le nombre de tirages du PRNG dépendait de la position du joueur et de la
 *     taille de l'arène, donc deux simulations censées être identiques
 *     divergeaient — or le déterminisme est le prérequis du netcode v3 ;
 *   - le repli violait les deux garanties annoncées (dans l'arène, à au moins
 *     AMBUSH_MIN_DISTANCE du joueur), dans ~3-4% des cas près des coins,
 *     c'est-à-dire précisément là où le joueur se fait piéger en fin de partie.
 *
 * Le miroir remplace le rejet : refléter un décalage sur un axe conserve
 * exactement sa distance au joueur, tout en ramenant le point du bon côté.
 * Cette réflexion est de l'arithmétique pure — aucun tirage supplémentaire —
 * donc l'étendre à plusieurs points (un par angle du cercle, tous à la même
 * distance tirée une seule fois) préserve le nombre de tirages fixe : c'est ce
 * qui permet de faire apparaître un **groupe** en embuscade (voir le rapport
 * de tâche : un ennemi unique par embuscade la rendait statistiquement
 * invisible, noyée dans les formations de bord bien plus nombreuses) sans
 * réintroduire la dépendance à la géométrie que le miroir a justement corrigée.
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

function typeOf(eid: number): EnemyType {
  const id = Enemy.type[eid] ?? 0
  return (['point', 'shard', 'blot'] as const)[id] ?? 'point'
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
    addComponent(world, Invulnerable, world.playerEid)
    Invulnerable.remaining[world.playerEid] = WAVE_START_INVULN_MS
    world.events.push({ type: 'waveStarted', wave: world.wave })
    return world
  }

  const maxSpeed = enemyMaxSpeed(elapsedSec)
  // La courbe de vitesse s'applique aussi aux ennemis déjà en jeu.
  for (const eid of enemies(world)) {
    Movement.maxSpeed[eid] = maxSpeed * ENEMIES[typeOf(eid)].speedFactor
  }

  let timer = (timers.get(world) ?? spawnInterval(elapsedSec) * 1000) - dt
  if (timer > 0) {
    timers.set(world, timer)
    return world
  }
  timer = spawnInterval(elapsedSec) * 1000
  timers.set(world, timer)

  const alive = enemies(world).length
  if (alive >= MAX_ENEMIES) {
    return world
  }

  const isAmbush = world.wave >= 2 && world.rng.next() < ambushChance(elapsedSec)
  const type = pickType(world)
  const budget = Math.min(formationSize(elapsedSec), MAX_ENEMIES - alive)

  if (isAmbush) {
    // Même effectif qu'une formation de bord (`budget`), pas un ennemi unique :
    // sinon la part d'ennemis qui apparaissent près du joueur reste de l'ordre
    // de 1-4% même à 35% de chance d'embuscade, noyée dans les formations de
    // bord bien plus peuplées (voir le rapport de tâche). À effectif égal,
    // cette part rejoint directement `ambushChance` — l'intention du design.
    for (const point of ambushPoints(world, budget)) {
      spawnEnemy(world, {
        type,
        x: point.x,
        y: point.y,
        materializeMs: MATERIALIZE_AMBUSH_MS,
      })
    }
    return world
  }

  const origin = edgeOrigin(world)
  const kind = world.rng.pick(FORMATION_KINDS)
  const offsets = formationOffsets(kind, budget, 34)

  // L'Éclat garde sa propre machine à états (approche → télégraphe → charge en
  // ligne droite, shardSystem) : lui imposer une chorégraphie externe voudrait
  // dire arbitrer, image par image, laquelle des deux commande sa vélocité —
  // exactement le genre de conflit que ce système existe pour éviter (voir
  // hazards.ts pour le même choix face au Buvard). Un Éclat garde donc le
  // positionnement de groupe (les offsets de la figure, pour l'effet visuel de
  // groupe à l'apparition) mais poursuit immédiatement, comme avant cette tâche.
  if (type === 'shard') {
    for (const offset of offsets) {
      spawnEnemy(world, {
        type,
        x: origin.x + offset.x,
        y: origin.y + offset.y,
        materializeMs: MATERIALIZE_EDGE_MS,
      })
    }
    return world
  }

  const cfg = FORMATION_CHOREO[kind]
  // Les figures immobiles (carré, cercle) sont reculées vers l'intérieur :
  // sans cela elles resteraient à cheval sur le bord d'apparition, jamais
  // vraiment visibles puisqu'elles ne se déplacent pas comme un bloc.
  const inward = cfg.travelSpeed === 0 ? FORMATION_INWARD_PUSH : 0
  const originX = origin.x + origin.dirX * inward
  const originY = origin.y + origin.dirY * inward
  const rotationOffset = formationBaseRotation(origin.dirX, origin.dirY)
  const durationMs =
    cfg.travelSpeed > 0
      ? crossingDurationMs(world.arena.width, world.arena.height, origin.dirX, cfg.travelSpeed)
      : cfg.holdMs

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
      x: originX + rx,
      y: originY + ry,
      materializeMs: MATERIALIZE_EDGE_MS,
    })

    // La poursuite reprendra à la dislocation (formationSystem) : pendant la
    // chorégraphie, c'est la figure qui gouverne la vélocité, pas homingSystem.
    removeComponent(world, Homing, eid)
    addComponent(world, Formation, eid)
    Formation.kind[eid] = kindIndex
    Formation.offsetX[eid] = offset.x
    Formation.offsetY[eid] = offset.y
    Formation.originX[eid] = originX
    Formation.originY[eid] = originY
    Formation.dirX[eid] = origin.dirX
    Formation.dirY[eid] = origin.dirY
    Formation.travelSpeed[eid] = cfg.travelSpeed
    Formation.rotationOffset[eid] = rotationOffset
    Formation.durationMs[eid] = durationMs
    Formation.elapsed[eid] = 0
  }

  return world
}
