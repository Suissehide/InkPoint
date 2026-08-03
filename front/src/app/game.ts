import { Movement, Position, Velocity } from '@sim/components'
import type { UpgradeDef } from '@sim/data/upgrades'
import { createRng } from '@sim/rng'
import { spawnPlayer } from '@sim/spawn'
import { stepWorld } from '@sim/step'
import { drawUpgrades } from '@sim/upgrades/draw'
import { createRunStats, type RunStats } from '@sim/upgrades/stats'
import { ARENA, ARENA_MOBILE, createWorld, type SimWorld } from '@sim/world'

import { applyAudio, createVoiceBudget, resetVoiceBudget } from '@/audio/apply'
import { createAudioEngine } from '@/audio/engine'
import { bindUiAudio, playCountdownTick } from '@/audio/ui'
import { detectLocale, setLocale } from '@/i18n'
import { createDeathSequence } from '@/render/fx/death-sequence'
import { createStage } from '@/render/stage'
import { computeViewport } from '@/render/viewport'
import { resolveReducedMotion } from '@/ui/a11y'
import { createCountdownScreen } from '@/ui/screens/countdown'
import { createGameOverScreen } from '@/ui/screens/gameover'
import { createHud } from '@/ui/screens/hud'
import { createBadgeView } from '@/ui/screens/hud-badge'
import { createJoystickHalo } from '@/ui/screens/joystick-halo'
import { createMenuScreen } from '@/ui/screens/menu'
import { createPauseScreen } from '@/ui/screens/pause'
import { createSettingsScreen } from '@/ui/screens/settings'
import { createUpgradeScreen } from '@/ui/screens/upgrade'
import type { AchievementDef } from './achievements/catalog'
import { readSkin, readUnlocked } from './achievements/store'
import { createTracker } from './achievements/tracker'
import { createCountdown } from './countdown'
import { createGameStateMachine } from './game-state'
import { type MovementInput, type PlayerMotion, resolveMovementInput } from './input-source'
import { createJoystick } from './joystick'
import { applyJuice } from './juice'
import { createKeyboard } from './keyboard'
import { createFixedLoop, MAX_CATCHUP_MS } from './loop'
import { createMouse } from './mouse'
import { type Display, resolveDisplayQuarters } from './orientation'
import { storage } from './storage'

