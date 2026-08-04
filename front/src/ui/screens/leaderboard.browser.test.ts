import { describe, expect, it, vi } from 'vitest'

import type { LeaderboardEntry } from '@/app/leaderboard-client'
import { t } from '@/i18n'
import { createLeaderboardPanel } from './leaderboard'

function row(nickname: string, rank: number, score: number, arenaId = 0): LeaderboardEntry {
  return {
    id: `${nickname}-${rank}`,
    rank,
    nickname,
    score,
    wave: 1,
    arenaId,
    createdAt: '2026-08-04T00:00:00.000Z',
  }
}

/**
 * Suite en mode navigateur (`vitest.browser.config.ts`), et non `npx vitest run` nu : le
 * panneau construit du vrai DOM (`document.createElement`, `scrollIntoView`), que Node ne
 * fournit pas — contrairement à `leaderboard-client.browser.test.ts`, qui n'a besoin que
 * d'API que Node implémente aussi (`CompressionStream`, `atob`) et tourne donc sous les
 * deux lanceurs. `vitest.config.ts` exclut désormais ce fichier : voir sa docstring.
 *
 * La garantie la plus sensible du panneau — un pseudo qui ne peut jamais s'exécuter — n'a de
 * sens que rejouée dans un vrai moteur (Chromium, Firefox, WebKit), pas dans une
 * approximation comme jsdom : c'est CE parseur `innerHTML` réel qu'il faut prouver muet sur
 * `<img src=x onerror=…>`, celui que les joueurs auront réellement en face.
 */
describe('panneau de classement', () => {
  it('affiche les lignes dans l’ordre reçu', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.show({ top: [row('ana', 1, 300), row('bo', 2, 200), row('cy', 3, 100)] })
    const names = [...root.querySelectorAll<HTMLElement>('[data-scroll] [data-nickname]')].map(
      (el) => el.textContent,
    )
    expect(names).toEqual(['ana', 'bo', 'cy'])
  })

  it('affiche la ligne « toi » en pied quand elle est fournie', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.show({ top: [row('ana', 1, 100)], you: row('leo', 47, 8) })
    expect(root.querySelector('[data-you]')?.textContent).toContain('leo')
  })

  it('n’affiche pas de pied quand le joueur est dans la liste', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.show({ top: [row('leo', 1, 100)] })
    expect(root.querySelector('[data-you]')).toBeNull()
  })

  it('classement vide : invite à être le premier, sans ligne', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.show({ top: [] })
    expect(root.querySelector('[data-row]')).toBeNull()
    expect(root.textContent).toContain(t('leaderboard.empty'))
  })

  it('état de chargement', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.showLoading()
    expect(root.textContent).toContain(t('leaderboard.loading'))
  })

  it('état d’erreur', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.showError()
    expect(root.textContent).toContain(t('leaderboard.error'))
  })

  // Cent lignes défilent dans une hauteur bornée (spec de la tâche) : sans ça, l'écran de fin
  // déborderait. On vérifie la marque source (les classes Tailwind posées), pas le style
  // calculé — `vitest.browser.config.ts` ne charge pas le pipeline Tailwind de l'app, donc
  // `getComputedStyle` n'y verrait que les valeurs par défaut du navigateur.
  it('la zone de défilement est bornée en hauteur', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.show({ top: [row('ana', 1, 100)] })
    const scroll = root.querySelector<HTMLElement>('[data-scroll]')
    expect(scroll?.className).toContain('overflow-y-auto')
    expect(scroll?.className).toMatch(/max-h-/)
  })

  // Règles « arcade cabinet » : un pseudo occupe plusieurs lignes. Après une
  // publication, c'est LA partie qu'on vient de jouer qu'il faut désigner —
  // la marquer par pseudo allumerait aussi ses parties d'hier, et le joueur ne
  // saurait pas laquelle est la sienne.
  it('par identifiant : une seule ligne s’allume, même si le pseudo en occupe plusieurs', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.show(
      { top: [row('leo', 1, 300), row('ana', 2, 200), row('leo', 3, 100)] },
      { runId: 'leo-3' },
    )
    const highlighted = root.querySelectorAll('[data-highlighted]')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]?.textContent).toContain('100')
  })

  // L'autre cible, employée quand aucun identifiant n'est disponible (refus
  // `already_submitted`) : toutes les lignes du pseudo, ce qui reste juste.
  it('par pseudo : toutes ses lignes s’allument', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.show(
      { top: [row('leo', 1, 300), row('ana', 2, 200), row('leo', 3, 100)] },
      { nickname: 'leo' },
    )
    expect(root.querySelectorAll('[data-highlighted]')).toHaveLength(2)
  })

  // Rang 73 sur cent lignes : hors écran sans amenée dans la vue (brief).
  it('amène la ligne mise en évidence dans la vue', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    const top: LeaderboardEntry[] = []
    for (let i = 0; i < 100; i++) {
      top.push(row(`j${i}`, i + 1, 1000 - i))
    }
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
    panel.show({ top }, { nickname: 'j72' })
    const highlighted = root.querySelector<HTMLElement>('[data-highlighted]')
    expect(highlighted?.textContent).toContain('j72')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  // Falsification 1 (brief) : un pseudo qui porte du balisage reste du texte littéral, jamais
  // un nœud exécutable. Le serveur n'assainit pas le pseudo (spec §11) : `<b>` ici représente
  // n'importe quel `<img src=x onerror=…>` publié par un joueur.
  it('échappe le pseudo : un balisage publié reste du texte, jamais un nœud', () => {
    const root = document.createElement('div')
    const panel = createLeaderboardPanel(root)
    panel.show({ top: [row('<b>gras</b>', 1, 100)] })
    const slot = root.querySelector('[data-nickname]')
    expect(slot?.textContent).toBe('<b>gras</b>')
    expect(root.querySelector('b')).toBeNull()
  })
})
