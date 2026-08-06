import { addComponent, addEntity, defineQuery } from 'bitecs'

import { Hazard, Lifetime, Position, PrevPosition, Tracing } from '../components'
import { HAZARD_INK_TRAIL, HAZARD_TRACING, RULE_TUNING } from '../data/powerups'
import { hypot } from '../math'
import { createPositionHistory } from '../position-history'
import type { RunStats } from '../upgrades/stats'
import { FIXED_DT, type SimWorld } from '../world'

/**
 * « Papier calque » : un fantôme du trajet du joueur d'il y a `delayMs` le
 * suit, tue ce qu'il touche et peint derrière lui un ruban d'encre qui tue
 * aussi.
 *
 * C'est le retournement de l'idée qui est déjà au cœur du jeu — les ennemis
 * poursuivent le joueur avec du retard, son calque aussi. Le joueur ne pose
 * plus des zones : il les **dessine en se déplaçant**. Repasser deux fois au
 * même endroit y concentre la mort, foncer en ligne droite ne laisse qu'un fil.
 *
 * Comme la goutte de Bavure (`ricochet.ts`) et la plume (`seeker.ts`), le
 * calque ne porte **pas** de `Collider` : `integrationSystem` le plaquerait
 * contre les murs au lieu de le laisser rejouer un trajet que le joueur, lui,
 * a bien parcouru. En rester dehors lui laisse gouverner sa propre position.
 *
 * Il est en revanche dans `LETHAL` (`hazards.ts`) : il tue par lui-même, et le
 * disque affiché est exactement le disque qui tue.
 */

const ghosts = defineQuery([Tracing, Hazard, Position, PrevPosition])

/** Historique du joueur, par monde — jamais partagé avec celui de la poursuite. */
const histories = new WeakMap<SimWorld, ReturnType<typeof createPositionHistory>>()

/**
 * Pure fonction du retard à couvrir : 150 images à 60 Hz pour 2,5 s, plus
 * l'échantillon courant et deux images de marge (l'arrondi du quotient, et
 * l'accumulation flottante de `world.time`, qui vaut 2499,999… après 150 pas).
 *
 * Cette indépendance est tenue par `position-history.ts`, qui refuse un
 * échantillon dont l'horodatage n'a pas avancé : sans elle, il faudrait
 * dimensionner ce tampon sur la durée et la cadence des hitstops — deux
 * constantes qui vivent côté app et que la simulation ne peut pas importer,
 * donc un lien que rien ne garderait.
 */
const HISTORY_CAPACITY = Math.ceil(RULE_TUNING.tracingPaper.delayMs / FIXED_DT) + 3

function historyFor(world: SimWorld) {
  let h = histories.get(world)
  if (!h) {
    h = createPositionHistory(HISTORY_CAPACITY)
    histories.set(world, h)
  }
  return h
}

function spawnGhost(world: SimWorld, x: number, y: number): number {
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, PrevPosition, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Tracing, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  // Égale à `Position` à la naissance : sans quoi le rendu interpolerait
  // depuis le zéro laissé par bitECS, et le calque traverserait l'arène en
  // diagonale sur sa première image.
  PrevPosition.x[eid] = x
  PrevPosition.y[eid] = y
  Hazard.kind[eid] = HAZARD_TRACING
  Hazard.radius[eid] = RULE_TUNING.tracingPaper.radius
  Hazard.maxRadius[eid] = RULE_TUNING.tracingPaper.radius
  // Zéro : `hazardSystem` fait grossir le rayon dès que `growthRate` est positif.
  Hazard.growthRate[eid] = 0
  // Remis à zéro explicitement : bitECS recycle les emplacements d'entités, et
  // un reliquat du calque d'une partie précédente décalerait la première tache.
  // Même piège que `PrevPosition` ci-dessus.
  Tracing.stepAccPx[eid] = 0
  // Pas de `Lifetime`, volontairement : le calque ne meurt pas, il accompagne
  // la run entière. C'est la seule zone du jeu dans ce cas.
  return eid
}

/**
 * Une tache du ruban. Pas de `PrevPosition` : l'encre posée ne bouge plus, et
 * `stage.ts` n'interpole que ce qui en porte.
 */
