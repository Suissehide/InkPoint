import type { LeaderboardEntry } from '@/app/leaderboard-client'
import { onLocaleChange, t } from '@/i18n'
import { formatScore } from '../format'

/** Ce que reçoit le panneau : cent lignes au plus, plus la ligne du joueur quand elle en est absente. */
export interface LeaderboardData {
  top: LeaderboardEntry[]
  you?: LeaderboardEntry
}

export interface LeaderboardPanel {
  /**
   * `highlight` est le pseudo à mettre en évidence — celui qu'on vient de publier. Cherché
   * dans `top` par égalité de pseudo : le classement ne garde qu'une ligne par pseudo
   * (meilleure run), donc l'égalité suffit à désigner une ligne unique.
   */
  show(data: LeaderboardData, highlight?: string): void
  hide(): void
  showError(): void
  showLoading(): void
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; data: LeaderboardData; highlight?: string }

/**
 * Construit une ligne en DOM réel, jamais en chaîne assemblée d'un bout à l'autre : le rang
 * et le score viennent du serveur mais sont des valeurs connues (un entier, un nombre), donc
 * posés par gabarit comme le reste de l'interface. Le
 * pseudo, LUI, est du texte libre que le serveur n'assainit pas (spec §11) — un joueur peut
 * publier `<img src=x onerror=…>` — et n'entre donc JAMAIS dans une chaîne HTML : il est posé
 * après coup via `textContent`, sur un nœud dédié qu'aucun gabarit ne construit à partir de
 * lui. Changer ce `textContent` en `innerHTML` doit faire rougir la suite de tests
 * (falsification du brief) — c'est le seul endroit du fichier où cette bascule aurait un
 * sens, et donc le seul qui mérite d'être gardé par un test.
 */
function buildRow(entry: LeaderboardEntry, highlighted: boolean): HTMLElement {
  const el = document.createElement('div')
  el.dataset.row = ''
  el.className = `grid grid-cols-[2.5em_1fr_auto] items-center gap-x-[0.6em] rounded px-[0.5em] py-[0.4em] ${
    highlighted ? 'bg-paper/15 ring-1 ring-paper/40' : ''
  }`
  el.innerHTML = `
    <span class="ui-xs tabular-nums opacity-60">${entry.rank}</span>
    <span data-nickname class="ui-sm truncate"></span>
    <span class="ui-sm tabular-nums text-right">${formatScore(entry.score)}</span>
  `
  const nicknameSlot = el.querySelector<HTMLElement>('[data-nickname]')
  if (nicknameSlot) {
    nicknameSlot.textContent = entry.nickname
  }
  if (highlighted) {
    el.dataset.highlighted = ''
  }
  return el
}

/**
 * Le panneau de classement : pure présentation, branchée sur des données déjà chargées. Il ne
 * connaît ni `fetch` ni le service de classement (`app/leaderboard-client.ts`, tâche 4) — cette
 * séparation permet de le tester en lui donnant des données à la main, sans serveur ni mock
 * réseau, et laisse le client se tester sans jamais construire un DOM.
 *
 * Repris de `pause.ts` pour l'idiome (état interne, `render()` qui réécrit `innerHTML`,
 * `onLocaleChange` qui redessine si visible) : c'est l'écran le plus proche en forme —
 * ni navigation clavier propre, ni sous-vues — mais sans `MenuNav`, puisque le panneau
 * n'est pas navigable : il n'expose que l'affichage, à charge du menu et de l'écran de fin
 * (qui le montent) de gérer le focus autour de lui.
 */
export function createLeaderboardPanel(root: HTMLElement): LeaderboardPanel {
  const el = document.createElement('div')
  el.className = 'hidden w-full flex-col items-center gap-[calc(var(--ui)*0.4)] text-paper'
  root.appendChild(el)

  let state: State = { kind: 'loading' }

  const render = (): void => {
    el.innerHTML = `<h2 class="ui-lg tracking-wide">${t('leaderboard.title')}</h2>`

    const body = document.createElement('div')
    body.className = 'flex w-full flex-col items-center gap-[calc(var(--ui)*0.4)]'
    el.appendChild(body)

    if (state.kind === 'loading') {
      body.innerHTML = `<p class="ui-sm py-[1em] opacity-60">${t('leaderboard.loading')}</p>`
      return
    }
    if (state.kind === 'error') {
      body.innerHTML = `<p class="ui-sm py-[1em] opacity-70">${t('leaderboard.error')}</p>`
      return
    }

    const { data, highlight } = state

    if (data.top.length === 0) {
      body.innerHTML = `<p class="ui-sm py-[1em] opacity-60">${t('leaderboard.empty')}</p>`
    } else {
      body.innerHTML = `
        <div class="grid w-full grid-cols-[2.5em_1fr_auto_auto] gap-x-[0.6em] px-[0.5em] text-left ui-2xs uppercase tracking-[0.15em] opacity-45">
          <span>${t('leaderboard.headerRank')}</span>
          <span>${t('leaderboard.headerNickname')}</span>
          <span class="text-right">${t('leaderboard.headerScore')}</span>
          <span></span>
        </div>
      `
      // `overflow-y-auto` seul suffirait à la souris ; `leaderboard-scroll` (main.css) ajoute
      // le défilement inertiel iOS et empêche le classement de faire aussi défiler l'écran
      // qui le porte une fois arrivé en haut ou en bas — indispensable au doigt, invisible à
      // la souris. `max-h-` borne les cent lignes : sans plafond, l'écran de fin déborderait.
      const list = document.createElement('div')
      list.dataset.scroll = ''
      list.className = 'leaderboard-scroll max-h-[calc(var(--ui)*14)] w-full overflow-y-auto'
      body.appendChild(list)

      let highlightedEl: HTMLElement | null = null
      for (const entry of data.top) {
        const isHighlighted = highlight !== undefined && entry.nickname === highlight
        const rowEl = buildRow(entry, isHighlighted)
        list.appendChild(rowEl)
        if (isHighlighted && !highlightedEl) {
          highlightedEl = rowEl
        }
      }
      // Amène la ligne mise en évidence dans la vue : au rang 73 sur cent, elle est hors
      // écran, et une mise en évidence que personne ne voit n'apprend rien au joueur qui
      // vient de publier.
      highlightedEl?.scrollIntoView({ block: 'nearest' })
    }

    if (data.you) {
      const footer = document.createElement('div')
      footer.dataset.you = ''
      footer.className = 'w-full border-t border-paper/20 pt-[0.4em]'
      const label = document.createElement('div')
      label.className = 'ui-2xs px-[0.5em] uppercase tracking-[0.15em] opacity-50'
      label.textContent = t('leaderboard.you')
      footer.appendChild(label)
      // Jamais mise en évidence via `highlight` : le pied est déjà, en permanence, la ligne
      // du joueur — inutile de la distinguer une seconde fois, et il n'y a rien à faire
      // défiler puisqu'elle est toujours visible.
      footer.appendChild(buildRow(data.you, false))
      body.appendChild(footer)
    }
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  const reveal = (): void => {
    el.classList.remove('hidden')
    el.classList.add('flex')
  }

  return {
    show(data, highlight): void {
      state = { kind: 'loaded', data, highlight }
      reveal()
      render()
    },

    hide(): void {
      el.classList.add('hidden')
      el.classList.remove('flex')
    },

    showError(): void {
      state = { kind: 'error' }
      reveal()
      render()
    },

    showLoading(): void {
      state = { kind: 'loading' }
      reveal()
      render()
    },
  }
}
