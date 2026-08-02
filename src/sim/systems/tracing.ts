import { addComponent, addEntity, defineQuery } from 'bitecs'

import { Hazard, Position, PrevPosition, Tracing } from '../components'
import { HAZARD_TRACING, RULE_TUNING } from '../data/powerups'
import { createPositionHistory } from '../position-history'
import type { RunStats } from '../upgrades/stats'
import type { SimWorld } from '../world'

/**
 * « Papier calque » : un fantôme du trajet du joueur d'il y a `delayMs` le
 * suit et tue ce qu'il touche.
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
 * 320 échantillons pour 2500 ms de retard. Le compte n'est pas
 * `delayMs / FIXED_DT` (150) : un hitstop fige `world.time` sans arrêter les
 * pas, et chaque image gelée pousse un échantillon de plus au même horodatage.
 * À 60 ms de gel toutes les 200 ms au pire (`HITSTOP_MS` / `HITSTOP_CADENCE_MS`,
 * côté app), il faut ~214 images pour couvrir 2500 ms de temps simulé ; 320
 * garde une marge franche. Un tampon trop court ferait simplement retomber
 * `sample` sur l'échantillon le plus ancien — le calque se recollerait au
 * joueur, exactement le défaut que le retard existe pour éviter.
 */
const HISTORY_CAPACITY = 320

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
  // Pas de `Lifetime`, volontairement : le calque ne meurt pas, il accompagne
  // la run entière. C'est la seule zone du jeu dans ce cas.
  return eid
}

export function tracingSystem(world: SimWorld, stats: RunStats): SimWorld {
  if (!stats.rules.has('tracingPaper')) {
    return world
  }

  const player = world.playerEid
  if (player < 0) {
    return world
  }

  const history = historyFor(world)
  history.push(world.time, Position.x[player]!, Position.y[player]!)

  const { delayMs } = RULE_TUNING.tracingPaper
  // Rien avant l'heure : tant que la run n'a pas duré `delayMs`, il n'existe
  // aucun trajet à recopier. Un calque né plus tôt camperait au point
  // d'apparition du joueur pendant deux secondes et demie, immobile et mortel.
  if (world.time <= delayMs) {
    return world
  }

  const target = history.sample(world.time - delayMs)

  // Un seul fantôme par run : celui qui existe est déplacé, jamais doublé.
  const existing = ghosts(world)[0]
  if (existing === undefined) {
    spawnGhost(world, target.x, target.y)
    return world
  }

  // Sans PrevPosition à jour, le rendu ne peut pas interpoler : le calque
  // avancerait par saccades d'un pas de simulation.
  PrevPosition.x[existing] = Position.x[existing]!
  PrevPosition.y[existing] = Position.y[existing]!
  Position.x[existing] = target.x
  Position.y[existing] = target.y

  return world
}
