import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LeaderboardEntry } from '@/app/leaderboard-client'
import { normalizeNickname } from '@/app/nickname'
import { setLocale, t } from '@/i18n'
import { createMenuScreen, type MenuDeps } from './menu'

/**
 * Suite en mode navigateur (`vitest.browser.config.ts`), et non `npx vitest run` nu : cet écran
 * construit du vrai DOM (`document.createElement`) et monte `createLeaderboardPanel`, qui en
 * fait autant — même raison que `gameover.browser.test.ts` et `leaderboard.browser.test.ts`.
 *
 * `fetchLeaderboard`/`ensureNickname`/`writeNickname` sont injectées via `MenuDeps`, jamais
 * remplacées par `vi.mock` (non intercepté sous ce lanceur, voir la docstring de `GameOverDeps`).
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
    ensureNickname: () => 'leo',
    writeNickname: (raw) => {
      const clean = normalizeNickname(raw)
      return clean === '' ? null : clean
    },
    ...overrides,
  }
}

/** Voir la docstring de `flush` dans `gameover.browser.test.ts` : un `setTimeout(0)` vide la
 * file de microtâches quel que soit le nombre de sauts asynchrones enchaînés. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/** L'entrée « Classement » : cinquième (index 4) — jouer, succès, tracés, améliorations,
 * classement, réglages. La rangée pseudo, elle, vient après : voir `NICKNAME_NAV_INDEX` dans
 * `menu.ts`, sixième et dernière rangée du menu principal (index 6). */
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

  // Spec §8 : le panneau du menu doit passer le pseudo courant, seule façon pour le serveur de
  // renvoyer la ligne « toi » quand le joueur est hors du top rendu. `ensureNickname` remplace
  // `readNickname` : ce pseudo existe toujours désormais, y compris au tout premier lancement.
  it('passe le pseudo courant à `fetchLeaderboard`', async () => {
    let received: string | null | undefined
    const deps = fakeDeps({
      ensureNickname: () => 'leo',
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

describe('menu — champ pseudo (spec §8, lot final)', () => {
  beforeEach(() => {
    setLocale('fr')
  })

  // Le pseudo se règle ICI, AVANT qu'une partie ne commence : `gameover.ts` publie désormais
  // sans aucun geste du joueur, avec le pseudo réglé d'avance (`ensureNickname`).
  // Le défaut que onze tests au vert n'avaient pas vu, parce qu'aucun ne déplace de
  // souris : `render()` réécrit `content.innerHTML` en entier, et `bindHoverNav` le
  // déclenche au survol de n'importe quelle autre rangée. Glisser du champ vers
  // « Jouer » détruisait donc l'`input` en cours de route, et ce qu'on venait de taper
  // disparaissait sans un mot — toute la session publiant sous l'ancien pseudo, que la
  // phrase affichée sous ce champ interdit de renommer après coup.
  it('la saisie survit au survol d’une autre entrée du menu', () => {
    let stored = 'Encreur 4821'
    const deps = fakeDeps({
      ensureNickname: () => stored,
      writeNickname: (raw: string) => {
        const clean = normalizeNickname(raw)
        if (clean === '') {
          return null
        }
        stored = clean
        return clean
      },
    })
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), deps)
    screen.show()

    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      throw new Error('champ pseudo introuvable')
    }
    input.value = 'leo'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    // Le geste ordinaire : remonter vers une autre entrée. C'est lui qui redessine.
    const other = root.querySelector<HTMLElement>('[data-nav-index="0"]')
    other?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))

    expect(stored).toBe('leo')
    expect(root.querySelector<HTMLInputElement>('[data-nickname-input]')?.value).toBe('leo')
  })

  it('le champ est pré-rempli avec le pseudo courant', () => {
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), fakeDeps({ ensureNickname: () => 'ana' }))
    screen.show()
    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    expect(input?.value).toBe('ana')
  })

  // Falsification (brief) : un pseudo saisi avec des espaces de tête et un caractère invisible
  // doit ressortir normalisé, jamais tel quel — même garde que l'ancien champ de `settings.ts`.
  it('la saisie passe par `writeNickname` : espaces de tête et caractère invisible disparaissent', () => {
    const written = vi.fn((raw: string) => {
      const clean = normalizeNickname(raw)
      return clean === '' ? null : clean
    })
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), fakeDeps({ writeNickname: written }))
    screen.show()

    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      throw new Error('champ pseudo introuvable')
    }
    // Espace de tête + ZERO WIDTH SPACE, en séquence d'échappement pour rester lisible et
    // vérifiable — même choix que `nickname.ts`, voir sa docstring `INVISIBLE_FORMATTING`.
    const raw = ' \u200Bana '
    input.value = raw
    input.dispatchEvent(new Event('blur'))

    expect(written).toHaveBeenCalledWith(raw)
    expect(input.value).toBe('ana')
    expect(input.value).not.toBe(raw)
  })

  // Décision du brief : `writeNickname` ne vide jamais le stockage sur un résultat vide (voir sa
  // docstring dans `nickname.ts`) — laisser le champ vide mentirait sur ce qui sera utilisé à la
  // prochaine publication automatique. Il revient donc au pseudo réellement mémorisé.
  it('champ vidé : ne prétend pas avoir effacé le pseudo, revient à celui mémorisé', () => {
    const root = document.createElement('div')
    const screen = createMenuScreen(
      root,
      actions(),
      fakeDeps({ ensureNickname: () => 'leo', writeNickname: () => null }),
    )
    screen.show()

    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      throw new Error('champ pseudo introuvable')
    }
    input.value = '   '
    input.dispatchEvent(new Event('blur'))

    expect(input.value).toBe('leo')
  })

  it('Entrée valide comme le fait perdre le focus au champ', () => {
    const written = vi.fn((raw: string) => raw.trim() || null)
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), fakeDeps({ writeNickname: written }))
    screen.show()

    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      throw new Error('champ pseudo introuvable')
    }
    input.value = 'ana'
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))

    expect(written).toHaveBeenCalledWith('ana')
    expect(input.value).toBe('ana')
  })

  it('Échap dans le champ annule la saisie en cours', () => {
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), fakeDeps({ ensureNickname: () => 'leo' }))
    screen.show()

    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      throw new Error('champ pseudo introuvable')
    }
    input.value = 'brouillon non validé'
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))

    expect(input.value).toBe('leo')
  })

  /**
   * Falsification (tâche 5 du lot final) : l'invariant qui empêche un `Espace` tapé dans le
   * champ pseudo d'activer l'entrée du menu actuellement sélectionnée (`game.ts`, routage
   * clavier global sur `window`, phase de bulle) tient tout entier sur ce seul
   * `e.stopPropagation()` dans `menu.ts`. Rien d'autre ne le garde — supprimer cet appel laisse
   * toute la suite verte par ailleurs (aucun test n'atteint `game.ts`, qui n'a pas de suite
   * dédiée), donc c'est ICI qu'il doit rougir. Espionner l'événement dispatché plutôt que de
   * monter `game.ts` en entier : la portée exacte de l'invariant à prouver.
   */
  it('la frappe dans le champ pseudo appelle stopPropagation (empêche `game.ts` de la router vers `Espace`/`Échap`)', () => {
    const root = document.createElement('div')
    const screen = createMenuScreen(root, actions(), fakeDeps())
    screen.show()
    const input = root.querySelector<HTMLInputElement>('[data-nickname-input]')
    expect(input).not.toBeNull()

    const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })
    const stopPropagation = vi.spyOn(event, 'stopPropagation')
    input?.dispatchEvent(event)

    expect(stopPropagation).toHaveBeenCalled()
  })
})
