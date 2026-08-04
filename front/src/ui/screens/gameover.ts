import type { Replay } from '@sim/replay/format'

import type { AchievementDef } from '@/app/achievements/catalog'
import {
  fetchLeaderboard,
  type LeaderboardEntry,
  type SubmitOutcome,
  submitRun,
} from '@/app/leaderboard-client'
import { readNickname, writeNickname } from '@/app/nickname'
import { onLocaleChange, t } from '@/i18n'
import { nibPath } from '@/render/views/nibs'
import { formatDuration, formatScore } from '../format'
import { renderNumber } from '../numeral'
import { createLeaderboardPanel } from './leaderboard'

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

/**
 * Les quatre fonctions que ce module appelle pour publier un score, chacune
 * injectable — jamais importée en dur dans la logique de publication — parce
 * que ce fichier n'a pas d'autre chemin sûr pour se tester : `vi.mock` n'est
 * pas intercepté sous le lanceur navigateur de ce dépôt (Vitest 2.1.9,
 * provider Playwright — voir `sim/replay/run.mocked.test.ts`), et un test qui
 * construit du vrai DOM (`document.createElement`) doit tourner en mode
 * navigateur (`*.browser.test.ts`). Les tests passent donc de fausses
 * implémentations directement en paramètre ; `game.ts` ne fournit rien et
 * hérite des vraies, par la valeur par défaut ci-dessous.
 */
export interface GameOverDeps {
  submitRun: (nickname: string, replay: Replay) => Promise<SubmitOutcome>
  fetchLeaderboard: (
    nickname: string | null,
  ) => Promise<{ top: LeaderboardEntry[]; you?: LeaderboardEntry } | null>
  readNickname: () => string | null
  writeNickname: (raw: string) => string | null
}

export interface GameOverScreen {
  show(stats: GameOverStats, replay: Replay, onRestart: () => void, onMenu: () => void): void
  hide(): void
  handleKey(code: string): boolean
}

/** Encarts de succès par rangée, au plus. */
const UNLOCKED_PER_ROW = 3
/** Largeur d'un encart, en unités de la rampe `--ui`. */
const UNLOCKED_CARD_W = 8.5
/** Écart entre deux encarts, même unité. */
const UNLOCKED_GAP = 0.5

/**
 * Largeur du cadre qui borne une rangée. C'est ELLE qui impose le nombre
 * d'encarts par ligne — un `flex-wrap` ne sait pas compter, il ne sait que
 * déborder — et elle se calcule donc plutôt que de s'écrire à la main : une
 * largeur d'encart révisée sans son cadre ferait passer la rangée à deux ou à
 * quatre, en silence.
 *
 * Elle n'est pas posée en classe Tailwind : l'outil n'aperçoit que les chaînes
 * de classes littérales de la source, jamais celles qu'un gabarit compose à
 * l'exécution, et la classe correspondante ne serait tout simplement pas
 * générée.
 */
const unlockedRowW = (): number =>
  UNLOCKED_PER_ROW * UNLOCKED_CARD_W + (UNLOCKED_PER_ROW - 1) * UNLOCKED_GAP

/**
 * Motif de refus → clé i18n. Une entrée manquante retombe sur
 * `gameover.publishRefusedUnknown` : un refus qui parse en JSON mais sans
 * `reason` reconnu (une page d'erreur de proxy, un motif serveur ajouté après
 * ce client) ne doit jamais laisser voir « undefined » au joueur — `submitRun`
 * ne lève jamais (tâche 4), donc ce repli est le seul filet qui reste.
 *
 * `stale_build` a sa propre entrée et sa propre formulation (spec §6) :
 * inviter à recharger la page, jamais dire que le replay est invalide, jamais
 * laisser croire que le score est mis en doute — le joueur n'a rien fait de
 * mal, sa version du jeu est juste périmée.
 */
const REFUSAL_MESSAGE_KEYS: Record<string, string> = {
  stale_build: 'gameover.publishRefusedStaleBuild',
  too_long: 'gameover.publishRefusedTooLong',
  not_dead: 'gameover.publishRefusedNotDead',
  already_submitted: 'gameover.publishRefusedAlreadySubmitted',
  offline: 'gameover.publishRefusedOffline',
}

function refusalMessage(reason: string): string {
  const key = REFUSAL_MESSAGE_KEYS[reason]
  return t(key ?? 'gameover.publishRefusedUnknown')
}

