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

  // `Fh Ink` (`font-display`) est réservé au titre « INK POINT » (voir
  // `menu.ts`) : partout ailleurs ici, y compris « L'encre a séché », c'est
  // du texte d'interface traduit, en `font-ui` (Kalam), qui dessine ses
  // accents et sa ponctuation directement — plus besoin de détour par
  // `renderText`. Seul le score passe encore par `renderNumber`, pour la
  // largeur de chiffre stable (voir `numeral.ts`).
  // Ni flèches ni sélection ici (spec §4.2 : `Espace` et `Échap` déclenchent
  // chacun directement leur propre action, il n'y a jamais eu de curseur à
  // faire coïncider entre clavier et souris). Le clic sur chaque rappel de
  // touche déclenche donc la même action que la touche qu'il rappelle —
  // `data-action` plutôt que `data-nav-index` : pas de `MenuNav` à tenir en
  // phase ici.
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
    // Écouteur posé directement sur CHAQUE rappel, jamais délégué sur `el` :
    // `Space` relance en une frappe, sans confirmation (le commentaire
    // au-dessus) — c'est précisément l'écran où une activation par
    // délégation qui relirait un état partagé au moment du clic serait la
    // plus coûteuse à rater (relance/retour au menu, tous deux irréversibles
    // pour la run). Repose à chaque redessin, `innerHTML` détruisant les
    // nœuds précédents (et leurs écouteurs) — voir `bindItemActivation` dans
    // `menu-nav.ts` pour le même principe appliqué aux autres écrans.
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
