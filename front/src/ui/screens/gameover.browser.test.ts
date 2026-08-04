import type { Replay } from '@sim/replay/format'
import { beforeEach, describe, expect, it } from 'vitest'

import type { LeaderboardEntry, SubmitOutcome } from '@/app/leaderboard-client'
import { setLocale, t } from '@/i18n'
import { createGameOverScreen, type GameOverDeps, type GameOverStats } from './gameover'

/**
 * Suite en mode navigateur (`vitest.browser.config.ts`), et non `npx vitest run` nu : cet écran
 * construit du vrai DOM (`document.createElement`), que Node ne fournit pas — même raison que
 * `leaderboard.browser.test.ts` (tâche 6).
 *
 * Les quatre fonctions consommées (`submitRun`, `fetchLeaderboard`, `readNickname`,
 * `writeNickname`) sont injectées via `GameOverDeps`, jamais remplacées par `vi.mock` : ce
 * mécanisme n'est pas intercepté sous le lanceur navigateur de ce dépôt (Vitest 2.1.9, provider
 * Playwright — voir la docstring de `sim/replay/run.mocked.test.ts`, qui documente le même
 * défaut pour `../step`/`../upgrades/offer`, mesuré et confirmé indépendamment).
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
  return { rank, nickname, score, wave: 3, arenaId: 0, createdAt: '2026-08-04T00:00:00.000Z' }
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

function fakeDeps(overrides: Partial<GameOverDeps> = {}): GameOverDeps {
  return {
    submitRun: async () => {
      throw new Error('submitRun ne devrait pas être appelé dans ce test')
    },
    fetchLeaderboard: async () => null,
    readNickname: () => null,
    writeNickname: (raw) => (raw.trim() === '' ? null : raw.trim()),
    ...overrides,
  }
}

describe('écran de fin — publication au classement', () => {
  // Locale fixée explicitement : le test « stale_build » vérifie la formulation
  // française mot pour mot (spec §6), et `t()` résout selon la locale courante,
  // globale au module `@/i18n` — sans ce garde-fou, l'assertion dépendrait de
  // la locale par défaut du lanceur (`en`) plutôt que du contenu réel du texte.
  beforeEach(() => {
    setLocale('fr')
  })

  it('au repos : le bouton de publication est visible et actif', () => {
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, fakeDeps())
    screen.show(STATS, REPLAY, noop, noop)
    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('idle')
    const button = root.querySelector<HTMLButtonElement>('[data-action="publish"]')
    expect(button).not.toBeNull()
    expect(button?.disabled).toBe(false)
  })

  it('en cours d’envoi : le bouton se désactive, un second clic ne publie pas deux fois', async () => {
    let calls = 0
    const { promise, resolve } = deferred<SubmitOutcome>()
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () => {
        calls += 1
        return promise
      },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('sending')
    const sending = root.querySelector<HTMLButtonElement>('[data-action="publish"]')
    expect(sending?.disabled).toBe(true)
    // Un bouton désactivé ne déclenche pas son écouteur de clic, quel que
    // soit le nombre de fois où on l'actionne — le navigateur applique la
    // règle, ce test la vérifie.
    sending?.click()
    sending?.click()

    resolve({ ok: true, score: 1234, rank: 4, total: 10, improved: false })
    await flush()
    expect(calls).toBe(1)
  })

  it('publié : montre le rang et le total', async () => {
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () => ({ ok: true, score: 1234, rank: 4, total: 10, improved: false }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    await flush()

    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('published')
    expect(root.querySelector('[data-publish-result]')?.textContent).toContain(
      t('gameover.publishedRank', { rank: 4, total: 10 }),
    )
  })

  it('publié avec amélioration : annonce le nouveau record', async () => {
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () => ({ ok: true, score: 1234, rank: 1, total: 10, improved: true }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    await flush()

    expect(root.querySelector('[data-publish-result]')?.textContent).toContain(
      t('gameover.publishedImproved'),
    )
  })

  it('publié : révèle le classement, avec le pseudo publié mis en évidence', async () => {
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () => ({ ok: true, score: 1234, rank: 2, total: 5, improved: false }),
      fetchLeaderboard: async (nickname) =>
        nickname === null ? null : { top: [row('ana', 1, 2000), row(nickname, 2, 1234)] },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    await flush()

    const highlighted = root.querySelector('[data-highlighted] [data-nickname]')
    expect(highlighted?.textContent).toBe('leo')
  })

  it('publié mais classement injoignable : le panneau passe en erreur, jamais vide sans explication', async () => {
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () => ({ ok: true, score: 1, rank: 1, total: 1, improved: false }),
      fetchLeaderboard: async () => null,
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    await flush()

    expect(root.textContent).toContain(t('leaderboard.error'))
  })

  it('refusé avec un motif inconnu : retombe sur le message générique, jamais « undefined »', async () => {
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () => ({
        ok: false,
        reason: 'a_future_reason_this_client_does_not_know',
        message: 'peu importe le message brut du serveur',
      }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    await flush()

    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('refused')
    const message = root.querySelector('[data-publish-message]')?.textContent
    expect(message).toBe(t('gameover.publishRefusedUnknown'))
    expect(message).not.toContain('undefined')
    // Le bouton redevient disponible : un refus n'est pas une impasse.
    expect(root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.disabled).toBe(false)
  })

  it('un motif absent (JSON sans `reason`) retombe aussi sur le message générique', async () => {
    // Reproduit exactement le défaut relevé à la tâche 4 : un corps qui parse
    // en JSON mais sans `reason` reconnu (une page d'erreur de proxy, par
    // exemple) rend `{ ok: false, reason: undefined }` — `submitRun` ne lève
    // jamais, donc ce repli est le seul filet qui empêche « undefined »
    // d'atteindre le joueur.
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () =>
        ({ ok: false, reason: undefined, message: undefined }) as unknown as SubmitOutcome,
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    await flush()

    const message = root.querySelector('[data-publish-message]')?.textContent
    expect(message).toBe(t('gameover.publishRefusedUnknown'))
    expect(message).not.toContain('undefined')
  })

  it('hors ligne : le bouton reste disponible et un second essai republie', async () => {
    let calls = 0
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () => {
        calls += 1
        return { ok: false, reason: 'offline', message: 'service injoignable' }
      },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    await flush()
    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('refused')
    const retry = root.querySelector<HTMLButtonElement>('[data-action="publish"]')
    expect(retry?.disabled).toBe(false)

    retry?.click()
    await flush()
    expect(calls).toBe(2)
  })

  // Falsification (brief) : faire répondre `{ ok: false, reason: 'stale_build' }` et vérifier
  // l'invitation à recharger. `stale_build` est le refus le plus fréquent en production — tout
  // joueur avec un onglet ouvert pendant un déploiement le reçoit — donc le seul dont le libellé
  // est testé mot pour mot, et pas seulement par comparaison à la clé i18n.
  it('stale_build : invite à recharger, ne dit jamais le replay invalide, n’insinue jamais une triche', async () => {
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () => ({
        ok: false,
        reason: 'stale_build',
        message: 'simVersion mismatch',
      }),
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    await flush()

    const message = root.querySelector('[data-publish-message]')?.textContent ?? ''
    expect(message).toBe(t('gameover.publishRefusedStaleBuild'))
    expect(message.toLowerCase()).toContain('recharge')
    expect(message.toLowerCase()).not.toContain('invalide')
    expect(message.toLowerCase()).not.toContain('replay')
    expect(message.toLowerCase()).not.toContain('triche')
  })

  it('premier clic sans pseudo mémorisé : le demande dans l’écran, jamais via prompt()', async () => {
    let submitted: string | null = null
    const deps = fakeDeps({
      readNickname: () => null,
      submitRun: async (nickname) => {
        submitted = nickname
        return { ok: true, score: 1, rank: 1, total: 1, improved: false }
      },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('asking')
    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    expect(input).not.toBeNull()

    if (input) {
      input.value = 'leo'
    }
    root.querySelector<HTMLButtonElement>('[data-action="confirmNickname"]')?.click()
    await flush()

    expect(submitted).toBe('leo')
  })

  it('Entrée dans le champ pseudo publie, comme le bouton de confirmation', async () => {
    let submitted: string | null = null
    const deps = fakeDeps({
      readNickname: () => null,
      submitRun: async (nickname) => {
        submitted = nickname
        return { ok: true, score: 1, rank: 1, total: 1, improved: false }
      },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (input) {
      input.value = 'ana'
    }
    input?.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))
    await flush()

    expect(submitted).toBe('ana')
  })

  it('pseudo vide après normalisation : reste en attente, ne publie pas', () => {
    let called = false
    const deps = fakeDeps({
      readNickname: () => null,
      writeNickname: () => null,
      submitRun: async () => {
        called = true
        return { ok: true, score: 0, rank: 0, total: 0, improved: false }
      },
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    root.querySelector<HTMLButtonElement>('[data-action="confirmNickname"]')?.click()

    expect(called).toBe(false)
    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('asking')
  })

  it('une réponse tardive d’une partie précédente n’écrase pas l’écran de la partie suivante', async () => {
    const { promise, resolve } = deferred<SubmitOutcome>()
    const deps = fakeDeps({
      readNickname: () => 'leo',
      submitRun: async () => promise,
    })
    const root = document.createElement('div')
    const screen = createGameOverScreen(root, deps)
    screen.show(STATS, REPLAY, noop, noop)

    root.querySelector<HTMLButtonElement>('[data-action="publish"]')?.click()
    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('sending')

    // Nouvelle partie avant que la première réponse n'arrive.
    screen.show(STATS, REPLAY, noop, noop)
    resolve({ ok: true, score: 1, rank: 9, total: 9, improved: true })
    await flush()

    expect(root.querySelector('[data-publish]')?.getAttribute('data-state')).toBe('idle')
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
