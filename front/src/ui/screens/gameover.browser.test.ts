import type { Replay } from '@sim/replay/format'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LeaderboardEntry, SubmitOutcome } from '@/app/leaderboard-client'
import { setLocale, t } from '@/i18n'
import { createGameOverScreen, type GameOverDeps, type GameOverStats } from './gameover'

/**
 * Suite en mode navigateur (`vitest.browser.config.ts`), et non `npx vitest run` nu : cet écran
 * construit du vrai DOM (`document.createElement`), que Node ne fournit pas — même raison que
 * `leaderboard.browser.test.ts` (tâche 6).
 *
 * Les trois fonctions consommées (`submitRun`, `fetchLeaderboard`, `ensureNickname`) sont
 * injectées via `GameOverDeps`, jamais remplacées par `vi.mock` : ce mécanisme n'est pas
 * intercepté sous le lanceur navigateur de ce dépôt (Vitest 2.1.9, provider Playwright — voir la
 * docstring de `sim/replay/run.mocked.test.ts`, qui documente le même défaut pour
 * `../step`/`../upgrades/offer`, mesuré et confirmé indépendamment).
 *
 * Lot final : la publication n'attend plus aucun geste du joueur, ni bouton « Publier » ni champ
 * pseudo dans cet écran (le pseudo se règle désormais dans le menu, AVANT la partie — voir
 * `menu.browser.test.ts`). Chaque test appelle donc `screen.show(...)` puis observe directement
 * l'état qui en résulte, sans clic préalable.
 */

const REPLAY: Replay = {
  simVersion: '0'.repeat(16),
  seed: 1,
  arenaId: 0,
  inputs: new Int16Array(0),
  choices: [],
}

const STATS: GameOverStats = {
  score: 1234,
  wave: 3,
  kills: 20,
  durationMs: 45_000,
  best: 5000,
  unlocked: [],
}

const noop = (): void => {
  /* callback non exercé par ce test */
}

function row(nickname: string, rank: number, score: number): LeaderboardEntry {
  return {
    id: `${nickname}-${rank}`,
    rank,
    nickname,
    score,
    wave: 3,
    arenaId: 0,
    createdAt: '2026-08-04T00:00:00.000Z',
  }
}

/** Une promesse dont ce fichier contrôle la résolution, pour observer l'état « en cours d'envoi » avant de la lever. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/**
 * Vide la file de microtâches. `await` sur la promesse contrôlée par le test suffit à laisser
 * tourner le PREMIER `.then` qui lui est attaché (celui du composant, posé avant celui du
 * test), mais `revealLeaderboard` chaîne un second appel asynchrone (`fetchLeaderboard`) une
 * fois le premier résolu — un `setTimeout(0)` garantit que toute la chaîne a fini, quel que
 * soit son nombre de sauts, puisqu'une tâche macro n'est traitée qu'une fois la file de
 * microtâches entièrement vidée.
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * `submitRun` par défaut résout, elle ne lève jamais : `show()` la déclenche désormais TOUJOURS,
 * pour chaque test (publication automatique, sans geste du joueur) — un défaut qui rejette,
 * comme dans l'ancienne suite (où seuls certains clics l'atteignaient), laisserait une rejection
 * non gérée sur les tests qui ne s'intéressent pas à l'issue de la publication (« Espace »,
 * « Échap »). Fidèle au vrai `submitRun` (`leaderboard-client.ts`), dont la docstring promet
 * justement de ne jamais lever.
 */
function fakeDeps(overrides: Partial<GameOverDeps> = {}): GameOverDeps {
  return {
    submitRun: async () => ({
      ok: true,
      runId: 'run-1',
      score: 0,
      rank: 1,
      total: 1,
      improved: false,
    }),
    fetchLeaderboard: async () => null,
    ensureNickname: () => 'leo',
    ...overrides,
  }
}

