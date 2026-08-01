import { applyAudio, createVoiceBudget, resetVoiceBudget } from '@/audio/apply'
import { createAudioEngine } from '@/audio/engine'
import { bindUiAudio } from '@/audio/ui'
import { detectLocale, setLocale } from '@/i18n'
import { createDeathSequence } from '@/render/fx/death-sequence'
import { createStage } from '@/render/stage'
import { computeViewport } from '@/render/viewport'
import { Movement, Position, Velocity } from '@/sim/components'
import { POWERUP_BY_ID, type PowerUpKind } from '@/sim/data/powerups'
import type { UpgradeDef } from '@/sim/data/upgrades'
import { createRng } from '@/sim/rng'
import { spawnPlayer } from '@/sim/spawn'
import { stepWorld } from '@/sim/step'
import { drawUpgrades } from '@/sim/upgrades/draw'
import { createRunStats, type RunStats } from '@/sim/upgrades/stats'
import { ARENA, createWorld, FIXED_DT, type SimWorld } from '@/sim/world'
import { resolveReducedMotion } from '@/ui/a11y'
import { createGameOverScreen } from '@/ui/screens/gameover'
import { createHud } from '@/ui/screens/hud'
import { createMenuScreen } from '@/ui/screens/menu'
import { createPauseScreen } from '@/ui/screens/pause'
import { createSettingsScreen } from '@/ui/screens/settings'
import { createUpgradeScreen } from '@/ui/screens/upgrade'
import { createGameStateMachine } from './game-state'
import { type MovementInput, type PlayerMotion, resolveMovementInput } from './input-source'
import { applyJuice, createJuiceState, resetJuiceState, timeScaleFor } from './juice'
import { createKeyboard } from './keyboard'
import { createFixedLoop, MAX_CATCHUP_MS } from './loop'
import { createMouse } from './mouse'
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

function createRun(): Run {
  const seed = Math.floor(Math.random() * 2 ** 31)
  const world = createWorld({ seed, width: ARENA.width, height: ARENA.height })
  spawnPlayer(world)
  return { world, stats: createRunStats(), seed }
}

export interface GameOptions {
  canvas: HTMLCanvasElement
  uiRoot: HTMLElement
}

