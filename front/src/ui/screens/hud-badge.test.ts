import { describe, expect, it } from 'vitest'

import { ACHIEVEMENTS } from '@/app/achievements/catalog'
import { BADGE_MS, createBadgeQueue } from './hud-badge'

function def(id: string) {
  const found = ACHIEVEMENTS.find((a) => a.id === id)
  if (!found) {
    throw new Error(`succès inconnu : ${id}`)
  }
  return found
}

// `createBadgeView` construit un `HTMLElement` : intestable sous `environment:
// 'node'` (`vitest.config.ts`), sans jsdom en dépendance. Seule la file,
// pure, est testée ici — voir `hud-combo.ts` (`comboTint`) pour le même
// arbitrage sur ce module.
describe('file du bandeau de succès', () => {
  it('ne montre rien tant que rien n’est ouvert', () => {
    const queue = createBadgeQueue()
    expect(queue.current).toBeNull()
  })

  it('met en avant le succès poussé', () => {
    const queue = createBadgeQueue()
    queue.push(def('wave-10'))
    queue.update(0)
    expect(queue.current?.id).toBe('wave-10')
  })

  // Deux succès ouverts au même pas doivent défiler, pas se superposer.
  it('enchaîne la file un succès à la fois', () => {
    const queue = createBadgeQueue()
    queue.push(def('wave-5'))
    queue.push(def('wave-10'))
    queue.update(0)
    expect(queue.current?.id).toBe('wave-5')

    queue.update(BADGE_MS)
    expect(queue.current?.id).toBe('wave-10')

    queue.update(BADGE_MS)
    expect(queue.current).toBeNull()
  })

  it('se vide entre deux parties', () => {
    const queue = createBadgeQueue()
    queue.push(def('wave-5'))
    queue.clear()
    queue.update(0)
    expect(queue.current).toBeNull()
  })
})
