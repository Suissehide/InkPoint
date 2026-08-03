import { Movement } from './components'
import { brambleSystem } from './systems/bramble'
import { burstSystem } from './systems/burst'
import { collisionSystem } from './systems/collision'
import { dashKillSystem } from './systems/dash-kill'
import { dashWakeSystem } from './systems/dash-wake'
import { deathSystem } from './systems/death'
import { delayedPowerUpSystem } from './systems/delayed-powerup'
import { formationSystem } from './systems/formation'
import { freezeSystem } from './systems/freeze'
import { hazardSystem } from './systems/hazards'
import { hitstopSystem } from './systems/hitstop'
import { homingSystem } from './systems/homing'
import { integrationSystem } from './systems/integration'
import { lifetimeSystem } from './systems/lifetime'
import { materializationSystem } from './systems/materialization'
import { pickupSystem } from './systems/pickup'
import { playerMovementSystem } from './systems/player-movement'
import { ricochetSystem } from './systems/ricochet'
import { scoreSystem } from './systems/score'
import { seekerSystem } from './systems/seeker'
import { shardSystem } from './systems/shard'
import { tracingSystem } from './systems/tracing'
import { waveSystem } from './systems/waves'
import type { RunStats } from './upgrades/stats'
import { FIXED_DT, type SimWorld } from './world'

/**
 * Un pas de simulation. L'ordre est figé : deux exécutions du même monde avec
 * les mêmes entrées doivent produire exactement le même état. `deathSystem`
 * est toujours dernier — il applique en une passe les morts marquées par les
 * autres systèmes, sans invalider leurs requêtes en cours d'itération.
 */
export function stepWorld(world: SimWorld, stats: RunStats): void {
  // Avant la purge : le gel de ce pas se décide sur les kills du pas
  // précédent. Voir le commentaire de `hitstopSystem`.
  hitstopSystem(world)
  world.events.length = 0

  // Les améliorations écrivent dans `stats` ; le composant reste la seule
  // source de vérité, puisque les ennemis s'en servent aussi. Sans cette
  // ligne, « Pas léger » multipliait une valeur que personne ne lisait, et la
  // carte n'avait aucun effet.
  const player = world.playerEid
  if (player >= 0) {
    Movement.maxSpeed[player] = stats.moveSpeed
  }

  playerMovementSystem(world)
  materializationSystem(world)
  // formationSystem et burstSystem avant integrationSystem, qui applique le
  // blocage aux murs. burstSystem après formationSystem : un membre qui
  // bascule sur Bursting ce pas doit avoir sa vélocité de sursaut posée
  // avant integrationSystem.
  formationSystem(world)
  burstSystem(world)
  homingSystem(world)
  shardSystem(world)
  integrationSystem(world)
  // Après integrationSystem : le segment de sillage doit se déposer où le
  // joueur vient d'arriver, pas où il était avant ce pas. Avant hazardSystem,
  // pour que le nouveau segment soit testé dès ce pas.
  dashWakeSystem(world, stats)
  brambleSystem(world)
  // Avec brambleSystem, et pour la même raison : ce sont des déplacements que
  // `integrationSystem` ne fait pas (ces entités n'ont pas de `Collider`).
  // Avant `hazardSystem`, pour que l'explosion posée par une plume qui vient
  // d'atteindre sa cible soit testée dès ce pas — même exigence que
  // `dashWakeSystem` juste au-dessus. La goutte de Bavure, elle, est mortelle
  // par elle-même : c'est sa position d'après ce pas qui doit être testée, pas
  // celle d'avant.
  seekerSystem(world)
  ricochetSystem(world)
  // Même famille, même raison : le calque n'a pas de `Collider` et se déplace
  // lui-même. Avant `hazardSystem`, pour qu'il soit éprouvé à sa position
  // d'arrivée et non à celle d'avant le pas — comme la goutte de Bavure.
  tracingSystem(world, stats)
  hazardSystem(world)
  freezeSystem(world, stats)
  dashKillSystem(world, stats)
  collisionSystem(world)
  // Juste avant `pickupSystem`, et pas ailleurs : la seconde salve de « Double
  // trait » doit traverser exactement les mêmes systèmes que la première, au
  // même point de l'ordre, dans le même pas. Placée après, une zone qu'elle
  // pose attendrait le pas suivant pour être éprouvée — deux Bombes issues du
  // même ramassage n'auraient alors pas la même latence.
  delayedPowerUpSystem(world, stats)
  pickupSystem(world, stats)
  waveSystem(world)
  lifetimeSystem(world)
  // `stats` : c'est ici que « Le papier boit » sème ses taches, au point où
  // `enemyKilled` est émis — le seul endroit qui connaisse toutes les morts.
  deathSystem(world, stats)
  // Après deathSystem, seul émetteur de `enemyKilled` : dans l'ordre inverse
  // le score et le combo ne se déclenchent jamais. scoreSystem ne touche
  // aucune entité, le faire tourner après les suppressions est sans risque.
  scoreSystem(world)

  world.time += FIXED_DT * world.timeScale
}