// Empêche le comportement natif de ces touches (ex. barre d'espace qui fait
// défiler la page) sans toucher aux autres.
const CONSUMABLE_CODES = new Set([
  'Space',
  'Enter',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

interface Run {
  world: SimWorld
  stats: RunStats
  seed: number
}

function createRun(arena: { width: number; height: number; rangeScale: number }): Run {
  const seed = Math.floor(Math.random() * 2 ** 31)
  const world = createWorld({
    seed,
    width: arena.width,
    height: arena.height,
    rangeScale: arena.rangeScale,
  })
  spawnPlayer(world)
  return { world, stats: createRunStats(world.arena.rangeScale), seed }
}

export interface GameOptions {
  canvas: HTMLCanvasElement
  uiRoot: HTMLElement
  /** Le conteneur pivoté en portrait sur pointeur grossier (voir `applyLayout`). */
  appRoot: HTMLElement
}

export async function startGame({ canvas, uiRoot, appRoot }: GameOptions): Promise<void> {
  /**
   * Un seul prédicat gouverne tout le mobile : rotation, taille d'arène,
   * taille d'interface, cible de pause et source d'entrée par défaut. Lu une
   * fois — un appareil ne change pas de classe de pointeur en cours de
   * session.
   *
   * Dans le corps de `startGame` et non au niveau du module : une constante de
   * module lirait `window` à l'ÉVALUATION du fichier, ce qui rendrait `game.ts`
   * impossible à importer sans navigateur — un test qui l'importerait
   * planterait à l'import, pas à l'usage. `startGame` ne s'exécutant qu'une
   * fois par démarrage, la lecture reste unique.
   */
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches

  // Figée pour toute la session : une arène qui rétrécirait en cours de partie
  // téléporterait des ennemis hors du cadre.
  const arena = coarsePointer ? ARENA_MOBILE : ARENA

  // Choix stocké > langue du navigateur > anglais (spec §5).
  setLocale(detectLocale(navigator.language, storage.get<string | null>('locale', null)))

  const machine = createGameStateMachine()
  const stage = await createStage(canvas)
  const hud = createHud(uiRoot)
  // Monté sur `uiRoot` et non dans le HUD : celui-ci est calé sur l'arène et
  // mis à l'échelle par un `transform`, qui deviendrait le repère de tout
  // enfant. Le bandeau se veut en haut au centre de la FENÊTRE — il lui faut
  // donc `#ui` pour parent.
  const badge = createBadgeView()
  uiRoot.appendChild(badge.element)
  const keyboard = createKeyboard()
  const mouse = createMouse()
  // Écoute sur `#app` et non `window` : la zone de capture se raisonne dans
  // le repère pivoté, et `#app` est ce repère.
  const joystick = createJoystick(appRoot)
  const joystickHalo = createJoystickHalo(uiRoot)
  const tracker = createTracker()
  /** Les succès ouverts pendant la partie en cours — bandeau et écran de fin. */
  let unlockedThisRun: AchievementDef[] = []
  const audio = createAudioEngine()
  audio.setVolume(storage.get('sfxVolume', 100))
  // Plafond de voix par IMAGE : une seule image peut contenir quinze pas de
  // simulation (`loop.ts`), et `ctx.currentTime` n'avance pas entre eux.
  const voiceBudget = createVoiceBudget()
  // Les écrans (navigation, choix de carte) jouent par ce point d'entrée :
  // sans lui, le joueur n'entendrait rien avant sa première partie.
  bindUiAudio(audio)

  // Réglage explicite > préférence système `prefers-reduced-motion` > actif (voir `src/ui/a11y.ts`).
  let reducedMotion = resolveReducedMotion()
  // Défaut souris (spec) ; l'écran Réglages le réassigne via onMovementInputChange.
  let movementInput: MovementInput = resolveMovementInput(coarsePointer)
  stage.setEffects({ enabled: !reducedMotion })
  // Cette classe sur `<html>` reflète le réglage résolu, pas seulement la media
  // query système : sans elle, un joueur qui coupe le mouvement dans les
  // réglages sans l'avoir demandé à son système garderait toutes les
  // animations CSS — pop du combo, transitions des cartes (main.css).
  document.documentElement.classList.toggle('reduced-motion', reducedMotion)

  let run = createRun(arena)
  let ownedIds: string[] = []
  let mythicTaken = false
  let settingsOpen = false

  // Jouée sur l'horloge réelle pendant l'état `dying` : la simulation ne fait
  // plus un seul pas pendant ce temps.
  const deathSequence = createDeathSequence()

  function startRun(): void {
    run = createRun(arena)
    // Sinon les ennemis marqués détonés resteraient invisibles dans la nouvelle partie.
    stage.setDeathState(null)
    ownedIds = []
    mythicTaken = false
    const eid = run.world.playerEid
    tracker.reset(Position.x[eid] ?? 0, Position.y[eid] ?? 0)
    unlockedThisRun = []
    stage.setSkin(readSkin(readUnlocked()))
    badge.clear()
  }

  /**
   * `?? 0` satisfait `noUncheckedIndexedAccess` sans assertion non-nulle
   * (interdite hors de `sim/`) ; jamais atteint en pratique.
   */
  function playerMotion(): PlayerMotion {
    const eid = run.world.playerEid
    return {
      x: Position.x[eid] ?? 0,
      y: Position.y[eid] ?? 0,
      vx: Velocity.x[eid] ?? 0,
      vy: Velocity.y[eid] ?? 0,
      accel: Movement.accel[eid] ?? 0,
      maxSpeed: Movement.maxSpeed[eid] ?? 0,
    }
  }

  function finalizeBestScore(): number {
    const best = Math.max(storage.get('bestScore', 0), Math.round(run.world.score))
    storage.set('bestScore', best)
    return best
  }

  // ---- écrans ----------------------------------------------------------

  const menuScreen = createMenuScreen(uiRoot, {
    onPlay(): void {
      startRun()
      machine.send('START')
      menuScreen.hide()
    },
    onSettings(): void {
      openSettings()
    },
    onSkinChange(skin): void {
      stage.setSkin(skin)
    },
  })

  const upgradeScreen = createUpgradeScreen(uiRoot)
  const gameOverScreen = createGameOverScreen(uiRoot)

  const countdownScreen = createCountdownScreen(uiRoot)
  const countdown = createCountdown()

  /**
   * Toute reprise passe par là. `mouse.forgetTarget()` y est remonté depuis les
   * deux appelants : sans lui, le premier pas viserait le bouton ou la carte
   * qu'on vient de cliquer.
   */
  function beginCountdown(): void {
    mouse.forgetTarget()
    // Le doigt qui vient de toucher « Reprendre » ne doit pas être lu comme
    // une commande dès la reprise.
    joystick.release()
    countdown.start()
    countdownScreen.show()
    countdownScreen.update(countdown.digit)
    playCountdownTick(countdown.digit)
  }

  const pauseScreen = createPauseScreen(uiRoot, {
    onResume(): void {
      machine.send('RESUME')
      pauseScreen.hide()
      beginCountdown()
    },
    onSettings(): void {
      openSettings()
    },
    onQuit(): void {
      finalizeBestScore()
      machine.send('QUIT')
      pauseScreen.hide()
      startRun()
      menuScreen.show()
    },
  })

  const settingsScreen = createSettingsScreen(uiRoot, {
    onReducedMotionChange(reduced): void {
      reducedMotion = reduced
      stage.setEffects({ enabled: !reduced })
      document.documentElement.classList.toggle('reduced-motion', reduced)
    },
    onMovementInputChange(next): void {
      movementInput = next
    },
    onSfxVolumeChange(volume): void {
      audio.setVolume(volume)
    },
    coarsePointer,
  })

  function openSettings(): void {
    settingsOpen = true
    menuScreen.hide()
    pauseScreen.hide()
    settingsScreen.show(closeSettings)
  }

  function closeSettings(): void {
    settingsOpen = false
    settingsScreen.hide()
    if (machine.state === 'menu') {
      menuScreen.show()
    } else if (machine.state === 'paused') {
      pauseScreen.show()
    }
  }

  // ---- visibilité de l'arène ----------------------------------------------

  // Menu et réglages tombent sur un fond nu ; les écrans de run (cartes,
  // pause, game over) gardent l'arène gelée derrière eux.
  let arenaShown = true
  function syncArenaVisibility(): void {
    const visible = !settingsOpen && machine.state !== 'menu'
    if (visible === arenaShown) {
      return
    }
    arenaShown = visible
    canvas.classList.toggle('hidden', !visible)
    hud.setVisible(visible)
  }

  // Masqué pendant le jeu effectif (`playing`, `dying`) ET pendant le décompte
  // de reprise : sans cela le curseur système reparaîtrait pour 1,8 s à chaque
  // vague. Conséquence voulue — `stage.setAimTarget` est conditionné à
  // `cursorHidden`, donc le réticule peut s'afficher pendant le décompte. Pas
  // tout de suite après un clic : `beginCountdown()` appelle
  // `mouse.forgetTarget()`, qui rend `mouse.target()` nul jusqu'au prochain
  // `pointermove` — délibéré, ça protège le premier pas de simulation (voir
  // ce commentaire). Le réticule reparaît dès que le joueur bouge la souris.
  let cursorHidden = false
  function syncCursorVisibility(): void {
    const hidden =
      machine.state === 'playing' || machine.state === 'dying' || machine.state === 'countdown'
    if (hidden === cursorHidden) {
      return
    }
    cursorHidden = hidden
    document.body.classList.toggle('cursor-hidden', hidden)
  }

  menuScreen.show()
  stage.setSkin(readSkin(readUnlocked()))
  syncArenaVisibility()
  syncCursorVisibility()

  // ---- réaction aux événements de simulation ----------------------------

  function onWaveEnded(wave: number): void {
    machine.send('WAVE_END')
    // Rng dérivé de la graine et de la vague, jamais `world.rng` : le tirage
    // des cartes ne doit pas consommer le flux déterministe de la simulation (spec §3.5).
    const rng = createRng(run.seed + wave)
    const cards = drawUpgrades(rng, {
      wave,
      ownedIds,
      mythicTaken,
      seenPowerups: tracker.trace.powerupsPicked,
    })
    upgradeScreen.show(cards, wave, onCardChosen)
  }

  function onCardChosen(card: UpgradeDef): void {
    card.apply(run.stats)
    ownedIds.push(card.id)
    if (card.rarity === 'mythic') {
      mythicTaken = true
    }
    machine.send('UPGRADE_CHOSEN')
    upgradeScreen.hide()
    beginCountdown()
  }

  function onEnterGameOver(): void {
    // Un bandeau encore à l'écran quand l'animation de mort s'achève y
    // resterait figé : `badge.update` ne tourne qu'en `playing`/`dying`/
    // `countdown` (voir la boucle de rendu), le HUD reste visible derrière
    // l'écran de fin (`syncArenaVisibility`), et le seul autre nettoyage est
    // celui de `startRun()` — c'est-à-dire la partie SUIVANTE. Le
    // récapitulatif reliste de toute façon ce que le bandeau montrait.
    badge.clear()
    const best = finalizeBestScore()
    gameOverScreen.show(
      {
        score: Math.round(run.world.score),
        wave: run.world.wave,
        kills: tracker.trace.kills,
        durationMs: run.world.time,
        best,
        unlocked: unlockedThisRun,
      },
      (): void => {
        startRun()
        machine.send('RESTART')
        gameOverScreen.hide()
      },
      (): void => {
        machine.send('QUIT')
        gameOverScreen.hide()
        startRun()
        menuScreen.show()
      },
    )
  }

  function handleSimEvents(): void {
    for (const event of run.world.events) {
      if (event.type === 'waveEnded') {
        onWaveEnded(event.wave)
      } else if (event.type === 'playerDied') {
        machine.send('DIED')
        deathSequence.start(
          run.world,
          event.x,
          event.y,
          run.world.arena.width,
          run.world.arena.height,
        )
      }
    }
  }

  // ---- boucle à pas fixe --------------------------------------------------

  const loop = createFixedLoop({
    onStep(): void {
      if (machine.state === 'playing') {
        // Une seule source par pas, jamais deux : la souris ayant toujours une
        // position et le téléphone bougeant sous le pouce, les composer
        // tirerait le point en continu.
        const source =
          movementInput === 'joystick' ? joystick : movementInput === 'mouse' ? mouse : keyboard
        source.writeInto(run.world.input, playerMotion())
        stepWorld(run.world, run.stats)
        applyJuice(run.world, {
          camera: stage.camera,
          particles: stage.particles,
          flash: stage.flash,
          shockwaves: stage.shockwaves,
          frostStars: stage.frostStars,
          punch: (strength: number): void => hud.punch(strength),
          motionEnabled: !reducedMotion,
        })
        applyAudio(run.world, audio, voiceBudget)
        // Avant `handleSimEvents` : celui-ci tire les cartes d'amélioration
        // depuis `tracker.trace` (via `onWaveEnded`), qui doit donc déjà avoir
        // absorbé les ramassages de ce pas — sinon un power-up capté sur le
        // tick exact où la vague se termine manque au tirage.
        const opened = tracker.step(run.world)
        unlockedThisRun.push(...opened)
        // Rien au bandeau quand le pas courant est celui de la mort : les
        // trois succès qui ne se décident que là — Page blanche, Faux départ,
        // Retour à l'encrier — n'ont pas de bandeau, et c'est voulu, le
        // récapitulatif de fin les annonce. On lit `trace.died` et non l'état
        // de la machine : `tracker.step` passe AVANT `handleSimEvents`, donc
        // la machine est encore en `playing` à cet instant. La condition ne
        // dépend d'aucun `def` : elle garde la boucle, elle n'est pas dedans.
        if (!tracker.trace.died) {
          for (const def of opened) {
            badge.push(def)
          }
        }
        handleSimEvents()
      }
    },
    onRender(alpha): void {
      // Rouvre le plafond de voix : `onRender` est appelé exactement une fois
      // par image, quel que soit le nombre de pas qui viennent de passer.
      resetVoiceBudget(voiceBudget)
      syncArenaVisibility()
      syncCursorVisibility()
      // Visible uniquement quand le joystick commande vraiment quelque chose.
      const joystickShown = movementInput === 'joystick' && machine.state === 'playing'
      joystickHalo.setVisible(joystickShown)
      if (joystickShown) {
        joystickHalo.setOrigin(joystick.origin())
      }
      if (!arenaShown) {
        return
      }
      // Le réticule suit exactement l'état du curseur système qu'il remplace.
      stage.setAimTarget(movementInput === 'mouse' && cursorHidden ? mouse.target() : null)
      // Alpha figé à 1 hors de `playing` : interpoler `PrevPosition → Position`
      // quand aucun pas de simulation n'a lieu (décompte, pause) ferait vibrer
      // un monde gelé entre deux positions distinctes d'un pas.
      stage.sync(run.world, machine.state === 'playing' ? alpha : 1)
      hud.update({
        score: run.world.score,
        wave: run.world.wave,
        combo: run.world.combo,
        comboTimer: run.world.comboTimer,
        waveElapsed: run.world.waveElapsed,
        time: run.world.time,
      })
    },
  })

  // Un joueur en mode souris (`mouse`, voir plus haut) peut lancer et jouer
  // toute une partie au clic, sans jamais toucher une touche : le clic sur
  // « Jouer » doit donc, lui aussi, servir de geste de déverrouillage.
  window.addEventListener('pointerdown', (): void => audio.unlock())

  // ---- routage clavier ----------------------------------------------------

  window.addEventListener('keydown', (e: KeyboardEvent): void => {
    // Les navigateurs refusent de démarrer un AudioContext sans geste
    // utilisateur. `unlock` est idempotent : l'appeler à chaque touche ne
    // coûte rien une fois le contexte repris.
    audio.unlock()

    if (CONSUMABLE_CODES.has(e.code)) {
      e.preventDefault()
    }

    if (settingsOpen) {
      settingsScreen.handleKey(e.code)
      return
    }

    // La séquence de mort est interruptible : sur des relances répétées, une
    // animation incompressible devient vite une punition (spec §3.3).
    if (machine.state === 'dying') {
      deathSequence.finish()
      return
    }

    if (machine.state === 'menu' && menuScreen.handleKey(e.code)) {
      return
    }
    if (machine.state === 'wavePause' && upgradeScreen.handleKey(e.code)) {
      return
    }
    if (machine.state === 'gameover' && gameOverScreen.handleKey(e.code)) {
      return
    }
    if (machine.state === 'paused' && pauseScreen.handleKey(e.code)) {
      return
    }

    // Volontairement pas depuis `wavePause` : la machine à états n'a pas de
    // retour de `paused` vers `wavePause`, y entrer perdrait la carte en cours
    // de choix. Depuis `countdown`, en revanche, remettre en pause est le
    // comportement attendu — le joueur n'a pas encore repris la main.
    if (e.code === 'Escape' && (machine.state === 'playing' || machine.state === 'countdown')) {
      countdownScreen.hide()
      machine.send('PAUSE')
      pauseScreen.show()
    }
  })

  // ---- boucle de rendu et minuteur de mort --------------------------------

  let last = performance.now()
  const frame = (now: number): void => {
    // Plafonné ici, à la source, pour `loop.advance` ET `deathSequence.update` :
    // un onglet remis au premier plan pendant la mort livrait sinon un `dt`
    // énorme à `deathSequence.update`, écrasant toute sa mise en scène sur une seule frame.
    const dt = Math.min(now - last, MAX_CATCHUP_MS)
    last = now

    if (machine.state === 'dying') {
      deathSequence.update(dt, {
        particles: stage.particles,
        flash: stage.flash,
        shockwaves: stage.shockwaves,
        motionEnabled: !reducedMotion,
      })
      // Blanchiment limité à la phase freeze ; les ennemis redeviennent rouges au fil de l'onde.
      stage.setDeathState({
        detonated: deathSequence.detonated,
        whiten: deathSequence.phase === 'freeze' ? 1 : 0,
        playerGone: deathSequence.playerGone,
      })
      if (deathSequence.done) {
        // Pas de reset ici : l'écran de fin se pose sur l'arène déjà vidée par la séquence ; `startRun` s'en charge.
        machine.send('DEATH_ANIM_DONE')
        onEnterGameOver()
      }
    }

    if (machine.state === 'countdown') {
      const before = countdown.digit
      countdown.update(dt)
      const digit = countdown.digit
      // Le tic du premier chiffre est joué par `beginCountdown` ; ici, seuls
      // les changements. `digit > 0` : la fin du décompte n'a pas son tic à
      // elle, c'est le jeu qui reprend qui la signale.
      if (digit !== before && digit > 0) {
        playCountdownTick(digit)
      }
      countdownScreen.update(digit)
      if (countdown.done) {
        machine.send('COUNTDOWN_DONE')
        countdownScreen.hide()
      }
    }

    // Le bandeau n'avance que si le joueur regarde vraiment l'arène — la
    // même question que `cursorHidden` plus haut, donc la même réponse
    // (`playing`, `dying`, `countdown`) plutôt qu'une deuxième liste : sur
    // l'horloge réelle et sans ce garde-fou, un bandeau ouvert juste avant
    // une pause ou l'écran de cartes finirait de défiler derrière l'écran,
    // et le joueur ne le lirait jamais. `dying` reste dedans : c'est là que
    // la simulation s'arrête, et le bandeau doit pouvoir finir sa rotation.
    if (machine.state === 'playing' || machine.state === 'dying' || machine.state === 'countdown') {
      badge.update(dt)
    }
    loop.advance(dt)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  function applyLayout(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    const quarters = resolveDisplayQuarters({ coarsePointer, windowWidth: w, windowHeight: h })
    // Dimensions vues par le jeu APRÈS rotation : c'est sur elles que se
    // calculent le zoom et la résolution du canvas.
    const viewW = quarters === 1 ? h : w
    const viewH = quarters === 1 ? w : h

    // Pilotée en JS et non en CSS : `100vh` sur mobile désigne la fenêtre
    // « large », barre d'URL exclue, et ne coïncide pas avec `innerHeight`.
    // Les deux valeurs doivent être identiques, sinon le canvas et son cadre
    // CSS se désaccordent de quelques pixels.
    if (quarters === 1) {
      appRoot.style.width = `${viewW}px`
      appRoot.style.height = `${viewH}px`
      appRoot.style.transformOrigin = 'top left'
      appRoot.style.transform = `translateX(${w}px) rotate(90deg)`
    } else {
      appRoot.style.width = ''
      appRoot.style.height = ''
      appRoot.style.transformOrigin = ''
      appRoot.style.transform = ''
    }

    // Dimensions inversées ici aussi : sans ça la résolution du canvas ne suit
    // pas la rotation et le rendu est flou en portrait pivoté.
    stage.resize(viewW, viewH)
    const viewport = computeViewport(viewW, viewH, arena.width, arena.height)
    stage.setViewport(viewport)
    hud.setViewport(viewport)
    const display: Display = { quarters, windowWidth: w, windowHeight: h }
    // Sans ces deux lignes, la conversion écran→arène resterait calée sur
    // l'ancien zoom et sur l'ancienne rotation.
    mouse.setViewport(viewport)
    mouse.setDisplay(display)
    joystick.setViewport(viewport)
    joystick.setDisplay(display)
  }

  // Redimensionner ne change que le zoom et la rotation, jamais les
  // dimensions de l'arène : celles-ci sont figées à la création du monde.
  window.addEventListener('resize', applyLayout)
  applyLayout()
}