describe('écran de fin — publication automatique au classement', () => {
  // Locale fixée explicitement : le test « stale_build » vérifie la formulation
  // française mot pour mot (spec §6), et `t()` résout selon la locale courante,
  // globale au module `@/i18n` — sans ce garde-fou, l'assertion dépendrait de
  // la locale par défaut du lanceur (`en`) plutôt que du contenu réel du texte.
  beforeEach(() => {
    setLocale('fr')
  })

  /**
   * Falsification (brief, lot final) : la publication ne doit attendre AUCUN geste du joueur —
   * ni clic, ni frappe. `submitRun` est rendu observable (`vi.fn`) et l'assertion porte sur son
   * appel juste après `show()`, avant toute autre interaction avec `root`.
   */
  it('à l’affichage : publie automatiquement, sans le moindre geste du joueur', () => {
    const submitRun = vi.fn(
      async (): Promise<SubmitOutcome> => ({
        ok: true,
        runId: 'run-1',
        score: 1234,
        rank: 4,
        total: 10,
        improved: false,
      }),
    )
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, fakeDeps({ submitRun }))

    screen.show(STATS, REPLAY, noop, noop)

    expect(submitRun).toHaveBeenCalledTimes(1)
    expect(submitRun).toHaveBeenCalledWith('leo', REPLAY)
  })

  it('en cours d’envoi : un indicateur discret, sans bouton', () => {
    const { promise } = deferred<SubmitOutcome>()
    const deps = fakeDeps({ submitRun: async () => promise })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)

    screen.show(STATS, REPLAY, noop, noop)

    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('sending')
    expect(root.querySelector('[data-action="publish"]')).toBeNull()
  })

  it('publié : montre le rang et le total', async () => {
    const deps = fakeDeps({
      submitRun: async () => ({
        ok: true,
        runId: 'run-1',
        score: 1234,
        rank: 4,
        total: 10,
        improved: false,
      }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('published')
    expect(root.querySelector('[data-publish-result]')?.textContent).toContain(
      t('gameover.publishedRank', { rank: 4, total: 10 }),
    )
  })

  it('publié avec amélioration : annonce le nouveau record', async () => {
    const deps = fakeDeps({
      submitRun: async () => ({
        ok: true,
        runId: 'run-1',
        score: 1234,
        rank: 1,
        total: 10,
        improved: true,
      }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    expect(root.querySelector('[data-publish-result]')?.textContent).toContain(
      t('gameover.publishedImproved'),
    )
  })

  // Règles « arcade cabinet » : un pseudo tient plusieurs lignes, donc c'est LA
  // partie publiée qu'on met en évidence, désignée par l'identifiant que
  // `POST /runs` vient de rendre — et non par le pseudo, qui en allumerait
  // d'autres. La fixture reflète ça : l'identifiant rendu est celui de la ligne.
  it('publié : révèle le classement, avec la partie publiée mise en évidence', async () => {
    const deps = fakeDeps({
      submitRun: async () => ({
        ok: true,
        runId: 'leo-2',
        score: 1234,
        rank: 2,
        total: 5,
        improved: false,
      }),
      fetchLeaderboard: async (nickname) =>
        nickname === null
          ? null
          : { top: [row('ana', 1, 2000), row(nickname, 2, 1234), row(nickname, 5, 400)] },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    // Une seule ligne, alors que « leo » en occupe deux : la partie publiée.
    const highlighted = root.querySelectorAll('[data-highlighted]')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]?.querySelector('[data-nickname]')?.textContent).toBe('leo')
    // Espace fine insécable (`formatScore`), écrite en séquence d'échappement :
    // un caractère invisible littéral dans un source ne se relit pas.
    expect(highlighted[0]?.textContent).toContain('1\u202f234')
  })

  it('publié mais classement injoignable : le panneau passe en erreur, jamais vide sans explication', async () => {
    const deps = fakeDeps({
      submitRun: async () => ({
        ok: true,
        runId: 'run-1',
        score: 1,
        rank: 1,
        total: 1,
        improved: false,
      }),
      fetchLeaderboard: async () => null,
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    expect(root.textContent).toContain(t('leaderboard.error'))
  })

  it('refusé avec un motif inconnu : retombe sur le message générique, jamais « undefined »', async () => {
    const deps = fakeDeps({
      submitRun: async () => ({
        ok: false,
        reason: 'a_future_reason_this_client_does_not_know',
        message: 'peu importe le message brut du serveur',
      }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('refused')
    const message = root.querySelector('[data-publish-message]')?.textContent
    expect(message).toBe(t('gameover.publishRefusedUnknown'))
    expect(message).not.toContain('undefined')
    // Aucun bouton nulle part : un refus n'attend plus de geste.
    expect(root.querySelector('[data-action="publish"]')).toBeNull()
  })

  it('un motif absent (JSON sans `reason`) retombe aussi sur le message générique', async () => {
    // Reproduit exactement le défaut relevé à la tâche 4 : un corps qui parse
    // en JSON mais sans `reason` reconnu (une page d'erreur de proxy, par
    // exemple) rend `{ ok: false, reason: undefined }` — `submitRun` ne lève
    // jamais, donc ce repli est le seul filet qui empêche « undefined »
    // d'atteindre le joueur.
    const deps = fakeDeps({
      submitRun: async () =>
        ({ ok: false, reason: undefined, message: undefined }) as unknown as SubmitOutcome,
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    const message = root.querySelector('[data-publish-message]')?.textContent
    expect(message).toBe(t('gameover.publishRefusedUnknown'))
    expect(message).not.toContain('undefined')
  })

  /**
   * Falsification (lot final) : sans bouton « Réessayer », le message `offline` ne doit plus
   * promettre une action que le joueur ne peut plus déclencher — il admet que le score n'a pas
   * été publié plutôt que d'inviter à un geste impossible. Voir la docstring de `PublishState`
   * dans `gameover.ts` pour le raisonnement complet.
   */
  it('hors ligne : admet que le score n’a pas été publié, ne promet aucun nouvel essai', async () => {
    const deps = fakeDeps({
      submitRun: async () => ({ ok: false, reason: 'offline', message: 'service injoignable' }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('refused')
    expect(root.querySelector('[data-action="publish"]')).toBeNull()
    const message = root.querySelector('[data-publish-message]')?.textContent?.toLowerCase() ?? ''
    expect(message).toBe(t('gameover.publishRefusedOffline').toLowerCase())
    expect(message).not.toContain('réessaie')
    expect(message).not.toContain('essaie')
  })

  /**
   * Falsification (tâche 4 du lot final) : reproduit le chemin décrit dans le
   * correctif — un 201 perdu, un nouvel essai qui rencontre `already_submitted`
   * — et vérifie que le classement s'affiche quand même, avec le pseudo
   * republié mis en évidence. Avant correctif, ce refus tombait dans l'état
   * `refused` générique et `panelHost` restait caché : ce test rougirait si
   * `doSubmit` retombait sur cette branche pour `already_submitted`.
   */
  it('déjà publié : révèle le classement plutôt que de rester dans un état de refus', async () => {
    const deps = fakeDeps({
      submitRun: async () => ({
        ok: false,
        reason: 'already_submitted',
        message: 'cette partie a déjà été publiée',
      }),
      fetchLeaderboard: async (nickname) =>
        nickname === null ? null : { top: [row('ana', 1, 2000), row(nickname, 2, 1234)] },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe(
      'alreadySubmitted',
    )
    const highlighted = root.querySelector('[data-highlighted] [data-nickname]')
    expect(highlighted?.textContent).toBe('leo')
  })

  /**
   * Falsification (tâche 3 du lot final) : ces trois motifs sont ajoutés par
   * ce lot (`malformed` existait déjà côté serveur mais n'avait aucune entrée
   * ici) et sont, comme `stale_build`, déterministes — réessayer est
   * garanti d'échouer. Avant correctif, les quatre retombaient sur
   * `gameover.publishRefusedUnknown`, qui invite (à tort) à réessayer plus
   * tard.
   */
  it.each([
    ['malformed', 'gameover.publishRefusedMalformed'],
    ['too_large', 'gameover.publishRefusedTooLarge'],
    ['invalid_request', 'gameover.publishRefusedInvalidRequest'],
  ] as const)('%s : message dédié, jamais le repli générique', async (reason, key) => {
    const deps = fakeDeps({
      submitRun: async () => ({ ok: false, reason, message: 'peu importe' }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    const message = root.querySelector('[data-publish-message]')?.textContent
    expect(message).toBe(t(key))
    expect(message).not.toBe(t('gameover.publishRefusedUnknown'))
  })

  /**
   * `server_error` (500) est le seul des quatre motifs de la tâche 3 pour
   * lequel réessayer plus tard est réellement vrai — sa formulation reprend
   * donc volontairement celle du repli générique, plutôt que d'en inventer
   * une distincte qui dirait la même chose autrement. Ce test vérifie la clé
   * dédiée (`gameover.publishRefusedServerError`), pas un texte différent.
   */
  it('server_error : message de repli légitime (retenter a du sens), via sa propre clé', async () => {
    const deps = fakeDeps({
      submitRun: async () => ({ ok: false, reason: 'server_error', message: 'erreur interne' }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    const message = root.querySelector('[data-publish-message]')?.textContent
    expect(message).toBe(t('gameover.publishRefusedServerError'))
  })

  // Falsification (brief) : faire répondre `{ ok: false, reason: 'stale_build' }` et vérifier
  // l'invitation à recharger. `stale_build` est le refus le plus fréquent en production — tout
  // joueur avec un onglet ouvert pendant un déploiement le reçoit — donc le seul dont le libellé
  // est testé mot pour mot, et pas seulement par comparaison à la clé i18n.
  it('stale_build : invite à recharger, ne dit jamais le replay invalide, n’insinue jamais une triche', async () => {
    const deps = fakeDeps({
      submitRun: async () => ({
        ok: false,
        reason: 'stale_build',
        message: 'simVersion mismatch',
      }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()

    const message = root.querySelector('[data-publish-message]')?.textContent ?? ''
    expect(message).toBe(t('gameover.publishRefusedStaleBuild'))
    expect(message.toLowerCase()).toContain('recharge')
    expect(message.toLowerCase()).not.toContain('invalide')
    expect(message.toLowerCase()).not.toContain('replay')
    expect(message.toLowerCase()).not.toContain('triche')
    // Et il ne promet pas ce qui ne peut pas arriver : recharger la page jette le
    // replay, donc CE score-là ne partira jamais. Le message invite à recharger
    // pour les suivants, il n'annonce pas le sauvetage de celui-ci.
    expect(message.toLowerCase()).not.toContain('publier ce score')
  })

  // La publication étant automatique, rien ne dépend plus d'un geste : c'est `show()`
  // qui envoie. Si quelque chose l'appelait deux fois pour la MÊME partie, le second
  // envoi reviendrait en `already_submitted` — que cet écran affiche comme un succès,
  // classement révélé. Le défaut se cacherait donc derrière son propre symptôme, et
  // aucune alerte ne sonnerait.
  it('la même partie ne part qu’une fois, même si `show` est rappelé', async () => {
    let calls = 0
    const deps = fakeDeps({
      submitRun: async (): Promise<SubmitOutcome> => {
        calls += 1
        return { ok: true, runId: 'run-1', score: 1, rank: 1, total: 1, improved: true }
      },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    await flush()
    screen.show(STATS, REPLAY, noop, noop)
    await flush()
    expect(calls).toBe(1)
  })

  it('une réponse tardive d’une partie précédente n’écrase pas l’écran de la partie suivante', async () => {
    const first = deferred<SubmitOutcome>()
    const second = deferred<SubmitOutcome>()
    let calls = 0
    const deps = fakeDeps({
      submitRun: async () => {
        calls += 1
        return calls === 1 ? first.promise : second.promise
      },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)
    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('sending')

    // Nouvelle partie avant que la première réponse n'arrive : sa propre publication démarre
    // aussitôt, dès ce second `show()` (plus de geste à attendre).
    //
    // Un replay DISTINCT, et c'est fidèle au jeu : `game.ts` appelle `recorder.build()`
    // à chaque mort, donc deux parties ne partagent jamais le même objet. Réutiliser la
    // même constante ferait buter ce test sur la garde anti-double-envoi de `doSubmit`,
    // qui existe précisément pour qu'une même partie ne parte pas deux fois.
    screen.show(STATS, { ...REPLAY }, noop, noop)

    // Réponse tardive de la PREMIÈRE partie.
    first.resolve({ ok: true, runId: 'run-1', score: 1, rank: 9, total: 9, improved: true })
    await flush()

    // Toujours « en cours d'envoi » : c'est la réponse de la partie EN COURS (la seconde) qui
    // manque encore, pas celle — tardive — de la première.
    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('sending')

    // Réponse (à temps, cette fois) de la seconde partie : c'est bien elle qui s'affiche.
    second.resolve({ ok: true, runId: 'run-1', score: 2, rank: 3, total: 7, improved: false })
    await flush()
    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('published')
    expect(root.querySelector('[data-publish-result]')?.textContent).toContain(
      t('gameover.publishedRank', { rank: 3, total: 7 }),
    )
  })

  it('Espace relance immédiatement', () => {
    let restarted = false
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, fakeDeps())
    screen.show(
      STATS,
      REPLAY,
      () => {
        restarted = true
      },
      noop,
    )
    expect(screen.handleKey('Space')).toBe(true)
    expect(restarted).toBe(true)
  })

  it('Échap retourne au menu', () => {
    let toMenuCalled = false
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, fakeDeps())
    screen.show(STATS, REPLAY, noop, () => {
      toMenuCalled = true
    })
    expect(screen.handleKey('Escape')).toBe(true)
    expect(toMenuCalled).toBe(true)
  })
})
