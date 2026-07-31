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
import { HAZARD_SPIKE, POWERUP_BY_ID } from '@/sim/data/powerups'
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
import { createParticles, type Particles } from './particles'
import type { Viewport } from './viewport'
import { createEnemyView, type EnemyView } from './views/enemy'
import { createHazardView, type HazardView } from './views/hazard'
import { createPickupView, type PickupView } from './views/pickup'
import { createPlayerView } from './views/player'

const enemyQuery = defineQuery([Enemy, Position, Collider])
const hazardQuery = defineQuery([Hazard, Position])
const pickupQuery = defineQuery([Pickup, Position])

/**
 * Plafond de la teinte de danger. À 1,0 la vignette noyait l'arène en rouge
 * dès qu'un ennemi frôlait le joueur, exactement quand il a le plus besoin de
 * lire l'écran (spec §6).
 */
const DANGER_VIGNETTE_MAX = 0.75

/**
 * Cadence d'émission des fantômes de ruée, en temps réel (pas en pas de
 * simulation) : un hitstop gèle le monde mais la trace doit continuer à
 * apparaître, sans quoi la ruée perdrait son sentiment de vitesse pile au
 * moment où elle percute un ennemi.
 */
const AFTERIMAGE_EMIT_INTERVAL_MS = 40

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
  // Pas d'`afterimages` ici, à la différence des quatre poignées ci-dessus :
  // les fantômes de ruée sont émis depuis `sync`, qui lit `Dashing` dans le
  // monde. Exposer une poignée que personne ne tient inviterait à les piloter
  // aussi depuis `juice.ts`, et à en émettre deux fois.
  sync(world: SimWorld, alpha: number): void
  resize(width: number, height: number): void
  /**
   * Applique le zoom, le centrage et les dimensions d'arène calculés par
   * `computeViewport`. Le renderer et `app.screen` restent à la taille de la
   * fenêtre (le grain, effet de page, peut couvrir la marge) ; masque,
   * `content.filterArea` et le flash suivent l'arène et transitent par cet
   * appel plutôt que d'être figés à la construction, pour ne jamais se
   * désynchroniser du zoom qu'il applique.
   */
  setViewport(viewport: Viewport): void
  /** Active ou coupe les filtres (boil, grain, vignette) — utile pour le debug ou les préférences. */
  setEffects(opts: { enabled: boolean }): void
  /** 0 = pas de danger, 1 = danger maximal (teinte plafonnée à `DANGER_VIGNETTE_MAX`). */
  setDangerProximity(v: number): void
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
    // Taille initiale explicite plutôt que `resizeTo: window` : le renderer
    // est dimensionné à la fenêtre, mais c'est `app/game.ts` qui pilote son
    // propre écouteur `resize` (`applyLayout`) et rappelle `resize()`
    // (ci-dessous) ; laisser Pixi écouter `window` en plus aurait
    // redimensionné le renderer deux fois à chaque redimensionnement.
    width: window.innerWidth,
    height: window.innerHeight,
  })
  // La boucle de rendu est pilotée par notre boucle à pas fixe, pas par Pixi.
  app.ticker.stop()

  // Le viewport porte le zoom et le centrage de l'arène dans la fenêtre
  // (`setViewport`, plus bas) : `scale` vaut le plus petit des deux rapports
  // fenêtre/arène, et ne vaut 1 que quand la fenêtre est exactement en 16:9.
  const viewportLayer = new Container()
  app.stage.addChild(viewportLayer)

  // Découpe l'aire de jeu : les ennemis apparaissent 40 px hors de l'arène
  // (sim/systems/waves.ts), il ne faut pas les voir dans la marge.
  const clip = new Graphics()
  viewportLayer.addChild(clip)

  const content = new Container()
  content.mask = clip
  viewportLayer.addChild(content)

  const worldLayer = new Container()
  content.addChild(worldLayer)

  // Au-dessus de worldLayer (les éclaboussures se dessinent par-dessus les
  // entités) mais toujours sous la vignette, qui s'applique à `content` entier.
  const particlesLayer = new Container()
  content.addChild(particlesLayer)

  const camera = createCamera()
  const particles = createParticles(particlesLayer)
  const shockwaves = createShockwaves(particlesLayer)
  // Au-dessus des particules, sous `content` comme elles : le flash est un
  // retour de l'arène (combo, ramassage, mort), de la même famille que les
  // particules et la vignette — pas un grain de page. Il doit aussi rester
  // dans le cadre : en letterboxing, un voile plein écran éclairerait la
  // marge hors de l'aire de jeu. Taille posée à 0 ici : `setViewport` la fixe
  // aux dimensions d'arène dès le premier appel, avant tout rendu — elle suit
  // l'arène, pas la fenêtre.
  const flashLayer = new Container()
  content.addChild(flashLayer)
  const flash = createFlash(flashLayer, 0, 0)

  // Au-dessus du flash : le trait d'encre du mur. Il doit rester lisible même
  // pendant un voile de combo ; un cadre qui disparaît sous le voile perd son
  // utilité.
  const frame = createFrame()
  content.addChild(frame.container)

  // Secousse et particules vivent en temps réel, pas en temps de simulation :
  // pendant un hitstop, la simulation gèle mais l'image doit rester vivante.
  let lastFrameTime = performance.now()

  const boil = createBoilFilter()
  const grain = createGrainFilter()
  const vignette = createVignetteFilter()

  // Le boil ne s'applique qu'aux entités. La vignette suit le terrain (son
  // assombrissement et la teinte de danger doivent épouser l'arène, pas la
  // fenêtre) : elle est posée sur `content`, dans le viewport. Le grain reste
  // plein écran : la marge est la page, elle a droit à son grain de papier.
  worldLayer.filters = [boil]
  content.filters = [vignette]
  app.stage.filters = [grain]
  // Sans filterArea explicite, Pixi calcule la zone du filtre à partir des
  // bornes des enfants de `app.stage` — ici seulement les entités visibles,
  // pas tout le canevas. `app.screen` couvre l'écran entier ; `resize()` le
  // met à jour puisque `app.screen` change avec le renderer.
  app.stage.filterArea = app.screen

  let effectsEnabled = true

  const enemyViews = new Map<number, EnemyView>()
  const hazardViews = new Map<number, HazardView>()
  const pickupViews = new Map<number, PickupView>()
  const playerView = createPlayerView()
  worldLayer.addChild(playerView.container)

  // Les fantômes vivent dans `worldLayer`, comme le joueur qu'ils imitent —
  // pas dans `particlesLayer`, réservée aux éclaboussures.
  const afterimages = createAfterimages(worldLayer)
  // Horloge murale dédiée à la cadence d'émission (voir plus bas dans `sync`) :
  // le reste conserve son écart en soustrayant l'intervalle plutôt qu'en le
  // remettant à zéro, pour ne pas dériver sous un framerate irrégulier.
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
      // Secousse, particules et fantômes de ruée avancent en temps réel
      // (horloge murale), pas en temps de simulation : un hitstop gèle
      // `world.timeScale`, jamais `sync`. Calculé en tête de fonction pour
      // être disponible dès la mise à jour de la vue du joueur, plus bas.
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

      // Le rouge monte quand un ennemi passe sous 120 px (spec §3.8). Les
      // ennemis en cours d'apparition sont exclus : ils sont traversables,
      // les signaler comme un danger imminent serait un mensonge visuel.
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

      // Orientation des piques : elles pointent du joueur vers l'extérieur.
      // Calculée ici plutôt que dans la vue, qui ne connaît que la zone.
      const spikeOrigin =
        world.playerEid >= 0
          ? { x: at(Position.x, world.playerEid), y: at(Position.y, world.playerEid) }
          : null

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
        // Test générique, pas une liste de kinds : une zone est interpolée si
        // et seulement si elle porte `PrevPosition`, c'est-à-dire si elle
        // bouge. Aujourd'hui seules les piques du Trait d'encre le font (elles
        // orbitent autour du joueur) ; le sillage de la ruée, lui, est déposé
        // et ne bouge plus. Les zones statiques n'ont rien à interpoler et
        // n'en paient pas le coût.
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
          angle:
            at(Hazard.kind, eid) === HAZARD_SPIKE && spikeOrigin
              ? Math.atan2(at(Position.y, eid) - spikeOrigin.y, at(Position.x, eid) - spikeOrigin.x)
              : 0,
        })
      }
      reap(hazardViews, world, liveHazards)

      const livePickups = new Set<number>()
      for (const eid of pickupQuery(world)) {
        livePickups.add(eid)
        let view = pickupViews.get(eid)
        if (!view) {
          // Le pictogramme est figé à la création (spec §3.4) : chaque
          // power-up dessine sa propre icône au sol, plus un anneau générique.
          // Le repli sur 'blast' est défensif — spawnPickup ne pose jamais un
          // id hors table.
          const kind = POWERUP_BY_ID[at(Pickup.kind, eid)] ?? 'blast'
          view = createPickupView(kind)
          pickupViews.set(eid, view)
          worldLayer.addChild(view.container)
        }
        view.update({ x: at(Position.x, eid), y: at(Position.y, eid), pulse: world.time / 260 })
      }
      reap(pickupViews, world, livePickups)

      const p = world.playerEid
      if (p >= 0) {
        const playerX = lerp(at(PrevPosition.x, p), at(Position.x, p), alpha)
        const playerY = lerp(at(PrevPosition.y, p), at(Position.y, p), alpha)
        const playerAngle = at(Facing.angle, p)
        playerView.container.visible = world.alive
        playerView.update({
          x: playerX,
          y: playerY,
          angle: playerAngle,
          hasHalo: hasComponent(world, Halo, p),
          invulnerable: hasComponent(world, Invulnerable, p),
        })

        // Fantôme de la pointe pendant la ruée : gardé par `effectsEnabled`
        // comme les particules et la secousse, ce sont des images qui bougent
        // et la préférence de mouvement réduit doit pouvoir les couper.
        if (effectsEnabled && hasComponent(world, Dashing, p)) {
          afterimageElapsedMs += frameDtMs
          if (afterimageElapsedMs >= AFTERIMAGE_EMIT_INTERVAL_MS) {
            afterimageElapsedMs -= AFTERIMAGE_EMIT_INTERVAL_MS
            afterimages.emit(playerX, playerY, playerAngle)
          }
        } else {
          afterimageElapsedMs = 0
        }
      }

      // `offset` est en pixels d'arène. `worldLayer` est un enfant de
      // `viewportLayer`, qui porte le zoom : le déplacement à l'écran est
      // donc mis à l'échelle du viewport comme tout le reste de l'arène,
      // et garde la même proportion perçue quel que soit le niveau de zoom.
      const offset = camera.update(frameDtMs)
      worldLayer.x = offset.x
      worldLayer.y = offset.y
      particles.update(frameDtMs)
      shockwaves.update(frameDtMs)
      flash.update(frameDtMs)
      // La décroissance des fantômes déjà émis continue même si `effectsEnabled`
      // vient de basculer à faux en cours de ruée : seule l'émission est
      // gardée, pas l'extinction, comme pour les particules ci-dessus.
      afterimages.update(frameDtMs)

      app.renderer.render(app.stage)
    },

    camera,
    particles,
    flash,
    shockwaves,

    resize(width: number, height: number): void {
      // Le flash vit dans `content`, à l'échelle de l'arène, pas du renderer :
      // c'est `setViewport` qui le dimensionne (voir plus bas), pas cette
      // méthode.
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
    },

    setEffects(opts: { enabled: boolean }): void {
      effectsEnabled = opts.enabled
      worldLayer.filters = effectsEnabled ? [boil] : []
      content.filters = effectsEnabled ? [vignette] : []
      app.stage.filters = effectsEnabled ? [grain] : []
    },

    setDangerProximity,

    destroy(): void {
      particles.destroy()
      shockwaves.destroy()
      flash.destroy()
      afterimages.destroy()
      app.destroy(true, { children: true })
    },
  }
}
