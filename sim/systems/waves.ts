import { addComponent, defineQuery, removeComponent } from 'bitecs'

import { Enemy, Formation, Homing, Movement, Position } from '../components'
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
  MAX_ENEMY_RADIUS,
} from '../data/enemies'
import {
  crossingDurationMs,
  crossingLayout,
  enclosingOffsets,
  FORMATION_CHOREO,
  FORMATION_EDGE_MARGIN,
  FORMATION_KINDS,
  type FormationKind,
  formationBaseRotation,
  formationOffsets,
  type Offset,
} from '../data/formations'
import { grantInvulnerability } from '../invulnerability'
import { cos, PI, sin } from '../math'
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
 * Origine TIRÉE d'une apparition de bord, avec la direction qui l'amène vers
 * l'intérieur. Deux tirages (bord, position uniforme le long de ce bord) :
 * `dirX/dirY` se déduit du bord tiré, sans tirage supplémentaire.
 *
 * Ce point est brut : ni borné à l'arène, ni écarté du joueur. C'est
 * `placeEdgeOrigin` qui s'en charge, une fois le motif de la figure connu —
 * voir là-bas pourquoi cet ordre est le seul qui tienne.
 */
function edgeOrigin(world: SimWorld): { x: number; y: number; dirX: number; dirY: number } {
  const { width, height } = world.arena
  const m = FORMATION_EDGE_MARGIN
  switch (world.rng.int(4)) {
    case 0:
      return { x: m, y: world.rng.range(0, height), dirX: 1, dirY: 0 }
    case 1:
      return { x: width - m, y: world.rng.range(0, height), dirX: -1, dirY: 0 }
    case 2:
      return { x: world.rng.range(0, width), y: m, dirX: 0, dirY: 1 }
    default:
      return { x: world.rng.range(0, width), y: height - m, dirX: 0, dirY: -1 }
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

  const baseAngle = world.rng.range(0, PI * 2)
  const dist = world.rng.range(AMBUSH_MIN_DISTANCE, AMBUSH_MIN_DISTANCE + 140)

  const points: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i / count) * PI * 2
    let x = px + cos(angle) * dist
    let y = py + sin(angle) * dist

    if (x < AMBUSH_MARGIN || x > width - AMBUSH_MARGIN) {
      x = px - cos(angle) * dist
    }
    if (y < AMBUSH_MARGIN || y > height - AMBUSH_MARGIN) {
      y = py - sin(angle) * dist
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
    const origin = placeEdgeOrigin(world, edgeOrigin(world), SOLO_PATTERN)
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

/** Intervalle des origines admissibles sur un axe (voir `fitBounds`). */
interface FitBounds {
  lo: number
  hi: number
}

/**
 * Origines qui laissent le motif entier dans l'arène sur un axe donné — les
 * DEUX axes sont bornés, pas seulement celui perpendiculaire à la marche : le
 * V et la Spirale traînent aussi des membres *derrière* leur origine, le long
 * de l'axe de marche lui-même (leurs ailes, ou les premiers tours de la
 * spirale), et avec une marge d'apparition désormais intérieure
 * (`FORMATION_EDGE_MARGIN`, seulement le rayon d'un ennemi) cette traîne
 * suffit à ressortir de l'arène si on ne la borne pas.
 *
 * Retrait de `MAX_ENEMY_RADIUS` et non de zéro : à zéro, c'est le *centre* du
 * membre extrême qui tombe sur la bordure, et le masque de découpe du rendu
 * (render/stage.ts) en rogne la moitié — pendant son contour pointillé
 * compris, c'est-à-dire pendant la seule image qui annonce « pas encore
 * mortel ».
 *
 * LIMITE CONNUE, à ne pas confondre avec une garantie. Borner les deux axes ne
 * suffit à contenir la figure que si l'intervalle rendu ici est non vide sur
 * chacun d'eux, et une seule des deux dimensions du motif est bornée en amont :
 * `crossingLayout` resserre l'envergure PERPENDICULAIRE à la marche, rien ne
 * borne la PROFONDEUR le long de la marche. Au-delà d'une trentaine de membres
 * la traîne d'une Spirale dépasse la dimension d'arène qu'elle longe,
 * l'intervalle devient vide (`lo > hi`), et `clampToBounds` ne peut plus que
 * choisir de quel côté déborder. Mesuré : rien avant 6 min de jeu, une
 * centaine de pixels à 7 min, jusqu'à ~590 px dehors à 15 min. Le test de
 * bordure ne couvre que les 50 premières secondes : cette portion-là n'est pas
 * gardée, seulement documentée. Pré-existant, non corrigé ici — le borner
 * demanderait de resserrer aussi la profondeur, donc de retoucher la forme des
 * figures et leur équilibrage.
 */
function fitBounds(rotated: readonly Offset[], axis: 'x' | 'y', span: number): FitBounds {
  // L'origine (0,0) compte dans les bornes : les figures ne sont pas toutes
  // centrées sur elle (la Spirale s'enroule d'un seul côté).
  let min = 0
  let max = 0
  for (const offset of rotated) {
    const value = axis === 'x' ? offset.x : offset.y
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  const r = MAX_ENEMY_RADIUS
  return { lo: r - min, hi: span - r - max }
}

/**
 * `Math.max` appliqué en dernier : quand l'intervalle est vide (`lo > hi`,
 * motif plus long que l'arène sur cet axe — voir la limite connue de
 * `fitBounds`), mieux vaut déborder d'un seul côté que des deux.
 */
function clampToBounds(bounds: FitBounds, value: number): number {
  return Math.max(bounds.lo, Math.min(bounds.hi, value))
}

/**
 * Distance² d'un membre au joueur, vue comme une fonction de la coordonnée qui
 * glisse : `(c - vertex)² + floor`. `floor` est le carré de son écart sur
 * l'axe figé, que le glissement ne change pas.
 */
interface MemberArc {
  vertex: number
  floor: number
}

/**
 * Coordonnée de `[from, to]` qui éloigne le plus le membre le plus proche.
 *
 * `c ↦ min_i distance_i(c)` est un MINIMUM de fonctions convexes : elle n'est
 * ni convexe ni concave, et son maximum sur un intervalle peut parfaitement
 * tomber à l'intérieur. Ne regarder que les bornes et les sorties de la garde
 * — ce que faisait la première version — laissait jusqu'à 86 px de dégagement
 * sur la table, et posait un ennemi à 8 px du joueur là où une position légale
 * à 94 px existait.
 *
 * Toutes ces paraboles ont la MÊME courbure : leurs différences sont des
 * droites, deux d'entre elles ne se croisent donc qu'une fois, et les morceaux
 * de leur enveloppe inférieure se succèdent dans l'ordre des sommets. C'est la
 * construction classique de la transformée de distance : un tri, puis un
 * balayage à pile. Chaque morceau étant convexe, le maximum de l'enveloppe ne
 * peut se trouver qu'à une borne ou à un croisement — il suffit de les
 * énumérer. O(n log n), sans tirage, sur une vingtaine de membres.
 */
function farthestFromPlayer(arcs: readonly MemberArc[], from: number, to: number): number {
  // Tri par sommet, doublons écartés : deux paraboles de même sommet ne se
  // croisent jamais, la plus haute est dominée partout (et leur croisement se
  // calculerait par une division par zéro).
  const sorted = [...arcs].sort((a, b) =>
    a.vertex === b.vertex ? a.floor - b.floor : a.vertex - b.vertex,
  )
  const distinct: MemberArc[] = []
  for (const arc of sorted) {
    if (distinct[distinct.length - 1]?.vertex !== arc.vertex) {
      distinct.push(arc)
    }
  }

  const valueAt = (arc: MemberArc, c: number): number => (c - arc.vertex) ** 2 + arc.floor

  // Enveloppe inférieure : la pile des paraboles qui affleurent, et l'abscisse
  // à laquelle chacune prend la main sur la précédente.
  const hull: MemberArc[] = []
  const takesOver: number[] = []
  for (const arc of distinct) {
    let start = Number.NEGATIVE_INFINITY
    while (hull.length > 0) {
      const last = hull[hull.length - 1]!
      start =
        (arc.floor + arc.vertex ** 2 - last.floor - last.vertex ** 2) /
        (2 * (arc.vertex - last.vertex))
      if (start > takesOver[takesOver.length - 1]!) {
        break
      }
      // La précédente n'affleure plus nulle part : elle sort de l'enveloppe.
      hull.pop()
      takesOver.pop()
    }
    hull.push(arc)
    takesOver.push(hull.length === 1 ? Number.NEGATIVE_INFINITY : start)
  }

  const envelopeAt = (c: number): number => {
    let lowest = Number.POSITIVE_INFINITY
    for (const arc of distinct) {
      lowest = Math.min(lowest, valueAt(arc, c))
    }
    return lowest
  }

  let best = from
  let bestValue = envelopeAt(from)
  const consider = (c: number, value: number): void => {
    if (value > bestValue) {
      best = c
      bestValue = value
    }
  }
  consider(to, envelopeAt(to))
  for (let i = 1; i < hull.length; i++) {
    const crossing = takesOver[i]!
    if (crossing > from && crossing < to) {
      consider(crossing, valueAt(hull[i]!, crossing))
    }
  }
  return best
}

/**
 * Fait glisser une apparition de bord LE LONG de son bord jusqu'à ce que son
 * membre le plus proche dégage `AMBUSH_MIN_DISTANCE` du joueur, et renvoie la
 * coordonnée glissée.
 *
 * Trois points qui ne vont pas de soi, dont deux ont déjà été manqués ici :
 *
 * 1. Le calcul porte sur les MEMBRES, jamais sur la seule origine.
 *    `crossingLayout` remplit exprès toute l'étendue perpendiculaire à la
 *    marche : écarter l'origine de 180 px sur un axe où la figure s'étale de
 *    ±360 px ne garantit rigoureusement rien.
 * 2. Il vient APRÈS le bornage d'envergure, et se reborne dans le même
 *    intervalle. Appliqué avant, le bornage l'annulait purement et simplement
 *    — dernier écrivain gagnant — et la garde était inerte.
 * 3. Zéro tirage : le glissement se déduit par arithmétique du motif déjà
 *    tourné. Le nombre de tirages ne dépend donc ni de la position du joueur
 *    ni de la taille de l'arène (déterminisme, prérequis du netcode v3).
 *
 * Ce qui cède quand les deux exigences s'opposent : l'écartement, jamais
 * l'envergure. Une figure qui barre toute l'étendue de son bord d'entrée — neuf
 * membres y suffisent — ne peut plus dégager 180 px d'un joueur collé à cette
 * paroi : aucune position le long du bord ne le permet, ce n'est pas un défaut
 * de calcul mais une impossibilité géométrique. On garde alors la figure
 * entière dans l'arène (un membre né hors du masque tue sans s'être annoncé,
 * c'est pire) et on prend le dégagement maximal admissible — le maximum exact,
 * pas le meilleur de deux ou trois candidats, voir `farthestFromPlayer`.
 * L'écartement complet, lui, reste garanti partout ailleurs : ruissellement,
 * embuscades, figures enveloppantes, et toute figure traversante qui laisse
 * assez de bord libre.
 */
function slideFromPlayer(
  world: SimWorld,
  fitted: { x: number; y: number },
  rotated: readonly Offset[],
  axis: 'x' | 'y',
  bounds: FitBounds,
): number {
  const along = axis === 'x' ? fitted.x : fitted.y
  if (bounds.hi <= bounds.lo) {
    // Figure aussi large que l'arène : une seule position admissible, déjà tenue.
    return along
  }

  // Pas de garde sur `playerEid` : `waveSystem` sort déjà quand il est
  // négatif, comme pour `ambushPoints` et `spawnEnclosingFormation`.
  const px = Position.x[world.playerEid]!
  const py = Position.y[world.playerEid]!
  const alongPlayer = axis === 'x' ? px : py
  const acrossPlayer = axis === 'x' ? py : px
  const acrossOrigin = axis === 'x' ? fitted.y : fitted.x
  const gapSq = AMBUSH_MIN_DISTANCE * AMBUSH_MIN_DISTANCE

  const arcs: MemberArc[] = rotated.map((offset) => {
    const across = acrossOrigin + (axis === 'x' ? offset.y : offset.x) - acrossPlayer
    return {
      vertex: alongPlayer - (axis === 'x' ? offset.x : offset.y),
      floor: across * across,
    }
  })

  // Chaque membre encore à portée interdit un intervalle de coordonnées. Sur
  // l'axe figé sa distance ne bougera plus : s'il y dégage déjà la garde,
  // aucun glissement ne peut le rapprocher, il ne contraint rien.
  const forbidden: { from: number; to: number }[] = []
  for (const arc of arcs) {
    if (arc.floor >= gapSq) {
      continue
    }
    const reach = Math.sqrt(gapSq - arc.floor)
    forbidden.push({ from: arc.vertex - reach, to: arc.vertex + reach })
  }

  // Composante connexe de cette union qui contient la position actuelle : ses
  // deux bords sont les deux plus petits glissements qui dégagent TOUS les
  // membres à la fois. Union d'intervalles ouverts, donc un bord de composante
  // n'appartient à aucun d'eux — c'est bien une sortie.
  let left = along
  let right = along
  for (let expanding = true; expanding; ) {
    expanding = false
    for (const { from, to } of forbidden) {
      if (from < right && to > left) {
        if (from < left) {
          left = from
          expanding = true
        }
        if (to > right) {
          right = to
          expanding = true
        }
      }
    }
  }
  if (left === along && right === along) {
    // Aucun membre à portée : la figure reste là où le tirage l'a posée.
    return along
  }

  // La plus petite sortie d'abord : on déplace la figure le moins possible,
  // sans quoi elle irait systématiquement se coller à un bout du bord. Elles
  // sont retenues telles quelles ou pas du tout — une sortie rebornée ne sort
  // de rien, et c'est `farthestFromPlayer` qui traite ce cas correctement.
  const exits = right - along <= along - left ? [right, left] : [left, right]
  for (const exit of exits) {
    if (exit >= bounds.lo && exit <= bounds.hi) {
      return exit
    }
  }

  // Aucune sortie admissible : c'est ici que l'envergure l'emporte sur
  // l'écartement, et on prend le maximum exact de ce qui reste.
  return farthestFromPlayer(arcs, bounds.lo, bounds.hi)
}

/**
 * Pose une apparition de bord : borne d'abord l'origine tirée pour que le
 * motif tienne entier dans l'arène, PUIS la fait glisser le long du bord
 * d'entrée pour dégager le joueur.
 *
 * Ne vaut que pour l'instant de l'apparition : une fois postée, une figure
 * traversante est reprise par `formationSystem`, qui la fait avancer et la
 * laisse ressortir par le bord opposé (traversée normale).
 */
function placeEdgeOrigin(
  world: SimWorld,
  edge: { x: number; y: number; dirX: number; dirY: number },
  rotated: readonly Offset[],
): { x: number; y: number } {
  const boundsX = fitBounds(rotated, 'x', world.arena.width)
  const boundsY = fitBounds(rotated, 'y', world.arena.height)
  const fitted = { x: clampToBounds(boundsX, edge.x), y: clampToBounds(boundsY, edge.y) }

  // On glisse le long du bord d'entrée, donc perpendiculairement à la marche :
  // l'autre axe porte la marge d'apparition, y toucher ferait naître la
  // figure au milieu de l'arène au lieu de son bord.
  const axis: 'x' | 'y' = edge.dirX !== 0 ? 'y' : 'x'
  const slid = slideFromPlayer(world, fitted, rotated, axis, axis === 'y' ? boundsY : boundsX)
  return axis === 'y' ? { x: fitted.x, y: slid } : { x: slid, y: fitted.y }
}

/** Motif d'un ennemi isolé : le même placement de bord, avec un seul membre. */
const SOLO_PATTERN: readonly Offset[] = [{ x: 0, y: 0 }]

/**
 * Les figures traversantes (Ligne, V, Spirale) : apparition en bord d'écran,
 * traversée de l'arène en formation, sursaut sur le joueur à la dislocation
 * (formationSystem).
 *
 * La figure est tournée face à sa marche (`formationBaseRotation`) : ce qui la
 * borne est donc la dimension d'arène **perpendiculaire** à cette marche — la
 * hauteur pour une entrée par la gauche ou la droite, la largeur pour une
 * entrée par le haut ou le bas. Surtout pas la plus petite des deux : une
 * entrée verticale a droit à toute la largeur.
 */
function spawnCrossingFormation(
  world: SimWorld,
  type: EnemyType,
  kind: FormationKind,
  count: number,
): void {
  const edge = edgeOrigin(world)
  // Un rayon d'ennemi réservé de CHAQUE côté : `fitBounds` borne le
  // centre du membre extrême à `MAX_ENEMY_RADIUS` du bord, une envergure qui
  // occuperait l'étendue entière ne tiendrait donc plus dans l'intervalle
  // qu'il laisse à l'origine (borne basse au-dessus de la borne haute), et la
  // figure ressortirait d'un côté. On borne l'envergure sur ce qui reste.
  //
  // L'envergure PERPENDICULAIRE, et elle seule : la profondeur de la figure le
  // long de sa marche n'est bornée nulle part, et finit par déborder de l'arène
  // aux gros effectifs — voir la limite connue de `fitBounds`.
  const availableExtent =
    (edge.dirX !== 0 ? world.arena.height : world.arena.width) - MAX_ENEMY_RADIUS * 2
  const layout = crossingLayout(kind, count, availableExtent)
  const offsets = formationOffsets(kind, layout.count, layout.spacing)

  // Décalages tournés une première fois ici pour le spawn, avec exactement la
  // même formule (rotationOffset, pas de resserrement au temps 0) que
  // `formationSystem` au tout premier pas — sinon la formation « sauterait »
  // visiblement dès sa première image active.
  const rotationOffset = formationBaseRotation(edge.dirX, edge.dirY)
  const cos0 = cos(rotationOffset)
  const sin0 = sin(rotationOffset)
  const rotated = offsets.map((offset) => ({
    x: offset.x * cos0 - offset.y * sin0,
    y: offset.x * sin0 + offset.y * cos0,
  }))
  const origin = placeEdgeOrigin(world, edge, rotated)

  // L'Éclat garde sa propre machine à états (shardSystem) : lui imposer une
  // chorégraphie externe forcerait à arbitrer laquelle des deux commande sa
  // vélocité (même choix que hazards.ts face au Buvard). Il garde le
  // positionnement de groupe — orientation de marche comprise, sans quoi une
  // volée d'Éclats naîtrait alignée le long de sa propre entrée, donc entière
  // hors de l'arène — mais poursuit immédiatement.
  if (type === 'shard') {
    for (const offset of rotated) {
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
  const durationMs = crossingDurationMs(
    world.arena.width,
    world.arena.height,
    edge.dirX,
    cfg.travelSpeed,
  )
  const kindIndex = FORMATION_KINDS.indexOf(kind)

  for (let i = 0; i < offsets.length; i++) {
    // Décalage local (non tourné) côté composant : `formationSystem` réapplique
    // la rotation à chaque pas, la lui donner déjà tournée la doublerait.
    const offset = offsets[i]!
    const spawnOffset = rotated[i]!
    const eid = spawnEnemy(world, {
      type,
      x: origin.x + spawnOffset.x,
      y: origin.y + spawnOffset.y,
      materializeMs: MATERIALIZE_EDGE_MS,
    })

    removeComponent(world, Homing, eid)
    addComponent(world, Formation, eid)
    Formation.kind[eid] = kindIndex
    Formation.offsetX[eid] = offset.x
    Formation.offsetY[eid] = offset.y
    Formation.originX[eid] = origin.x
    Formation.originY[eid] = origin.y
    Formation.dirX[eid] = edge.dirX
    Formation.dirY[eid] = edge.dirY
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
  // Limite connue et assumée : quand l'arène approche `MAX_ENEMIES`, le
  // ruissellement (toutes les ~0,3 s) rafle le budget résiduel avant les
  // formations (toutes les ~2 s), qui tombent alors à un ou deux membres — le
  // mécanisme de difficulté s'éteint au moment où il devrait culminer. Non
  // corrigé : il faut 1500 ennemis vivants pour en arriver là, c'est-à-dire un
  // joueur qui n'a quasiment rien tué, donc mort depuis longtemps.
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
    // `grantInvulnerability` garde la plus longue des deux protections : une
    // Ronce en cours ne doit pas retomber à ces 500 ms parce qu'une vague vient
    // de tourner.
    grantInvulnerability(world, world.playerEid, WAVE_START_INVULN_MS)
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