/** L'état du bloc de publication, indépendant de `stats` : une nouvelle partie (`show`) le remet à `idle`. */
type PublishState =
  | { kind: 'idle' }
  /** Aucun pseudo mémorisé (`readNickname` a rendu `null`) : demandé une fois, dans l'écran, jamais via `prompt()`. */
  | { kind: 'asking' }
  /** Bouton désactivé : un double clic ne doit jamais publier deux fois. */
  | { kind: 'sending' }
  | { kind: 'published'; rank: number; total: number; improved: boolean }
  | { kind: 'refused'; reason: string }

/** `Espace` relance immédiatement, sans confirmation ni repasser par le menu (spec §4.2). `Échap` retourne au menu. */
export function createGameOverScreen(
  root: HTMLElement,
  deps: GameOverDeps = { submitRun, fetchLeaderboard, readNickname, writeNickname },
): GameOverScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*0.6)] overflow-y-auto bg-ink-deep/85 py-[calc(var(--ui)*1)] text-paper backdrop-blur-sm'
  root.appendChild(el)

  // Sous-conteneur dédié au gabarit dynamique : `el.innerHTML` détruirait le
  // panneau de classement ci-dessous à chaque redessin (il pose ses propres
  // nœuds une seule fois, à la construction — voir `createLeaderboardPanel`).
  const content = document.createElement('div')
  content.className = 'flex flex-col items-center gap-[calc(var(--ui)*0.6)]'
  el.appendChild(content)

  // Jamais recréé : le panneau gère lui-même son propre redessin
  // (`show`/`showLoading`/`showError`), indépendamment de `render()` ci-dessous.
  const panelHost = document.createElement('div')
  panelHost.className = 'hidden w-[calc(var(--ui)*18)] max-w-[92vw]'
  el.appendChild(panelHost)
  const leaderboardPanel = createLeaderboardPanel(panelHost)

  let stats: GameOverStats = { score: 0, wave: 1, kills: 0, durationMs: 0, best: 0, unlocked: [] }
  let replay: Replay | null = null
  let publish: PublishState = { kind: 'idle' }
  /**
   * Incrémenté à chaque `show()`. Un `submitRun`/`fetchLeaderboard` lancé
   * pour une partie, encore en vol quand le joueur relance ou repart au menu
   * avant la réponse, ne doit jamais écrire son résultat sur l'écran de la
   * partie SUIVANTE — sans ce jeton, une réponse tardive de la première
   * partie appliquerait son `rank`/`improved` (ou son classement) à une
   * partie que le joueur est déjà en train de rejouer.
   */
  let generation = 0
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
   * succès est un ENCART, et les encarts se rangent en ligne, `UNLOCKED_PER_ROW`
   * au plus, puis reviennent à la ligne. Une liste verticale allongeait l'écran
   * à proportion d'une bonne partie — la meilleure en ouvre le plus, et c'était
   * elle qui poussait les commandes hors du cadre.
   *
   * Les encarts sont sobres — un liseré, un fond à peine posé — là où le
   * bandeau de jeu est un cartouche d'encre plein. Un aplat papier isolé, en
   * pleine partie, fait l'événement ; quatre d'affilée sur l'écran de fin
   * écraseraient tout le reste.
   *
   * L'intitulé « DÉBLOQUÉ » est porté UNE fois par la section, au lieu d'être
   * répété sur chaque encart : répété, il pesait plus lourd que les noms qu'il
   * qualifiait. Le filet au-dessus détache le tout du bloc de score — c'est le
   * moment de récompense de l'écran, il ne doit pas se lire comme une
   * quatrième ligne de statistiques.
   */
  const renderUnlocked = (): string => {
    if (stats.unlocked.length === 0) {
      return ''
    }
    const cards = stats.unlocked
      .map((def) => {
        // Une place de pictogramme est réservée même sans tracé : sans elle,
        // les titres des encarts honorifiques remonteraient d'une hauteur de
        // glyphe et la rangée perdrait sa ligne de base commune.
        //
        // Le point qui la tient fait la MOITIÉ de la silhouette qu'il remplace.
        // À taille égale il se lisait comme un tracé de plus — d'autant que
        // deux des sept en sont déjà, la Bille et la Tache — là où il ne dit
        // rien d'autre que « ce succès est honorifique ».
        const glyph = def.skin
          ? `<svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg>`
          : '<span class="flex h-[1em] w-[1em] items-center justify-center"><span class="block h-[0.42em] w-[0.42em] rounded-full bg-paper/40"></span></span>'
        const reward = def.skin
          ? `<span class="ui-2xs leading-tight opacity-55">${t(`skin.${def.skin}.name`)}</span>`
          : ''
        return `
          <div style="width: calc(var(--ui) * ${UNLOCKED_CARD_W})" class="flex flex-col items-center gap-[calc(var(--ui)*0.25)] rounded-sm border border-paper/20 bg-paper/5 px-[calc(var(--ui)*0.4)] py-[calc(var(--ui)*0.45)] text-center">
            <span class="text-[calc(var(--ui)*1.3)] leading-none">${glyph}</span>
            <span class="ui-xs leading-tight">${t(`achievement.${def.id}.name`)}</span>
            ${reward}
          </div>`
      })
      .join('')
    return `
      <div class="mt-[calc(var(--ui)*0.5)] flex flex-col items-center gap-[calc(var(--ui)*0.45)]">
        <div class="h-px w-[calc(var(--ui)*9)] bg-paper/20"></div>
        <div class="ui-2xs tracking-[0.3em] opacity-45">${t('achievements.unlocked')}</div>
        <div style="max-width: calc(var(--ui) * ${unlockedRowW()}); gap: calc(var(--ui) * ${UNLOCKED_GAP})" class="flex flex-wrap items-stretch justify-center">
          ${cards}
        </div>
      </div>`
  }

  /**
   * Le bloc de publication : un bouton de repli (`idle`/`refused`), un champ
   * de pseudo (`asking`), un bouton désactivé (`sending`), ou le résultat
   * (`published`). `data-state` porte l'état pour les tests — indépendant du
   * texte affiché, donc indifférent à la locale active.
   */
  const renderPublish = (): string => {
    if (publish.kind === 'idle') {
      return `<button type="button" data-action="publish" class="ui-xs cursor-pointer tracking-[0.18em] opacity-70 transition-opacity hover:opacity-100">${t('gameover.publish')}</button>`
    }
    if (publish.kind === 'asking') {
      return `
        <div class="flex items-center gap-[calc(var(--ui)*0.4)]">
          <input
            data-nickname-input
            type="text"
            maxlength="20"
            placeholder="${t('gameover.publishNicknamePlaceholder')}"
            class="ui-xs w-[calc(var(--ui)*7)] rounded border border-paper/40 bg-paper/10 px-[0.6em] py-[0.35em] text-paper placeholder:text-paper/40 focus:outline-none focus:border-paper/70"
          />
          <button type="button" data-action="confirmNickname" class="ui-xs cursor-pointer rounded border border-paper/40 px-[0.7em] py-[0.35em] opacity-80 hover:opacity-100">${t('gameover.publishNicknameConfirm')}</button>
        </div>
      `
    }
    if (publish.kind === 'sending') {
      return `<button type="button" data-action="publish" disabled class="ui-xs cursor-not-allowed tracking-[0.18em] opacity-30">${t('gameover.publishing')}</button>`
    }
    if (publish.kind === 'published') {
      return `
        <div data-publish-result class="flex flex-col items-center gap-[0.2em]">
          <span class="ui-sm tracking-[0.1em]">${t('gameover.publishedRank', { rank: publish.rank, total: publish.total })}</span>
          ${publish.improved ? `<span class="ui-xs opacity-80">${t('gameover.publishedImproved')}</span>` : ''}
        </div>
      `
    }
    // `refused`
    return `
      <div class="flex flex-col items-center gap-[calc(var(--ui)*0.3)]">
        <span data-publish-message class="ui-xs opacity-80">${refusalMessage(publish.reason)}</span>
        <button type="button" data-action="publish" class="ui-xs cursor-pointer tracking-[0.18em] opacity-70 transition-opacity hover:opacity-100">${t('gameover.publishRetry')}</button>
      </div>
    `
  }

  // chacun directement leur action) — `data-action`, pas `data-nav-index` :
  // pas de `MenuNav` à tenir en phase.
  const render = (): void => {
    content.innerHTML = `
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
      <div data-publish data-state="${publish.kind}" class="mt-[calc(var(--ui)*0.3)] flex flex-col items-center">${renderPublish()}</div>
      <div data-action="restart" class="ui-xs mt-[0.8em] cursor-pointer tracking-[0.18em] opacity-45 transition-opacity hover:opacity-80">${t('gameover.restart')}</div>
      <div data-action="menu" class="ui-xs cursor-pointer tracking-[0.18em] opacity-45 transition-opacity hover:opacity-80">${t('gameover.menu')}</div>
    `
    // Écouteur posé directement sur CHAQUE rappel, jamais délégué sur `el`
    // (même risque qu'une délégation basée sur la bulle, voir
    // `bindItemActivation` dans `menu-nav.ts`). Reposé à chaque redessin :
    // `innerHTML` détruit les nœuds précédents et leurs écouteurs.
    for (const item of content.querySelectorAll<HTMLElement>('[data-action]')) {
      const action = item.dataset.action
      if (action === 'restart') {
        item.addEventListener('click', () => restart())
      } else if (action === 'menu') {
        item.addEventListener('click', () => toMenu())
      } else if (action === 'publish') {
        item.addEventListener('click', () => beginPublish())
      } else if (action === 'confirmNickname') {
        item.addEventListener('click', () => confirmNickname())
      }
    }
    const nicknameInput = content.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (nicknameInput) {
      nicknameInput.focus()
      nicknameInput.addEventListener('keydown', (e: KeyboardEvent): void => {
        // Empêche le routage clavier global (`game.ts`) de lire cette frappe :
        // sans ça, `Espace` relancerait la partie et `Échap` ouvrirait le menu
        // PENDANT la saisie du pseudo — avant même que la frappe n'atteigne ce
        // champ, puisque `game.ts` appelle `preventDefault` sur ces codes sans
        // regarder quel élément a le focus.
        e.stopPropagation()
        if (e.code === 'Enter') {
          confirmNickname()
        } else if (e.code === 'Escape') {
          publish = { kind: 'idle' }
          render()
        }
      })
    }
  }

  /** Charge et affiche le classement autour du pseudo qui vient de publier. */
  const revealLeaderboard = (nickname: string): void => {
    const startedAt = generation
    panelHost.classList.remove('hidden')
    leaderboardPanel.showLoading()
    void deps.fetchLeaderboard(nickname).then((data) => {
      if (startedAt !== generation) {
        return
      }
      if (data) {
        leaderboardPanel.show(data, nickname)
      } else {
        leaderboardPanel.showError()
      }
    })
  }

  const doSubmit = (nickname: string): void => {
    const currentReplay = replay
    if (currentReplay === null) {
      return
    }
    const startedAt = generation
    publish = { kind: 'sending' }
    render()
    void deps.submitRun(nickname, currentReplay).then((outcome) => {
      if (startedAt !== generation) {
        return
      }
      if (outcome.ok) {
        publish = {
          kind: 'published',
          rank: outcome.rank,
          total: outcome.total,
          improved: outcome.improved,
        }
        render()
        revealLeaderboard(nickname)
      } else {
        publish = { kind: 'refused', reason: outcome.reason }
        render()
      }
    })
  }

  /** Depuis le bouton de repli (`idle`) ou celui de reprise (`refused`). */
  const beginPublish = (): void => {
    if (publish.kind === 'sending') {
      return
    }
    const nickname = deps.readNickname()
    if (nickname === null) {
      publish = { kind: 'asking' }
      render()
      return
    }
    doSubmit(nickname)
  }

  /** Depuis le champ de pseudo (`asking`), au clic ou à `Entrée`. */
  const confirmNickname = (): void => {
    const input = content.querySelector<HTMLInputElement>('[data-nickname-input]')
    const nickname = deps.writeNickname(input?.value ?? '')
    // Vide après normalisation (espaces seuls, caractères invisibles…) :
    // rester en attente plutôt que publier sous un pseudo vide, sans que rien
    // ne signale au joueur pourquoi rien ne s'est passé — un champ toujours là
    // à remplir en dit assez.
    if (nickname === null) {
      return
    }
    doSubmit(nickname)
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  return {
    show(next, nextReplay, onRestart, onMenu): void {
      stats = next
      replay = nextReplay
      restart = onRestart
      toMenu = onMenu
      publish = { kind: 'idle' }
      generation += 1
      panelHost.classList.add('hidden')
      leaderboardPanel.hide()
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
