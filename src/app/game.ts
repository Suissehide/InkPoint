import { detectLocale, setLocale } from '@/i18n'
import { createStage } from '@/render/stage'
import { POWERUP_BY_ID, type PowerUpKind } from '@/sim/data/powerups'
import type { UpgradeDef } from '@/sim/data/upgrades'
import { createRng } from '@/sim/rng'
import { spawnPlayer } from '@/sim/spawn'
import { stepWorld } from '@/sim/step'
import { drawUpgrades } from '@/sim/upgrades/draw'
import { createRunStats, type RunStats } from '@/sim/upgrades/stats'
import { createWorld, FIXED_DT, type SimWorld } from '@/sim/world'
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
  const world = createWorld({ seed, width: window.innerWidth, height: window.innerHeight })
  spawnPlayer(world)
  return { world, stats: createRunStats(), seed }
}

export interface GameOptions {
  canvas: HTMLCanvasElement
  uiRoot: HTMLElement
}

/**
 * Assemble le monde, les stats de run, la machine à états, la scène, le HUD et
 * les écrans. Point d'entrée unique du jeu (Task 20) : tout ce que
 * `src/main.ts` faisait directement avant cette tâche vit maintenant ici.
 */
export async function startGame({ canvas, uiRoot }: GameOptions): Promise<void> {
  // Choix stocké > langue du navigateur > anglais (spec §5). Rien de tout ça
  // n'était encore branché avant cette tâche : sans cet appel, le jeu démarrait
  // toujours en anglais quel que soit le réglage précédent du joueur.
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

  menuScreen.show()

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
          motionEnabled: !reducedMotion,
        })
        handleSimEvents()
      } else if (machine.state === 'menu' && !settingsOpen) {
        // Le jeu tourne en fond au ralenti derrière le menu (spec §4.2) : pas
        // d'entrée clavier écrite, un `timeScale` fixe plutôt que dérivé du
        // hitstop/ralenti de mort (qui n'ont pas de sens hors d'une run jouée).
        run.world.timeScale = 0.25
        stepWorld(run.world, run.stats)
      }
      // Tout autre état (wavePause, dying, paused, gameover) ne fait pas
      // avancer la simulation : elle reste gelée tant que l'écran au-dessus
      // n'a pas rendu la main.
    },
    onRender(alpha): void {
      stage.sync(run.world, alpha)
      hud.update({
        score: run.world.score,
        wave: run.world.wave,
        combo: run.world.combo,
        waveElapsed: run.world.waveElapsed,
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
    // à états (Task 13) n'a pas de retour de `paused` vers `wavePause`, y
    // entrer perdrait la carte en cours de choix (voir rapport de tâche).
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

  window.addEventListener('resize', (): void => {
    run.world.arena.width = window.innerWidth
    run.world.arena.height = window.innerHeight
    stage.resize(window.innerWidth, window.innerHeight)
  })
}
