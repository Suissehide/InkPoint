import { burstSystem } from './systems/burst'
import { collisionSystem } from './systems/collision'
import { dashKillSystem } from './systems/dash-kill'
import { dashWakeSystem } from './systems/dash-wake'
import { deathSystem } from './systems/death'
import { formationSystem } from './systems/formation'
import { freezeSystem } from './systems/freeze'
import { hazardSystem } from './systems/hazards'
import { homingSystem } from './systems/homing'
import { integrationSystem } from './systems/integration'
import { lifetimeSystem } from './systems/lifetime'
import { materializationSystem } from './systems/materialization'
import { pickupSystem } from './systems/pickup'
import { playerMovementSystem } from './systems/player-movement'
import { scoreSystem } from './systems/score'
import { secondInkSystem } from './systems/second-ink'
import { shardSystem } from './systems/shard'
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

  playerMovementSystem(world)
  materializationSystem(world)
  // Avant homingSystem : les trois requêtes sont disjointes (un membre de
  // formation ou en sursaut n'a pas Homing, cf. formation.ts / burst.ts),
  // l'ordre entre elles n'a donc pas d'effet direct — mais formationSystem et
  // burstSystem doivent rester avant integrationSystem, dont ils laissent le
  // blocage aux murs s'appliquer. burstSystem après formationSystem : un membre
  // qui se disloque et bascule sur Bursting cette image doit voir sa vélocité
  // de sursaut posée avant integrationSystem, comme s'il l'avait depuis le début.
  formationSystem(world)
  burstSystem(world)
  homingSystem(world)
  shardSystem(world)
  integrationSystem(world)
  // Après integrationSystem, jamais avant : le segment de sillage doit se
  // déposer là où le joueur vient d'arriver, pas où il était avant ce pas.
  // `playerMovementSystem` n'écrit que la vélocité — c'est `integrationSystem`
  // qui déplace réellement, et déposer avant lui laissait le sillage d'un pas
  // en retard, donc un bout de couloir qui tue sans être dessiné. Toujours
  // avant `hazardSystem`, pour que le nouveau segment soit testé dès ce pas.
  dashWakeSystem(world, stats)
  hazardSystem(world, stats)
  freezeSystem(world, stats)
  dashKillSystem(world, stats)
  collisionSystem(world)
  // Juste après collisionSystem, avant que world.events ne soit vidé au
  // prochain pas : le seul point où « Seconde encre » peut réagir au même
  // `haloBroken` que ce pas vient d'émettre (voir second-ink.ts).
  secondInkSystem(world, stats)
  pickupSystem(world, stats)
  waveSystem(world)
  lifetimeSystem(world, stats)
  deathSystem(world, stats)
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
