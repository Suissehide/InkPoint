import type { AchievementDef } from '@/app/achievements/catalog'
import { onLocaleChange, t } from '@/i18n'
import { nibPath } from '@/render/views/nibs'
import { formatDuration, formatScore } from '../format'
import { renderNumber } from '../numeral'

export interface GameOverStats {
  score: number
  wave: number
  kills: number
  durationMs: number
  best: number
  /**
   * Les succès ouverts pendant la partie. La liste est complète : elle reliste
   * ce que le bandeau a déjà montré. Un joueur qui meurt trois secondes après
   * un déblocage ne doit pas avoir à se souvenir de ce qu'il a vu passer.
   */
  unlocked: readonly AchievementDef[]
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
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*0.6)] bg-ink-deep/85 text-paper backdrop-blur-sm'
  root.appendChild(el)

  let stats: GameOverStats = { score: 0, wave: 1, kills: 0, durationMs: 0, best: 0, unlocked: [] }
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
      <div class="ui-2xs tracking-[0.3em] opacity-45">${t('game.title')}</div>
      <h2 class="text-[calc(var(--ui)*2)] tracking-wide">${t('gameover.title')}</h2>
      <div class="text-[calc(var(--ui)*2.6)]">${renderNumber(formatScore(stats.score))}</div>
      <div class="ui-xs tracking-[0.12em] opacity-70">${t('gameover.stats', {
        wave: stats.wave,
        kills: stats.kills,
        time: formatDuration(stats.durationMs),
      })}</div>
      <div class="ui-xs tracking-[0.12em] opacity-45">${t('gameover.best', { n: formatScore(stats.best) })}</div>
      ${
        stats.unlocked.length === 0
          ? ''
          : `<div class="mt-[calc(var(--ui)*0.6)] flex flex-col items-center gap-[calc(var(--ui)*0.3)]">
        ${stats.unlocked
          .map((def) => {
            const glyph = def.skin
              ? `<span class="text-[calc(var(--ui)*1.2)]"><svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg></span>`
              : ''
            const reward = def.skin
              ? `<span class="ui-2xs opacity-60">${t('achievements.reward', { skin: t(`skin.${def.skin}.name`) })}</span>`
              : ''
            return `<div class="flex items-center gap-[calc(var(--ui)*0.5)]">
              ${glyph}
              <span class="ui-xs tracking-[0.12em]">${t(`achievement.${def.id}.name`)}</span>
              <span class="ui-2xs tracking-[0.2em] opacity-45">${t('gameover.unlocked')}</span>
              ${reward}
            </div>`
          })
          .join('')}
      </div>`
      }
      <div data-action="restart" class="ui-xs mt-[0.8em] cursor-pointer tracking-[0.18em] opacity-45 transition-opacity hover:opacity-80">${t('gameover.restart')}</div>
      <div data-action="menu" class="ui-xs cursor-pointer tracking-[0.18em] opacity-45 transition-opacity hover:opacity-80">${t('gameover.menu')}</div>
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
