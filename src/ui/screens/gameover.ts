import { onLocaleChange, t } from '@/i18n'
import { formatDuration, formatScore } from '../format'
import { renderNumber } from '../numeral'

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

/** `Espace` relance immédiatement, sans confirmation ni repasser par le menu (spec §4.2). `Échap` retourne au menu. */
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

  // Pas de sélection partagée ici (spec §4.2 : `Espace`/`Échap` déclenchent
  // chacun directement leur action) — `data-action`, pas `data-nav-index` :
  // pas de `MenuNav` à tenir en phase.
  const render = (): void => {
    el.innerHTML = `
      <div class="text-[10px] tracking-[0.3em] opacity-45">${t('game.title')}</div>
      <h2 class="text-3xl tracking-wide">${t('gameover.title')}</h2>
      <div class="text-4xl">${renderNumber(formatScore(stats.score))}</div>
      <div class="text-xs tracking-[0.12em] opacity-70">${t('gameover.stats', {
        wave: stats.wave,
        kills: stats.kills,
        time: formatDuration(stats.durationMs),
      })}</div>
      <div class="text-xs tracking-[0.12em] opacity-45">${t('gameover.best', { n: formatScore(stats.best) })}</div>
      <div data-action="restart" class="mt-4 cursor-pointer text-[11px] tracking-[0.18em] opacity-45 transition-opacity hover:opacity-80">${t('gameover.restart')}</div>
      <div data-action="menu" class="cursor-pointer text-[11px] tracking-[0.18em] opacity-45 transition-opacity hover:opacity-80">${t('gameover.menu')}</div>
    `
    // Écouteur posé directement sur CHAQUE rappel, jamais délégué sur `el`
    // (même risque qu'une délégation basée sur la bulle, voir
    // `bindItemActivation` dans `menu-nav.ts`). Reposé à chaque redessin :
    // `innerHTML` détruit les nœuds précédents et leurs écouteurs.
    for (const item of el.querySelectorAll<HTMLElement>('[data-action]')) {
      const action = item.dataset.action
      if (action === 'restart') {
        item.addEventListener('click', () => restart())
      } else if (action === 'menu') {
        item.addEventListener('click', () => toMenu())
      }
    }
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
