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
  /**
   * Les succès de la partie, en GRILLE et non en lignes centrées : chaque
   * ligne centrée pour elle-même produisait un escalier, parce qu'un succès
   * honorifique n'a ni pictogramme ni récompense et que sa ligne était donc
   * plus courte que les autres. Trois colonnes fixes — pictogramme, titre,
   * tracé — alignent les trois quelle que soit la composition.
   *
   * L'intitulé « DÉBLOQUÉ » est porté UNE fois par la section, au lieu d'être
   * répété sur chaque ligne : répété, il pesait plus lourd que les noms qu'il
   * qualifiait. Le filet au-dessus détache le tout du bloc de score — c'est le
   * moment de récompense de l'écran, il ne doit pas se lire comme une
   * quatrième ligne de statistiques.
   */
  const renderUnlocked = (): string => {
    if (stats.unlocked.length === 0) {
      return ''
    }
    const lines = stats.unlocked
      .map((def) => {
        const glyph = def.skin
          ? `<span class="text-[calc(var(--ui)*1.2)] leading-none"><svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg></span>`
          : ''
        const reward = def.skin
          ? `<span class="ui-2xs whitespace-nowrap opacity-60">${t(`skin.${def.skin}.name`)}</span>`
          : '<span></span>'
        return `<span class="flex items-center justify-center">${glyph}</span>
          <span class="ui-sm text-left leading-tight">${t(`achievement.${def.id}.name`)}</span>
          ${reward}`
      })
      .join('')
    return `
      <div class="mt-[calc(var(--ui)*0.5)] flex flex-col items-center gap-[calc(var(--ui)*0.45)]">
        <div class="h-px w-[calc(var(--ui)*9)] bg-paper/20"></div>
        <div class="ui-2xs tracking-[0.3em] opacity-45">${t('achievements.unlocked')}</div>
        <div class="grid grid-cols-[calc(var(--ui)*1.6)_auto_auto] items-center gap-x-[calc(var(--ui)*0.6)] gap-y-[calc(var(--ui)*0.25)]">
          ${lines}
        </div>
      </div>`
  }

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
      ${renderUnlocked()}
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
