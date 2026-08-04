import type { ApiErrorReason } from '@shared/api-errors'
import type { Replay } from '@sim/replay/format'

import type { AchievementDef } from '@/app/achievements/catalog'
import {
  fetchLeaderboard,
  type LeaderboardEntry,
  type SubmitOutcome,
  submitRun,
} from '@/app/leaderboard-client'
import { ensureNickname } from '@/app/nickname'
import { onLocaleChange, t } from '@/i18n'
import { nibPath } from '@/render/views/nibs'
import { formatDuration, formatScore } from '../format'
import { renderNumber } from '../numeral'
import { createLeaderboardPanel, type HighlightTarget } from './leaderboard'

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
 * Les trois fonctions que ce module appelle pour publier un score, chacune
 * injectable — jamais importée en dur dans la logique de publication — parce
 * que ce fichier n'a pas d'autre chemin sûr pour se tester : `vi.mock` n'est
 * pas intercepté sous le lanceur navigateur de ce dépôt (Vitest 2.1.9,
 * provider Playwright — voir `sim/replay/run.mocked.test.ts`), et un test qui
 * construit du vrai DOM (`document.createElement`) doit tourner en mode
 * navigateur (`*.browser.test.ts`). Les tests passent donc de fausses
 * implémentations directement en paramètre ; `game.ts` ne fournit rien et
 * hérite des vraies, par la valeur par défaut ci-dessous.
 *
 * `writeNickname` a disparu d'ici : le pseudo se règle désormais dans le menu
 * (spec §8), AVANT qu'une partie ne commence, jamais au moment de publier.
 * `ensureNickname` remplace `readNickname` pour la même raison — le joueur
 * qui n'est jamais passé par le menu (premier lancement) a quand même un
 * pseudo stable, fabriqué et mémorisé dès le premier appel.
 */
