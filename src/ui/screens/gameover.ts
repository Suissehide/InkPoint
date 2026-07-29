import { onLocaleChange, t } from '@/i18n'
import { formatDuration, formatScore } from '../format'
import { renderText } from '../numeral'

export interface GameOverStats {
  score: number
  wave: number
  kills: number
  durationMs: number
  best: number
}

export interface GameOverScreen {
  show(stats: GameOverStats, onRestart: () => void, onMenu: () => void): void
  hide(): void
  handleKey(code: string): boolean
}

/**
 * `Espace` relance immédiatement, sans repasser par le menu : dans ce genre de
 * jeu, chaque seconde entre la mort et la run suivante fait abandonner des
 * joueurs (spec §4.2). `Échap` retourne au menu.
 */
export function createGameOverScreen(root: HTMLElement): GameOverScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-3 bg-ink-deep/85 text-paper backdrop-blur-sm'
  root.appendChild(el)

  let stats: GameOverStats = { score: 0, wave: 1, kills: 0, durationMs: 0, best: 0 }
  // Remplacés par `show()` avant qu'aucune touche ne puisse les déclencher.
  let restart: () => void = () => {
    /* no-op tant que `show()` n'a pas fourni de vrai callback */
  }
  let toMenu: () => void = () => {
    /* no-op tant que `show()` n'a pas fourni de vrai callback */
  }

  // `renderText` partout (pas seulement `renderNumber` sur les nombres) :
  // « L'encre a séché » et « Échap » sont accentués et ponctués, invisibles
  // en `Ink Pen` telle quelle (voir `numeral.ts`).
  const render = (): void => {
    el.innerHTML = `
      <div class="text-[10px] tracking-[0.3em] opacity-45">${renderText(t('game.title'))}</div>
      <h2 class="font-display text-3xl tracking-wide">${renderText(t('gameover.title'))}</h2>
      <div class="font-display text-4xl">${renderText(formatScore(stats.score))}</div>
      <div class="text-xs tracking-[0.12em] opacity-70">${renderText(
        t('gameover.stats', {
          wave: stats.wave,
          kills: stats.kills,
          time: formatDuration(stats.durationMs),
        }),
      )}</div>
      <div class="text-xs tracking-[0.12em] opacity-45">${renderText(
        t('gameover.best', { n: formatScore(stats.best) }),
      )}</div>
      <div class="mt-4 text-[11px] tracking-[0.18em] opacity-45">${renderText(t('gameover.restart'))}</div>
      <div class="text-[11px] tracking-[0.18em] opacity-45">${renderText(t('gameover.menu'))}</div>
    `
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  return {
    show(next, onRestart, onMenu): void {
      stats = next
      restart = onRestart
      toMenu = onMenu
      el.classList.remove('hidden')
      el.classList.add('flex')
      render()
    },

    hide(): void {
      el.classList.add('hidden')
      el.classList.remove('flex')
    },

    handleKey(code: string): boolean {
      if (el.classList.contains('hidden')) {
        return false
      }
      if (code === 'Space' || code === 'Enter') {
        restart()
        return true
      }
      if (code === 'Escape') {
        toMenu()
        return true
      }
      return false
    },
  }
}
