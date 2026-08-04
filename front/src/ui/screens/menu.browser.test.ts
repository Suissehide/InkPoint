import { beforeEach, describe, expect, it } from 'vitest'

import type { LeaderboardEntry } from '@/app/leaderboard-client'
import { setLocale, t } from '@/i18n'
import { createMenuScreen, type MenuDeps } from './menu'

/**
 * Suite en mode navigateur (`vitest.browser.config.ts`), et non `npx vitest run` nu : cet écran
 * construit du vrai DOM (`document.createElement`) et monte `createLeaderboardPanel`, qui en
 * fait autant — même raison que `gameover.browser.test.ts` et `leaderboard.browser.test.ts`.
 *
 * `fetchLeaderboard`/`readNickname` sont injectées via `MenuDeps`, jamais remplacées par
 * `vi.mock` (non intercepté sous ce lanceur, voir la docstring de `GameOverDeps`).
 */

const noop = (): void => {
  /* callback non exercé par ce test */
}

function actions() {
  return { onPlay: noop, onSettings: noop, onSkinChange: noop }
}

function row(nickname: string, rank: number, score: number): LeaderboardEntry {
  return { rank, nickname, score, wave: 1, arenaId: 0, createdAt: '2026-08-04T00:00:00.000Z' }
}

function fakeDeps(overrides: Partial<MenuDeps> = {}): MenuDeps {
  return {
    fetchLeaderboard: async () => null,
    readNickname: () => null,
    ...overrides,
  }
}

/** Voir la docstring de `flush` dans `gameover.browser.test.ts` : un `setTimeout(0)` vide la
 * file de microtâches quel que soit le nombre de sauts asynchrones enchaînés. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** L'entrée « Classement » : cinquième (index 4) — jouer, succès, tracés, améliorations,
 * classement, réglages. */
function openLeaderboardEntry(root: HTMLElement): void {
  root.querySelector<HTMLElement>('[data-nav-index="4"]')?.click()
}

describe('menu — panneau de classement', () => {
  beforeEach(() => {
    setLocale('fr')
  })

  it('en chargement puis chargé : affiche les lignes reçues', async () => {
    const deps = fakeDeps({ fetchLeaderboard: async () => ({ top: [row('ana', 1, 100)] }) })
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), deps)
    screen.show()

    openLeaderboardEntry(root)
    expect(root.textContent).toContain(t('leaderboard.loading'))

    await flush()
    expect(root.querySelector('[data-nickname]')?.textContent).toBe('ana')
  })

  // Falsification (brief) : `fetchLeaderboard` qui rend `null` doit produire une explication
  // visible, jamais un panneau vide — voir la docstring d'`openLeaderboard` dans `menu.ts`.
  it('classement injoignable : montre l’état d’erreur générique, jamais un panneau vide', async () => {
    const deps = fakeDeps({ fetchLeaderboard: async () => null })
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), deps)
    screen.show()

    openLeaderboardEntry(root)
    await flush()

    expect(root.textContent).toContain(t('leaderboard.error'))
    expect(root.querySelector('[data-row]')).toBeNull()
  })

  // Spec §8 : le panneau du menu doit passer le pseudo mémorisé, seule façon pour le serveur de
  // renvoyer la ligne « toi » quand le joueur est hors du top rendu.
  it('passe le pseudo mémorisé à `fetchLeaderboard`', async () => {
    let received: string | null | undefined
    const deps = fakeDeps({
      readNickname: () => 'leo',
      fetchLeaderboard: async (nickname) => {
        received = nickname
        return { top: [row('ana', 1, 100)], you: row('leo', 73, 5) }
      },
    })
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), deps)
    screen.show()

    openLeaderboardEntry(root)
    await flush()

    expect(received).toBe('leo')
    expect(root.querySelector('[data-you]')?.textContent).toContain('leo')
  })

  it('Échap depuis le classement revient au menu principal', () => {
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), fakeDeps())
    screen.show()

    openLeaderboardEntry(root)
    expect(screen.handleKey('Escape')).toBe(true)
    expect(root.querySelector('[data-nav-index="0"]')).not.toBeNull()
  })

  // Une ouverture quittée avant la réponse ne doit pas écrire sur le panneau après coup — même
  // garde que `generation` dans `gameover.ts` (voir `leaderboardGeneration`).
  it('une réponse tardive après un retour au menu principal n’écrit pas sur le panneau', async () => {
    let resolveFetch: (data: { top: LeaderboardEntry[] } | null) => void = () => {
      /* remplacé ci-dessous */
    }
    const pending = new Promise<{ top: LeaderboardEntry[] } | null>((resolve) => {
      resolveFetch = resolve
    })
    const deps = fakeDeps({ fetchLeaderboard: async () => pending })
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), deps)
    screen.show()

    openLeaderboardEntry(root)
    expect(screen.handleKey('Escape')).toBe(true)

    resolveFetch({ top: [row('ana', 1, 100)] })
    await flush()

    // De retour à la vue principale : aucune ligne de classement ne doit être apparue.
    expect(root.querySelector('[data-nickname]')).toBeNull()
  })
})