export interface GameOverDeps {
  submitRun: (nickname: string, replay: Replay) => Promise<SubmitOutcome>
  fetchLeaderboard: (
    nickname: string | null,
  ) => Promise<{ top: LeaderboardEntry[]; you?: LeaderboardEntry } | null>
  ensureNickname: () => string
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
 * `ApiErrorReason` (serveur) plus `'offline'`, le seul motif que CE client
 * invente lui-même (`leaderboard-client.ts#submitRun`, quand `fetch` rejette
 * ou que la réponse ne se parse pas) — le serveur ne l'émet jamais.
 */
type FrontRefusalReason = ApiErrorReason | 'offline'

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
 *
 * Typé `Record<FrontRefusalReason, string>`, et non `Record<string, string>` :
 * un motif ajouté à `ApiErrorReason` (`shared/api-errors.ts` — voir sa
 * docstring pour pourquoi ce type vit là et pas dans `back/src/`, où il a
 * d'abord été posé) sans entrée ici fait échouer `tsc --noEmit`, ici, à la
 * déclaration de cet objet — jamais en silence sur le message générique en
 * production. C'est la moitié de la garantie qu'on peut tenir : elle suppose
 * que ce front est REDÉPLOYÉ avec la mise à jour du serveur qui ajoute le
 * motif. Un vieux bundle encore servi face à un serveur déjà à jour reste
 * possible (deux images qui déploient indépendamment) et RESTE non couvert
 * par le compilateur — c'est `refusalMessage` ci-dessous, avec son repli sur
 * `publishRefusedUnknown`, qui ferme ce second cas, à l'exécution, pas au
 * type.
 *
 * `already_submitted` garde son entrée pour ce filet, mais `doSubmit`
 * (tâche 4) ne l'atteint plus par ce chemin dans le cas courant : ce refus
 * révèle désormais le classement (`kind: 'alreadySubmitted'`) plutôt que de
 * rester dans l'état `refused` générique.
 */
const REFUSAL_MESSAGE_KEYS: Record<FrontRefusalReason, string> = {
  stale_build: 'gameover.publishRefusedStaleBuild',
  too_long: 'gameover.publishRefusedTooLong',
  not_dead: 'gameover.publishRefusedNotDead',
  already_submitted: 'gameover.publishRefusedAlreadySubmitted',
  malformed: 'gameover.publishRefusedMalformed',
  too_large: 'gameover.publishRefusedTooLarge',
  invalid_request: 'gameover.publishRefusedInvalidRequest',
  server_error: 'gameover.publishRefusedServerError',
  offline: 'gameover.publishRefusedOffline',
}

function refusalMessage(reason: string): string {
  const key = REFUSAL_MESSAGE_KEYS[reason as FrontRefusalReason]
  return t(key ?? 'gameover.publishRefusedUnknown')
}

/**
 * L'état du bloc de publication, indépendant de `stats` : une nouvelle
 * partie (`show`) le remet à `sending`, puisque la publication démarre
 * elle-même dès `show()` — plus de geste du joueur pour la déclencher, donc
 * plus d'état `idle` à afficher avant qu'elle ne commence.
 */
type PublishState =
  | { kind: 'sending' }
  | { kind: 'published'; rank: number; total: number; improved: boolean }
  /**
   * `already_submitted` (spec §4) : ce replay précis a déjà été publié — un
   * 201 perdu sur un réseau flou, puis un nouvel essai automatique au coup
   * suivant. Le score N'A PAS échoué à se publier : il est déjà enregistré et
   * déjà classé. Traité à part de `refused` ci-dessous, en révélant le
   * classement (`revealLeaderboard`) — jamais laissé croire au joueur que sa
   * partie s'est perdue.
   */
  | { kind: 'alreadySubmitted' }
  /**
   * Aucun bouton « Réessayer » ici : la publication n'est plus déclenchée par
   * un geste du joueur (spec, lot final), donc plus rien à rappuyer. Ce refus
   * reste purement informatif — voir `refusalMessage` et `REFUSAL_MESSAGE_KEYS`
   * pour ce que chaque motif dit, et la docstring de `gameover.publishRefusedOffline`
   * dans les fichiers de locale pour pourquoi ce motif-là ne promet plus de
   * nouvel essai.
   */
  | { kind: 'refused'; reason: string }

/** `Espace` relance immédiatement, sans confirmation ni repasser par le menu (spec §4.2). `Échap` retourne au menu. */
export function createGameOverScreen(
  root: HTMLElement,
  deps: GameOverDeps = { submitRun, fetchLeaderboard, ensureNickname },
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
  /** Dernière partie effectivement envoyée : voir la garde de `doSubmit`. */
  let submittedReplay: Replay | null = null
  // Valeur de départ purement défensive : jamais rendue avant le premier
  // `show()` (l'écran reste `hidden`, et `render()` n'est appelé que par
  // `show()`, `doSubmit` ou un changement de locale quand l'écran est visible).
  let publish: PublishState = { kind: 'sending' }
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
   * Le bloc de publication : un indicateur discret pendant l'envoi
   * (`sending`), le résultat (`published`), ou un message informatif
   * (`alreadySubmitted`/`refused`) — plus aucun bouton nulle part, la
   * publication n'attend plus de geste. `data-state` porte l'état pour les
   * tests — indépendant du texte affiché, donc indifférent à la locale active.
   */
  const renderPublish = (): string => {
    if (publish.kind === 'sending') {
      return `<span class="ui-xs tracking-[0.18em] opacity-40">${t('gameover.publishing')}</span>`
    }
    if (publish.kind === 'published') {
      return `
        <div data-publish-result class="flex flex-col items-center gap-[0.2em]">
          <span class="ui-sm tracking-[0.1em]">${t('gameover.publishedRank', { rank: publish.rank, total: publish.total })}</span>
          ${publish.improved ? `<span class="ui-xs opacity-80">${t('gameover.publishedImproved')}</span>` : ''}
        </div>
      `
    }
    if (publish.kind === 'alreadySubmitted') {
      // Le classement révélé en dessous (`revealLeaderboard`, appelé par
      // `doSubmit`) montre au joueur que sa partie est bel et bien classée —
      // cet écran seul ne le prouve pas.
      return `<span data-publish-message class="ui-xs opacity-80">${t('gameover.publishRefusedAlreadySubmitted')}</span>`
    }
    // `refused`
    return `<span data-publish-message class="ui-xs opacity-80">${refusalMessage(publish.reason)}</span>`
  }

  // `data-action`, pas `data-nav-index` : pas de `MenuNav` à tenir en phase,
  // chacun de ces deux rappels porte directement son action.
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
      }
    }
  }

  /** Charge et affiche le classement autour du pseudo qui vient de publier. */
  const revealLeaderboard = (nickname: string, highlight: HighlightTarget): void => {
    const startedAt = generation
    panelHost.classList.remove('hidden')
    leaderboardPanel.showLoading()
    void deps.fetchLeaderboard(nickname).then((data) => {
      if (startedAt !== generation) {
        return
      }
      if (data) {
        leaderboardPanel.show(data, highlight)
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
    // Une même partie ne part qu'une fois. Rien ne l'appelle deux fois
    // aujourd'hui — `onEnterGameOver` ne s'exécute qu'à la transition
    // `dying → gameover` —, mais rien ne l'empêche non plus, et l'effet d'une
    // régression serait invisible : le serveur dédoublonne par empreinte du
    // replay, le second envoi reviendrait en `already_submitted`, que cet
    // écran affiche désormais comme un succès. Le défaut se cacherait donc
    // derrière son propre symptôme.
    if (submittedReplay === currentReplay) {
      return
    }
    submittedReplay = currentReplay
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
        // Par identifiant, pas par pseudo : un pseudo occupe plusieurs lignes
        // (règles « arcade cabinet »), et le désigner par son nom allumerait
        // aussi ses parties d'hier.
        revealLeaderboard(nickname, { runId: outcome.runId })
      } else if (outcome.reason === 'already_submitted') {
        // Le score EST publié et classé (spec, tâche 4) : révéler le
        // classement plutôt que de le traiter comme les autres refus, sous
        // peine de laisser le joueur croire que sa partie s'est perdue.
        publish = { kind: 'alreadySubmitted' }
        render()
        // Pas d'identifiant ici — le serveur a refusé sans en rendre un —, donc
        // toutes les lignes du pseudo, ce qui reste juste : la sienne en fait partie.
        revealLeaderboard(nickname, { nickname })
      } else {
        // Le serveur sait POURQUOI il refuse — « indice hors des cartes
        // proposées », « choix annoncé au pas X, vague terminée au pas Y »…
        // — et le joueur n'a que faire de ce détail. Mais le jeter
        // entièrement rend un refus indiagnosticable : c'est ce qui a fait
        // spéculer une demi-heure sur un `malformed` rapporté depuis une
        // vraie partie. Il part donc en console, jamais à l'écran.
        console.warn(`[classement] publication refusée (${outcome.reason}) : ${outcome.message}`)
        publish = { kind: 'refused', reason: outcome.reason }
        render()
      }
    })
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
      generation += 1
      panelHost.classList.add('hidden')
      leaderboardPanel.hide()
      el.classList.remove('hidden')
      el.classList.add('flex')
      // Publication immédiate, sans geste du joueur (spec, lot final) : le
      // pseudo est réglé bien avant, dans le menu (`ensureNickname` ne fait
      // que le relire, sauf tout premier lancement où il en fabrique un).
      doSubmit(deps.ensureNickname())
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