export async function startGame({ canvas, uiRoot }: GameOptions): Promise<void> {
  // Choix stocké > langue du navigateur > anglais (spec §5).
  setLocale(detectLocale(navigator.language, storage.get<string | null>('locale', null)))

  const machine = createGameStateMachine()
  const stage = await createStage(canvas)
  const hud = createHud(uiRoot)
  const keyboard = createKeyboard()
  const mouse = createMouse()
  const juice = createJuiceState()
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
  let movementInput: MovementInput = resolveMovementInput()
  stage.setEffects({ enabled: !reducedMotion })
  // Cette classe sur `<html>` reflète le réglage résolu, pas seulement la media
  // query système : sans elle, un joueur qui coupe le mouvement dans les
  // réglages sans l'avoir demandé à son système garderait toutes les
  // animations CSS — pop du combo, transitions des cartes (main.css).
  document.documentElement.classList.toggle('reduced-motion', reducedMotion)

  let run = createRun()
  let ownedIds: string[] = []
  let mythicTaken = false
  let seenPowerups = new Set<PowerUpKind>()
  let killCount = 0
  let settingsOpen = false

  // Jouée sur l'horloge réelle pendant l'état `dying` : la simulation ne fait
  // plus un seul pas pendant ce temps.
  const deathSequence = createDeathSequence()

  function startRun(): void {
    run = createRun()
    resetJuiceState(juice)
    // Sinon les ennemis marqués détonés resteraient invisibles dans la nouvelle partie.
    stage.setDeathState(null)
    ownedIds = []
    mythicTaken = false
    seenPowerups = new Set()
    killCount = 0
  }

  /**
   * `?? 0` satisfait `noUncheckedIndexedAccess` sans assertion non-nulle
   * (interdite hors de `src/sim/`) ; jamais atteint en pratique.
   */
  function playerMotion(): PlayerMotion {
    const eid = run.world.playerEid
    return {
      x: Position.x[eid] ?? 0,
      y: Position.y[eid] ?? 0,
      vx: Velocity.x[eid] ?? 0,
      vy: Velocity.y[eid] ?? 0,
      friction: Movement.friction[eid] ?? 0,
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
  })

  const upgradeScreen = createUpgradeScreen(uiRoot)
  const gameOverScreen = createGameOverScreen(uiRoot)

  const pauseScreen = createPauseScreen(uiRoot, {
    onResume(): void {
      // Sinon le premier pas viserait le bouton qu'on vient de cliquer.
      mouse.forgetTarget()
      machine.send('RESUME')
      pauseScreen.hide()
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

  // Masqué uniquement pendant le jeu effectif (`playing`, `dying` — ce
  // dernier n'affiche aucun écran) ; reparaît dès qu'un écran reprend la main.
  let cursorHidden = false
  function syncCursorVisibility(): void {
    const hidden = machine.state === 'playing' || machine.state === 'dying'
    if (hidden === cursorHidden) {
      return
    }
    cursorHidden = hidden
    document.body.classList.toggle('cursor-hidden', hidden)
  }

  menuScreen.show()
  syncArenaVisibility()
  syncCursorVisibility()

  // ---- réaction aux événements de simulation ----------------------------

  function onWaveEnded(wave: number): void {
    machine.send('WAVE_END')
    // Rng dérivé de la graine et de la vague, jamais `world.rng` : le tirage
    // des cartes ne doit pas consommer le flux déterministe de la simulation (spec §3.5).
    const rng = createRng(run.seed + wave)
    const cards = drawUpgrades(rng, { wave, ownedIds, mythicTaken, seenPowerups })
    upgradeScreen.show(cards, wave, onCardChosen)
  }

  function onCardChosen(card: UpgradeDef): void {
    card.apply(run.stats)
    ownedIds.push(card.id)
    if (card.rarity === 'mythic') {
      mythicTaken = true
    }
    // Sinon le premier pas viserait la carte qu'on vient de cliquer.
    mouse.forgetTarget()
    machine.send('UPGRADE_CHOSEN')
    upgradeScreen.hide()
  }

  function onEnterGameOver(): void {
    const best = finalizeBestScore()
    gameOverScreen.show(
      {
        score: Math.round(run.world.score),
        wave: run.world.wave,
        kills: killCount,
        durationMs: run.world.time,
        best,
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
        deathSequence.start(run.world, event.x, event.y, ARENA.width, ARENA.height)
      } else if (event.type === 'enemyKilled') {
        killCount += 1
      } else if (event.type === 'powerupPicked') {
        const kind = POWERUP_BY_ID[event.kind]
        if (kind) {
          seenPowerups.add(kind)
        }
      }
    }
  }

  // ---- boucle à pas fixe --------------------------------------------------

  const loop = createFixedLoop({
    onStep(): void {
      if (machine.state === 'playing') {
        // Une seule source par pas, jamais les deux : la souris ayant toujours
        // une position, les composer tirerait le point en continu.
        const source = movementInput === 'mouse' ? mouse : keyboard
        source.writeInto(run.world.input, playerMotion())
        run.world.timeScale = timeScaleFor(juice, FIXED_DT)
        stepWorld(run.world, run.stats)
        applyJuice(run.world, juice, {
          camera: stage.camera,
          particles: stage.particles,
          flash: stage.flash,
          shockwaves: stage.shockwaves,
          punch: (strength: number): void => hud.punch(strength),
          motionEnabled: !reducedMotion,
        })
        applyAudio(run.world, audio, voiceBudget)
        handleSimEvents()
      }
    },
    onRender(alpha): void {
      // Rouvre le plafond de voix : `onRender` est appelé exactement une fois
      // par image, quel que soit le nombre de pas qui viennent de passer.
      resetVoiceBudget(voiceBudget)
      syncArenaVisibility()
      syncCursorVisibility()
      if (!arenaShown) {
        return
      }
      // Le réticule suit exactement l'état du curseur système qu'il remplace.
      stage.setAimTarget(movementInput === 'mouse' && cursorHidden ? mouse.target() : null)
      stage.sync(run.world, alpha)
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
    // retour de `paused` vers `wavePause`, y entrer perdrait la carte en cours de choix.
    if (e.code === 'Escape' && machine.state === 'playing') {
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

    loop.advance(dt)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  function applyLayout(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    stage.resize(w, h)
    const viewport = computeViewport(w, h, ARENA.width, ARENA.height)
    stage.setViewport(viewport)
    hud.setViewport(viewport)
    // Sans cette ligne, la conversion écran→arène resterait calée sur l'ancien zoom.
    mouse.setViewport(viewport)
  }

  // L'arène a une taille fixe : redimensionner ne change que le zoom, jamais la difficulté.
  window.addEventListener('resize', applyLayout)
  applyLayout()
}
