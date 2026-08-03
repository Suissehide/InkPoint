import {
  Collider,
  Dasher,
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
  Velocity,
} from '@sim/components'
import { ENEMIES, ENEMY_TYPE_BY_ID, SHARD_TELEGRAPH_MS } from '@sim/data/enemies'
import { PICKUP_LIFE_MS, POWERUP_BY_ID } from '@sim/data/powerups'
import { invulnerabilityRatio } from '@sim/invulnerability'
import type { SimWorld } from '@sim/world'
import { defineQuery, entityExists, hasComponent } from 'bitecs'
import { Application, Container, Graphics, Rectangle } from 'pixi.js'

import { type Camera, createCamera } from './camera'
import { boilPhase, createBoilFilter } from './filters/boil'
import { createGrainFilter } from './filters/grain'
import { createVignetteFilter } from './filters/vignette'
import { createFrame } from './frame'
import { type AfterimageBeat, advanceAfterimageBeat, createAfterimages } from './fx/afterimage'
import { createFlash, type Flash } from './fx/flash'
import { createFrostStars, type FrostStars } from './fx/frost-star'
import { createShockwaves, type Shockwaves } from './fx/shockwave'
import { INK } from './ink'
import { lerp } from './interpolate'
import { createPage } from './page'
import { createParticles, type Particles } from './particles'
import type { Viewport } from './viewport'
import { createEnemyView, type EnemyView, shardAim, thawFrostAmount } from './views/enemy'
import { createHazardView, type HazardView } from './views/hazard'
import type { SkinId } from './views/nibs'
import { createPickupView, type PickupView } from './views/pickup'
import { createPlayerView, drawNib } from './views/player'
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

/** Trois Éclats chargeant ensemble remplissent déjà les 16 fantômes du joueur. */
const SHARD_GHOST_LIMIT = 48

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
  /** Étoiles de givre du Gel — pilotées depuis `src/app/juice.ts`. */
  readonly frostStars: FrostStars
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
  /**
   * Silhouette du joueur. Poussée entre deux parties par `app/game.ts` : les
   * images rémanentes la lisent aussi, sans quoi le fantôme de la ruée
   * garderait la plume d'origine.
   */
  setSkin(skin: SkinId): void
  destroy(): void
}

