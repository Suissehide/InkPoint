import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { Application, Container, Graphics, Rectangle } from 'pixi.js'

import {
  Collider,
  Dashing,
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
import { ENEMY_TYPE_BY_ID } from '@/sim/data/enemies'
import { POWERUP_BY_ID } from '@/sim/data/powerups'
import type { SimWorld } from '@/sim/world'
import { type Camera, createCamera } from './camera'
import { boilPhase, createBoilFilter } from './filters/boil'
import { createGrainFilter } from './filters/grain'
import { createVignetteFilter } from './filters/vignette'
import { createFrame } from './frame'
import { createAfterimages } from './fx/afterimage'
import { createFlash, type Flash } from './fx/flash'
import { createShockwaves, type Shockwaves } from './fx/shockwave'
import { INK } from './ink'
import { lerp } from './interpolate'
import { createPage } from './page'
import { createParticles, type Particles } from './particles'
import type { Viewport } from './viewport'
import { createEnemyView, type EnemyView } from './views/enemy'
import { createHazardView, type HazardView } from './views/hazard'
import { createPickupView, type PickupView } from './views/pickup'
import { createPlayerView } from './views/player'
import { createReticleView } from './views/reticle'

const enemyQuery = defineQuery([Enemy, Position, Collider])
const hazardQuery = defineQuery([Hazard, Position])
const pickupQuery = defineQuery([Pickup, Position])

/** Plafonnée à 0,75 : à 1,0 la vignette rendrait l'arène illisible pile quand le joueur a le plus besoin de la lire. */
const DANGER_VIGNETTE_MAX = 0.75

/**
 * En temps réel, pas en pas de simulation : un hitstop gèle le monde mais la
 * traînée doit rester vivante, sinon la ruée perd son sentiment de vitesse au
 * moment de l'impact.
 */
const AFTERIMAGE_EMIT_INTERVAL_MS = 40

export interface DeathState {
  detonated: ReadonlySet<number>
  /** 0 = couleurs normales, 1 = tout est papier ; `game.ts` n'émet aujourd'hui que 0 ou 1. */
  whiten: number
  playerGone: boolean
}

export interface Stage {
  readonly app: Application
  readonly world: Container
  /** Secousse d'écran — piloté depuis `src/app/juice.ts`, jamais depuis la simulation. */
  readonly camera: Camera
  /** Éclaboussures d'encre — piloté depuis `src/app/juice.ts`. */
  readonly particles: Particles
  /** Voile de l'arène (combos, ramassage, mort) — piloté depuis `src/app/juice.ts`. */
  readonly flash: Flash
  /** Anneaux d'onde de choc — pilotés depuis `src/app/juice.ts`. */
  readonly shockwaves: Shockwaves
  // Pas d'`afterimages` ici : les fantômes de ruée sont émis depuis `sync`
  // elle-même. Exposer une poignée inviterait à les piloter aussi depuis
  // `juice.ts`, doublant l'émission.
  sync(world: SimWorld, alpha: number): void
  resize(width: number, height: number): void
  /** Masque, `content.filterArea` et le flash suivent l'arène via cet appel, pour ne jamais se désynchroniser du zoom. */
  setViewport(viewport: Viewport): void
  /** Active ou coupe les filtres (boil, grain, vignette) — utile pour le debug ou les préférences. */
  setEffects(opts: { enabled: boolean }): void
  /** 0 = pas de danger, 1 = danger maximal (teinte plafonnée à `DANGER_VIGNETTE_MAX`). */
  setDangerProximity(v: number): void
  /**
   * Cible du déplacement à la souris, en coordonnées d'arène — `null` la
   * masque. Poussée par `app/game.ts` à chaque image : elle vit en temps réel,
   * pas en temps de simulation, et n'est donc jamais interpolée.
   */
  setAimTarget(target: { x: number; y: number } | null): void
  /** `null` en dehors de l'état `dying`. */
  setDeathState(state: DeathState | null): void
  destroy(): void
}

/**
 * `noUncheckedIndexedAccess` type l'accès `number | undefined` même si la
 * requête bitECS garantit le composant. `src/render/` n'a pas droit à `!`
 * (réservé à `src/sim/`) : on lève plutôt que de mentir sur le type.
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
    // Taille explicite plutôt que `resizeTo: window` : `app/game.ts` pilote déjà
    // son propre écouteur `resize` et rappelle `resize()` (ci-dessous) ; Pixi
    // écoutant `window` en plus redimensionnerait le renderer deux fois.
    width: window.innerWidth,
    height: window.innerHeight,
  })
  // Boucle de rendu pilotée par notre boucle à pas fixe, pas par Pixi.
  app.ticker.stop()

  // `scale` (setViewport) vaut le plus petit des deux rapports fenêtre/arène ;
  // ne vaut 1 que quand la fenêtre est exactement en 16:9.
  const viewportLayer = new Container()
  app.stage.addChild(viewportLayer)

  // Les ennemis naissent désormais DANS l'arène, entièrement visibles dès leur
  // première image, contour pointillé compris (sim/systems/waves.ts) : ce
  // masque n'a donc plus rien à cacher au moment du spawn. Il reste nécessaire
  // à la sortie — une figure traversante ressort par le bord opposé, une
  // éclaboussure déborde, et l'arène a une taille fixe que le cadre de la
  // fenêtre ne suit pas : sans découpe, tout cela peinturlurerait le hors-jeu.
  const clip = new Graphics()
  viewportLayer.addChild(clip)

  const content = new Container()
  content.mask = clip
  viewportLayer.addChild(content)

  // Avant `worldLayer`, hors du boil (posé seulement sur `worldLayer`) : la
  // réglure est du papier, elle ne doit pas frémir comme le trait d'encre.
  const page = createPage(content)

  const worldLayer = new Container()
  content.addChild(worldLayer)

  // Au-dessus de worldLayer (éclaboussures par-dessus les entités), sous la vignette.
  const particlesLayer = new Container()
  content.addChild(particlesLayer)

  const camera = createCamera()
  const particles = createParticles(particlesLayer)
  const shockwaves = createShockwaves(particlesLayer)
  // Doit rester dans le cadre : en letterboxing, un voile plein écran
  // éclairerait la marge hors de l'aire de jeu. Taille à 0 ici ; `setViewport`
  // la fixe aux dimensions d'arène, pas de la fenêtre.
  const flashLayer = new Container()
  content.addChild(flashLayer)
  const flash = createFlash(flashLayer, 0, 0)

  // Au-dessus du flash : doit rester lisible même pendant un voile de combo.
  const frame = createFrame()
  content.addChild(frame.container)

  // Temps réel, pas temps de simulation : un hitstop gèle la simulation mais
  // l'image (secousse, particules) doit rester vivante.
  let lastFrameTime = performance.now()

  const boil = createBoilFilter()
  const grain = createGrainFilter()
  const vignette = createVignetteFilter()

  // Boil sur les entités seules. Vignette sur `content` (suit l'arène, pas la
  // fenêtre). Grain plein écran : la marge est la page, elle a droit à son grain.
  worldLayer.filters = [boil]
  content.filters = [vignette]
  app.stage.filters = [grain]
  // Sans filterArea explicite, Pixi calcule la zone du filtre depuis les
  // bornes des enfants de `app.stage`, pas tout le canevas.
  app.stage.filterArea = app.screen

  let effectsEnabled = true
  let deathState: DeathState | null = null

  const enemyViews = new Map<number, EnemyView>()
  const hazardViews = new Map<number, HazardView>()
  const pickupViews = new Map<number, PickupView>()
  const playerView = createPlayerView()
  worldLayer.addChild(playerView.container)

  // Dans `worldLayer` comme le joueur, pour frémir sous le boil. Ajouté après
  // lui, donc dessiné par-dessus.
  const reticle = createReticleView()
  worldLayer.addChild(reticle.container)

  const afterimages = createAfterimages(worldLayer)
  // Écart conservé en soustrayant l'intervalle plutôt qu'en le remettant à
  // zéro, pour ne pas dériver sous un framerate irrégulier.
  let afterimageElapsedMs = 0

  function setDangerProximity(v: number): void {
    vignette.setIntensity(Math.min(DANGER_VIGNETTE_MAX, Math.max(0, v)))
  }

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
      const now = performance.now()
      const frameDtMs = now - lastFrameTime
      lastFrameTime = now

      if (effectsEnabled) {
        const phase = boilPhase(world.time)
        boil.setPhase(phase)
        grain.setPhase(phase)
      }

      const liveEnemies = new Set<number>()
      for (const eid of enemyQuery(world)) {
        if (deathState?.detonated.has(eid)) {
          // Retiré de `liveEnemies` : sa vue est nettoyée par `reap`.
          continue
        }
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
        const type = ENEMY_TYPE_BY_ID[at(Enemy.type, eid)] ?? 'point'
        view.update({
          x: lerp(at(PrevPosition.x, eid), at(Position.x, eid), alpha),
          y: lerp(at(PrevPosition.y, eid), at(Position.y, eid), alpha),
          radius: at(Collider.radius, eid),
          type,
          materializeProgress: progress,
          frozen: hasComponent(world, Frozen, eid),
          whiten: deathState?.whiten ?? 0,
        })
      }
      reap(enemyViews, world, liveEnemies)

      // Ennemis en cours d'apparition exclus : traversables, les compter comme
      // un danger imminent serait un mensonge visuel.
      let nearest = Number.POSITIVE_INFINITY
      if (world.playerEid >= 0 && world.alive) {
        const px = at(Position.x, world.playerEid)
        const py = at(Position.y, world.playerEid)
        for (const eid of liveEnemies) {
          if (hasComponent(world, Materializing, eid)) {
            continue
          }
          nearest = Math.min(
            nearest,
            Math.hypot(at(Position.x, eid) - px, at(Position.y, eid) - py),
          )
        }
      }
      setDangerProximity(nearest > 120 ? 0 : 1 - nearest / 120)

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
        // Interpolée ssi elle porte `PrevPosition`, c'est-à-dire si elle bouge
        // (test générique, pas une liste de kinds de hazard).
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
          time: world.time,
          remainingMs: life === undefined ? Number.POSITIVE_INFINITY : life,
          // `null` plutôt qu'un angle de repli : sans `Facing`, la vue doit
          // s'abstenir de dessiner un chevron plutôt que d'en pointer un au hasard.
          angle: hasComponent(world, Facing, eid) ? at(Facing.angle, eid) : null,
        })
      }
      reap(hazardViews, world, liveHazards)

      const livePickups = new Set<number>()
      for (const eid of pickupQuery(world)) {
        livePickups.add(eid)
        let view = pickupViews.get(eid)
        if (!view) {
          // Repli 'blast' défensif : spawnPickup ne pose jamais un id hors table.
          const kind = POWERUP_BY_ID[at(Pickup.kind, eid)] ?? 'blast'
          view = createPickupView(kind)
          pickupViews.set(eid, view)
          worldLayer.addChild(view.container)
        }
        view.update({ x: at(Position.x, eid), y: at(Position.y, eid), pulse: world.time / 260 })
      }
      reap(pickupViews, world, livePickups)

      const p = world.playerEid
      const playerGone = deathState?.playerGone ?? false
      if (p >= 0) {
        const playerX = lerp(at(PrevPosition.x, p), at(Position.x, p), alpha)
        const playerY = lerp(at(PrevPosition.y, p), at(Position.y, p), alpha)
        const playerAngle = at(Facing.angle, p)
        // `playerGone`, pas `world.alive` : `alive` tombe dès l'impact et
        // ferait disparaître le joueur avant la mise en scène de la mort.
        playerView.container.visible = !playerGone
        playerView.update({
          x: playerX,
          y: playerY,
          angle: playerAngle,
          hasHalo: hasComponent(world, Halo, p),
          invulnerable: hasComponent(world, Invulnerable, p),
          dtMs: frameDtMs,
        })
        page.update(playerGone ? null : { x: playerX, y: playerY })

        // Gardé par `effectsEnabled` (mouvement réduit) comme les particules et la secousse.
        if (effectsEnabled && hasComponent(world, Dashing, p)) {
          afterimageElapsedMs += frameDtMs
          if (afterimageElapsedMs >= AFTERIMAGE_EMIT_INTERVAL_MS) {
            afterimageElapsedMs -= AFTERIMAGE_EMIT_INTERVAL_MS
            afterimages.emit(playerX, playerY, playerAngle)
          }
        } else {
          afterimageElapsedMs = 0
        }
      } else {
        page.update(null)
      }

      // `offset` en pixels d'arène : `worldLayer` hérite du zoom de `viewportLayer`.
      const offset = camera.update(frameDtMs)
      worldLayer.x = offset.x
      worldLayer.y = offset.y
      particles.update(frameDtMs)
      shockwaves.update(frameDtMs)
      flash.update(frameDtMs)
      // Décroissance non gardée par `effectsEnabled` : seule l'émission l'est.
      afterimages.update(frameDtMs)

      app.renderer.render(app.stage)
    },

    camera,
    particles,
    flash,
    shockwaves,

    resize(width: number, height: number): void {
      // Le flash est dimensionné par `setViewport`, pas ici.
      app.renderer.resize(width, height)
    },

    setViewport(viewport: Viewport): void {
      const { arenaWidth, arenaHeight } = viewport
      viewportLayer.scale.set(viewport.scale)
      viewportLayer.position.set(viewport.x, viewport.y)
      clip.clear().rect(0, 0, arenaWidth, arenaHeight).fill(0xffffff)
      content.filterArea = new Rectangle(0, 0, arenaWidth, arenaHeight)
      flash.resize(arenaWidth, arenaHeight)
      frame.resize(arenaWidth, arenaHeight)
      page.resize(arenaWidth, arenaHeight)
    },

    setEffects(opts: { enabled: boolean }): void {
      effectsEnabled = opts.enabled
      worldLayer.filters = effectsEnabled ? [boil] : []
      content.filters = effectsEnabled ? [vignette] : []
      app.stage.filters = effectsEnabled ? [grain] : []
      page.setHaloEnabled(effectsEnabled)
    },

    setDangerProximity,

    setAimTarget(target: { x: number; y: number } | null): void {
      reticle.update(target)
    },

    setDeathState(state: DeathState | null): void {
      deathState = state
    },

    destroy(): void {
      particles.destroy()
      shockwaves.destroy()
      flash.destroy()
      afterimages.destroy()
      page.destroy()
      app.destroy(true, { children: true })
    },
  }
}
