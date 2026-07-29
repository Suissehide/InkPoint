import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { Application, Container } from 'pixi.js'

import {
  Collider,
  Enemy,
  Facing,
  Frozen,
  Halo,
  Hazard,
  Invulnerable,
  Lifetime,
  Materializing,
  Pickup,
  Position,
  PrevPosition,
} from '@/sim/components'
import type { SimWorld } from '@/sim/world'
import { INK } from './ink'
import { lerp } from './interpolate'
import { createEnemyView, type EnemyView } from './views/enemy'
import { createHazardView, type HazardView } from './views/hazard'
import { createPickupView, type PickupView } from './views/pickup'
import { createPlayerView } from './views/player'

const enemyQuery = defineQuery([Enemy, Position, Collider])
const hazardQuery = defineQuery([Hazard, Position])
const pickupQuery = defineQuery([Pickup, Position])

export interface Stage {
  readonly app: Application
  readonly world: Container
  sync(world: SimWorld, alpha: number): void
  resize(width: number, height: number): void
  destroy(): void
}

/**
 * Lecture indexée sûre sur un tableau de composant bitECS. Les requêtes
 * (`defineQuery`) garantissent qu'une entité retournée possède le composant,
 * mais `noUncheckedIndexedAccess` l'ignore et type l'accès `number | undefined`.
 * `src/render/` n'a pas droit à `!` (réservé à `src/sim/`), donc on lève plutôt
 * que de mentir sur le type : une entité manquante ici est un bug à corriger,
 * pas une valeur à faire semblant d'ignorer.
 */
function at(arr: Float32Array | Uint8Array, eid: number): number {
  const value = arr[eid]
  if (value === undefined) {
    throw new Error(`render/stage: composant manquant pour l'entité ${eid}`)
  }
  return value
}

export async function createStage(canvas: HTMLCanvasElement): Promise<Stage> {
  const app = new Application()
  await app.init({
    canvas,
    background: INK.bg,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
    // Taille initiale explicite plutôt que `resizeTo: window` : `main.ts` a son
    // propre écouteur `resize` (il doit aussi mettre à jour `world.arena`), et
    // laisser Pixi écouter `window` en plus aurait redimensionné le renderer
    // deux fois à chaque redimensionnement. `resize()` (ci-dessous) reste
    // l'unique point d'entrée pour les redimensionnements suivants.
    width: window.innerWidth,
    height: window.innerHeight,
  })
  // La boucle de rendu est pilotée par notre boucle à pas fixe, pas par Pixi.
  app.ticker.stop()

  const worldLayer = new Container()
  app.stage.addChild(worldLayer)

  const enemyViews = new Map<number, EnemyView>()
  const hazardViews = new Map<number, HazardView>()
  const pickupViews = new Map<number, PickupView>()
  const playerView = createPlayerView()
  worldLayer.addChild(playerView.container)

  function reap<V extends { container: Container }>(
    views: Map<number, V>,
    world: SimWorld,
    live: Set<number>,
  ): void {
    for (const [eid, view] of views) {
      if (live.has(eid) && entityExists(world, eid)) {
        continue
      }
      view.container.destroy({ children: true })
      views.delete(eid)
    }
  }

  return {
    app,
    world: worldLayer,

    sync(world: SimWorld, alpha: number): void {
      const liveEnemies = new Set<number>()
      for (const eid of enemyQuery(world)) {
        liveEnemies.add(eid)
        let view = enemyViews.get(eid)
        if (!view) {
          view = createEnemyView()
          enemyViews.set(eid, view)
          worldLayer.addChildAt(view.container, 0)
        }
        const materializing = hasComponent(world, Materializing, eid)
        const progress = materializing
          ? 1 - at(Materializing.remaining, eid) / at(Materializing.total, eid)
          : 1
        view.update({
          x: lerp(at(PrevPosition.x, eid), at(Position.x, eid), alpha),
          y: lerp(at(PrevPosition.y, eid), at(Position.y, eid), alpha),
          radius: at(Collider.radius, eid),
          materializeProgress: progress,
          frozen: hasComponent(world, Frozen, eid),
        })
      }
      reap(enemyViews, world, liveEnemies)

      const liveHazards = new Set<number>()
      for (const eid of hazardQuery(world)) {
        liveHazards.add(eid)
        let view = hazardViews.get(eid)
        if (!view) {
          view = createHazardView()
          hazardViews.set(eid, view)
          worldLayer.addChildAt(view.container, 0)
        }
        const life = Lifetime.remaining[eid]
        // Seule la traînée bouge (spec §3.4) : elle seule porte PrevPosition.
        // Les zones statiques n'ont rien à interpoler et n'en paient pas le coût.
        const moving = hasComponent(world, PrevPosition, eid)
        view.update({
          x: moving
            ? lerp(at(PrevPosition.x, eid), at(Position.x, eid), alpha)
            : at(Position.x, eid),
          y: moving
            ? lerp(at(PrevPosition.y, eid), at(Position.y, eid), alpha)
            : at(Position.y, eid),
          radius: at(Hazard.radius, eid),
          kind: at(Hazard.kind, eid),
          lifeRatio: life === undefined ? 1 : Math.min(1, life / 400),
        })
      }
      reap(hazardViews, world, liveHazards)

      const livePickups = new Set<number>()
      for (const eid of pickupQuery(world)) {
        livePickups.add(eid)
        let view = pickupViews.get(eid)
        if (!view) {
          view = createPickupView()
          pickupViews.set(eid, view)
          worldLayer.addChild(view.container)
        }
        view.update({ x: at(Position.x, eid), y: at(Position.y, eid), pulse: world.time / 260 })
      }
      reap(pickupViews, world, livePickups)

      const p = world.playerEid
      if (p >= 0) {
        playerView.container.visible = world.alive
        playerView.update({
          x: lerp(at(PrevPosition.x, p), at(Position.x, p), alpha),
          y: lerp(at(PrevPosition.y, p), at(Position.y, p), alpha),
          angle: at(Facing.angle, p),
          hasHalo: hasComponent(world, Halo, p),
          invulnerable: hasComponent(world, Invulnerable, p),
        })
      }

      app.renderer.render(app.stage)
    },

    resize(width: number, height: number): void {
      app.renderer.resize(width, height)
    },

    destroy(): void {
      app.destroy(true, { children: true })
    },
  }
}