/**
 * `noUncheckedIndexedAccess` type l'accès `number | undefined` même si la
 * requête bitECS garantit le composant. `src/render/` n'a pas droit à `!`
 * (réservé à `sim/`) : on lève plutôt que de mentir sur le type.
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
  const frostStars = createFrostStars(particlesLayer)
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

  let skin: SkinId = 'quill'
  const afterimages = createAfterimages(worldLayer, {
    draw: (gfx) => {
      drawNib(gfx, INK.paper, skin)
    },
    limit: 16,
  })
  // Écart conservé en soustrayant l'intervalle plutôt qu'en le remettant à
  // zéro, pour ne pas dériver sous un framerate irrégulier.
  let afterimageElapsedMs = 0

  const shardGhosts = createAfterimages(worldLayer, {
    draw: (gfx) => {
      gfx.circle(0, 0, ENEMIES.shard.radius).fill({ color: INK.shard })
    },
    limit: SHARD_GHOST_LIMIT,
  })
  // Accumulateur et mémoire du pas de simulation : voir `advanceAfterimageBeat`.
  let shardGhostBeat: AfterimageBeat = { elapsedMs: 0, sawSimStep: false }
  // Dernier `world.time` vu par `sync`, pour savoir si la simulation a avancé
  // depuis l'image précédente. `NaN` ne s'égale pas lui-même : la toute
  // première image compte donc comme un pas, ce qui est sans conséquence —
  // aucun Éclat ne charge à cet instant.
  let lastSimTime = Number.NaN

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

      // Hissé au-dessus de la boucle ennemie : la visée de l'Éclat pointe le
      // joueur interpolé, pas sa position de simulation.
      const p = world.playerEid
      const playerX = p >= 0 ? lerp(at(PrevPosition.x, p), at(Position.x, p), alpha) : 0
      const playerY = p >= 0 ? lerp(at(PrevPosition.y, p), at(Position.y, p), alpha) : 0

      // `dashState` est un état de simulation : il reste à 2 quand le monde
      // cesse d'être avancé alors que le rendu continue — séquence de mort,
      // décompte, pause. Une émission pilotée par le temps réel empilerait
      // alors des fantômes sur des coordonnées identiques au pixel près, une
      // demi-douzaine de disques violets quasi opaques par-dessus un corps que
      // la mort est justement en train de blanchir. D'où le gel de l'émission
      // tant que `world.time` n'a pas bougé.
      // Contrepartie assumée : `world.time` est mis à l'échelle par
      // `timeScale`, donc un hitstop d'une soixantaine de ms suspend lui aussi
      // l'émission. Il en coûte au plus un fantôme, ce qui ne se voit pas.
      const simAdvanced = world.time !== lastSimTime
      lastSimTime = world.time

      // Battement partagé par tous les Éclats en charge : le décalage de phase
      // entre deux chargeurs n'est pas une information, et un compteur par
      // entité demanderait à la mort un nettoyage que ce battement évite.
      // Gardé par `effectsEnabled` (mouvement réduit) comme les fantômes du joueur.
      // L'arithmétique elle-même vit dans `advanceAfterimageBeat`, où elle est
      // testable : ce qu'elle garantit, c'est un fantôme toutes les 40 ms de
      // temps réel tant que le monde tourne — quel que soit le rafraîchissement
      // de l'écran — et aucun tant qu'il est figé.
      let emitShardGhosts = false
      if (effectsEnabled) {
        const beat = advanceAfterimageBeat({
          beat: shardGhostBeat,
          dtMs: frameDtMs,
          intervalMs: AFTERIMAGE_EMIT_INTERVAL_MS,
          simAdvanced,
        })
        shardGhostBeat = { elapsedMs: beat.elapsedMs, sawSimStep: beat.sawSimStep }
        emitShardGhosts = beat.emit
      } else {
        shardGhostBeat = { elapsedMs: 0, sawSimStep: false }
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
        const enemyX = lerp(at(PrevPosition.x, eid), at(Position.x, eid), alpha)
        const enemyY = lerp(at(PrevPosition.y, eid), at(Position.y, eid), alpha)
        const type = ENEMY_TYPE_BY_ID[at(Enemy.type, eid)] ?? 'point'
        const dashState = hasComponent(world, Dasher, eid) ? at(Dasher.state, eid) : 0
        // Lu une seule fois : sert la couleur du corps et l'exclusion des
        // fantômes plus bas.
        const frozen = hasComponent(world, Frozen, eid)
        // Le givre s'efface par paliers sur la fin du gel : la couleur d'espèce
        // qui remonte annonce que l'ennemi va repartir. `remaining` décroît en
        // `FIXED_DT × timeScale`, donc l'alerte s'étire d'elle-même au ralenti.
        const frostAmount = frozen ? thawFrostAmount(at(Frozen.remaining, eid)) : 0
        const aim = shardAim(
          dashState,
          at(Velocity.x, eid),
          at(Velocity.y, eid),
          playerX - enemyX,
          playerY - enemyY,
        )
        const telegraphProgress =
          dashState === 1 ? 1 - at(Dasher.timer, eid) / SHARD_TELEGRAPH_MS : 0
        const aimLength = Math.hypot(playerX - enemyX, playerY - enemyY)

        view.update({
          x: enemyX,
          y: enemyY,
          radius: at(Collider.radius, eid),
          type,
          aim,
          materializeProgress: progress,
          frostAmount,
          whiten: deathState?.whiten ?? 0,
          dashState,
          telegraphProgress,
          aimLength,
        })

        // Gelé exclu : `shardSystem` ne teste pas `Frozen` et `freezeSystem`
        // annule la vitesse ensuite, si bien qu'un Éclat gelé reste en état 2,
        // immobile. La pile de fantômes violets enterrerait son corps `frost`,
        // alors que le gel doit primer sur l'espèce.
        if (emitShardGhosts && dashState === 2 && !frozen) {
          shardGhosts.emit(enemyX, enemyY, aim)
        }
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
        // `?? PICKUP_LIFE_MS` : une pastille porte toujours `Lifetime`
        // (`spawnPickup`), et une jauge pleine est le bon repli si elle n'en
        // avait pas — mieux vaut une pastille qui ne s'alarme jamais qu'une
        // pastille qui clignote sans raison.
        const reste = Lifetime.remaining[eid] ?? PICKUP_LIFE_MS
        view.update({
          x: at(Position.x, eid),
          y: at(Position.y, eid),
          pulse: world.time / 260,
          lifeRatio: reste / PICKUP_LIFE_MS,
        })
      }
      reap(pickupViews, world, livePickups)

      const playerGone = deathState?.playerGone ?? false
      if (p >= 0) {
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
          // Le rapport est calculé côté simulation, pas ici : c'est elle qui
          // sait que `total` peut manquer, et le rendu n'a pas à connaître la
          // disposition interne du composant.
          graceRatio: invulnerabilityRatio(world, p),
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
      frostStars.update(frameDtMs)
      flash.update(frameDtMs)
      // Décroissance non gardée par `effectsEnabled` : seule l'émission l'est.
      afterimages.update(frameDtMs)
      shardGhosts.update(frameDtMs)

      app.renderer.render(app.stage)
    },

    camera,
    particles,
    flash,
    shockwaves,
    frostStars,

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

    setSkin(next: SkinId): void {
      skin = next
      playerView.setSkin(next)
    },

    destroy(): void {
      particles.destroy()
      shockwaves.destroy()
      frostStars.destroy()
      flash.destroy()
      afterimages.destroy()
      shardGhosts.destroy()
      page.destroy()
      app.destroy(true, { children: true })
    },
  }
}
