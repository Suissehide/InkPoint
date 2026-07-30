import { detectLocale, setLocale } from '@/i18n'
import { createStage } from '@/render/stage'
import { computeViewport } from '@/render/viewport'
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
import { applyJuice, createJuiceState, DEATH_SLOWMO_MS, timeScaleFor } from './juice'
import { createKeyboard } from './keyboard'
import { createFixedLoop } from './loop'
import { storage } from './storage'

// Codes gérés par les écrans/la pause : on empêche leur comportement natif
// (barre d'espace qui fait défiler la page, par ex.) sans toucher aux autres
// touches, pour rester une page plein écran cohérente au clavier seul.
const CONSUMABLE_CODES = new Set([
  'Space',
  'Enter',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

/** Un « run » complet : le monde, ses stats modifiables et la graine qui l'a produit. */
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

/**
 * Assemble le monde, les stats de run, la machine à états, la scène, le HUD et
 * les écrans : point d'entrée unique du jeu, appelé depuis `src/main.ts`.
 */
export async function startGame({ canvas, uiRoot }: GameOptions): Promise<void> {
  // Choix stocké > langue du navigateur > anglais (spec §5) : sans cet appel,
  // le jeu démarrerait toujours en anglais quel que soit le réglage précédent
  // du joueur.
  setLocale(detectLocale(navigator.language, storage.get<string | null>('locale', null)))

  const machine = createGameStateMachine()
  const stage = await createStage(canvas)
  const hud = createHud(uiRoot)
  const keyboard = createKeyboard()
  const juice = createJuiceState()

  // Réglage explicite > préférence système `prefers-reduced-motion` > actif
  // (voir `src/ui/a11y.ts`) : sans ça, un joueur qui a activé la préférence
  // système au niveau de l'OS démarrait quand même avec tous les effets.
  let reducedMotion = resolveReducedMotion()
  stage.setEffects({ enabled: !reducedMotion })
  // La classe reflète le réglage résolu (pas seulement la media query système)
  // sur `<html>` : c'est ce qui coupe le pouls CSS de la carte mythique
  // (main.css) même quand seul le réglage explicite du menu est actif.
  document.documentElement.classList.toggle('reduced-motion', reducedMotion)

  let run = createRun()
  let ownedIds: string[] = []
  let mythicTaken = false
  let seenPowerups = new Set<PowerUpKind>()
  let killCount = 0
  let deathTimer = 0
  let settingsOpen = false

  function startRun(): void {
    run = createRun()
    ownedIds = []
    mythicTaken = false
    seenPowerups = new Set()
    killCount = 0
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

  // Canvas et HUD ne s'affichent qu'à l'intérieur d'une run : menu et réglages
  // tombent sur un fond nu, les écrans de run (cartes, pause, game over)
  // gardent l'arène gelée derrière eux.
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

  // Le curseur système est du bruit pendant une partie jouée : le jeu ne se
  // vise pas à la souris (spec « souris dans les menus »). Il ne disparaît
  // que pendant le jeu effectif — `playing` et `dying` (le ralenti de mort
  // n'affiche aucun écran) — et reparaît dès qu'un écran reprend la main :
  // menu, réglages, pause, choix de carte, game over.
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
    // Un Rng dérivé de la graine et de la vague, pas `world.rng` : le tirage
    // des cartes ne doit jamais consommer le flux déterministe de la
    // simulation elle-même (spec §3.5, prérequis du netcode v3).
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
        deathTimer = DEATH_SLOWMO_MS
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
        keyboard.writeInto(run.world.input)
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
        handleSimEvents()
      }
      // Tout autre état (menu, wavePause, dying, paused, gameover) ne fait pas
      // avancer la simulation : elle reste gelée tant que l'écran au-dessus
      // n'a pas rendu la main.
    },
    onRender(alpha): void {
      syncArenaVisibility()
      syncCursorVisibility()
      if (!arenaShown) {
        return
      }
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

  // ---- routage clavier ----------------------------------------------------

  window.addEventListener('keydown', (e: KeyboardEvent): void => {
    if (CONSUMABLE_CODES.has(e.code)) {
      e.preventDefault()
    }

    if (settingsOpen) {
      settingsScreen.handleKey(e.code)
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

    // Aucun écran n'a consommé la touche : `Échap` bascule pause/reprise
    // pendant une partie. Volontairement pas depuis `wavePause` — la machine
    // à états n'a pas de retour de `paused` vers `wavePause`, y entrer
    // perdrait la carte en cours de choix.
    if (e.code === 'Escape' && machine.state === 'playing') {
      machine.send('PAUSE')
      pauseScreen.show()
    }
  })

  // ---- boucle de rendu et minuteur de mort --------------------------------

  let last = performance.now()
  const frame = (now: number): void => {
    const dt = now - last
    last = now

    if (machine.state === 'dying') {
      deathTimer -= dt
      if (deathTimer <= 0) {
        machine.send('DEATH_ANIM_DONE')
        onEnterGameOver()
      }
    }

    loop.advance(dt)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // Rejoue la mise en page complète : taille du renderer, puis zoom/centrage
  // de l'arène fixe dans cette nouvelle taille de fenêtre.
  function applyLayout(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    stage.resize(w, h)
    const viewport = computeViewport(w, h, ARENA.width, ARENA.height)
    stage.setViewport(viewport, ARENA.width, ARENA.height)
    hud.setViewport(viewport)
  }

  // L'arène ne change plus jamais de taille : redimensionner la fenêtre ne
  // modifie que le zoom, plus la difficulté.
  window.addEventListener('resize', applyLayout)
  applyLayout()
}