function spawnTrail(world: SimWorld, x: number, y: number): number {
  const { trailRadius, trailLifeMs } = RULE_TUNING.tracingPaper
  const eid = addEntity(world)
  addComponent(world, Position, eid)
  addComponent(world, Hazard, eid)
  addComponent(world, Lifetime, eid)

  Position.x[eid] = x
  Position.y[eid] = y
  Hazard.kind[eid] = HAZARD_INK_TRAIL
  Hazard.radius[eid] = trailRadius
  Hazard.maxRadius[eid] = trailRadius
  // Zéro : `hazardSystem` fait grossir le rayon dès que `growthRate` est positif.
  Hazard.growthRate[eid] = 0
  Lifetime.remaining[eid] = trailLifeMs
  return eid
}

/**
 * Sème le ruban le long du segment que le calque vient de parcourir.
 *
 * La boucle vide l'accumulateur autant de fois qu'il le faut **dans le même
 * pas**, en interpolant chaque tache sur le segment : l'espacement vaut donc
 * exactement `trailStepPx`, que le joueur marche ou qu'il file. C'est ce qui
 * dispense le calque du décalage perpendiculaire dont la Bavure a besoin — son
 * accumulateur à elle ne se vide qu'une fois par pas, donc son espacement réel
 * dépasse sa cadence nominale et le ruban pourrait s'ouvrir.
 *
 * Un segment de longueur nulle ne pose rien : un joueur immobile ne doit pas
 * empiler des taches sur un pixel.
 */
function paintTrail(
  world: SimWorld,
  eid: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  const { trailStepPx } = RULE_TUNING.tracingPaper
  const dx = toX - fromX
  const dy = toY - fromY
  const length = hypot(dx, dy)
  if (length === 0) {
    return
  }

  let acc = Tracing.stepAccPx[eid]!
  let done = 0
  while (acc + (length - done) >= trailStepPx) {
    done += trailStepPx - acc
    acc = 0
    const t = done / length
    spawnTrail(world, fromX + dx * t, fromY + dy * t)
  }
  Tracing.stepAccPx[eid] = acc + (length - done)
}

export function tracingSystem(world: SimWorld, stats: RunStats): SimWorld {
  const player = world.playerEid
  if (player < 0) {
    return world
  }

  // Enregistré à chaque pas, carte prise ou non — comme `homingSystem`, qui
  // pousse sans condition. Un historique qui ne commencerait qu'à la prise de
  // la carte n'aurait aucun trajet à recopier : le calque resterait planté au
  // point de ramassage pendant `delayMs`, exactement le défaut que le retard
  // existe pour éviter, déplacé du début de partie au milieu de la run. Le
  // coût est d'une écriture dans un tampon circulaire par pas.
  const history = historyFor(world)
  history.push(world.time, Position.x[player]!, Position.y[player]!)

  if (!stats.rules.has('tracingPaper')) {
    return world
  }

  const instant = world.time - RULE_TUNING.tracingPaper.delayMs
  const oldest = history.oldestTime()
  // La vraie condition de naissance n'est pas l'âge de la run, c'est que
  // l'historique **couvre** l'instant demandé. Elle vaut au premier pas d'une
  // partie comme à la prise tardive de la carte, sans rien comparer à
  // `world.time`. Un calque né plus tôt camperait sur le plus ancien
  // échantillon connu — le point d'apparition du joueur — immobile et mortel.
  if (oldest === null || instant < oldest) {
    return world
  }

  const target = history.sample(instant)

  // Un seul fantôme par run : celui qui existe est déplacé, jamais doublé.
  const existing = ghosts(world)[0]
  if (existing === undefined) {
    spawnGhost(world, target.x, target.y)
    return world
  }

  const fromX = Position.x[existing]!
  const fromY = Position.y[existing]!

  // Sans PrevPosition à jour, le rendu ne peut pas interpoler : le calque
  // avancerait par saccades d'un pas de simulation.
  PrevPosition.x[existing] = fromX
  PrevPosition.y[existing] = fromY
  Position.x[existing] = target.x
  Position.y[existing] = target.y

  // Après le déplacement, sur le segment réellement parcouru. Rien à l'image de
  // naissance : `spawnGhost` retourne plus haut, il n'y a pas encore de segment.
  paintTrail(world, existing, fromX, fromY, target.x, target.y)

  return world
}
