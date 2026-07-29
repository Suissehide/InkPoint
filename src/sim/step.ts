import { powerupInputSystem } from './powerups/activate'
import { collisionSystem } from './systems/collision'
import { dashKillSystem } from './systems/dash-kill'
import { deathSystem } from './systems/death'
import { freezeSystem } from './systems/freeze'
import { hazardSystem } from './systems/hazards'
import { homingSystem } from './systems/homing'
import { integrationSystem } from './systems/integration'
import { lifetimeSystem } from './systems/lifetime'
import { materializationSystem } from './systems/materialization'
import { pickupSystem } from './systems/pickup'
import { playerMovementSystem } from './systems/player-movement'
import { scoreSystem } from './systems/score'
import { shardSystem } from './systems/shard'
import { trailSystem } from './systems/trail'
import { waveSystem } from './systems/waves'
import type { RunStats } from './upgrades/stats'
import { FIXED_DT, type SimWorld } from './world'

/**
 * Un pas de simulation. L'ordre est figé et explicite : deux exécutions du même
 * monde avec les mêmes entrées doivent produire exactement le même état.
 * deathSystem est toujours dernier — il applique en une passe les morts marquées
 * par les autres systèmes, ce qui évite d'invalider les requêtes en cours d'itération.
 */
export function stepWorld(world: SimWorld, stats: RunStats): void {
  world.events.length = 0

  powerupInputSystem(world, stats)
  playerMovementSystem(world)
  materializationSystem(world)
  homingSystem(world)
  shardSystem(world)
  integrationSystem(world)
  trailSystem(world)
  hazardSystem(world)
  freezeSystem(world)
  dashKillSystem(world)
  collisionSystem(world)
  pickupSystem(world)
  waveSystem(world)
  lifetimeSystem(world)
  deathSystem(world)
  // `scoreSystem` passe APRÈS `deathSystem`, et ce n'est pas un détail : ce
  // dernier est le seul émetteur de `enemyKilled`. Dans l'ordre inverse, le score
  // aux kills et tout le système de combo ne se déclenchaient jamais en jeu réel —
  // les tests unitaires ne le voyaient pas, puisqu'ils injectent les événements à
  // la main sans passer par `deathSystem`. Le score ne touche aucune entité, il ne
  // lit que les événements et l'état du monde : le faire tourner après les
  // suppressions est sans risque.
  scoreSystem(world)

  world.time += FIXED_DT * world.timeScale
}
