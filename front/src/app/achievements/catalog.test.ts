import { describe, expect, it } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import { NIBS, SKIN_IDS } from '@/render/views/nibs'
import { ACHIEVEMENTS } from './catalog'

const locales: Record<string, Record<string, string>> = { fr, en }

describe('catalogue des succès', () => {
  it('compte 23 succès à identifiants uniques', () => {
    expect(ACHIEVEMENTS).toHaveLength(23)
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(23)
  })

  it('porte un nom et une condition dans les deux langues', () => {
    for (const [name, dict] of Object.entries(locales)) {
      for (const a of ACHIEVEMENTS) {
        expect(dict[`achievement.${a.id}.name`], `${name} ${a.id} name`).toBeTruthy()
        expect(dict[`achievement.${a.id}.desc`], `${name} ${a.id} desc`).toBeTruthy()
      }
    }
  })

  it('nomme chaque tracé dans les deux langues', () => {
    for (const [name, dict] of Object.entries(locales)) {
      for (const skin of SKIN_IDS) {
        expect(dict[`skin.${skin}.name`], `${name} ${skin}`).toBeTruthy()
      }
    }
  })

  it('ne référence que des tracés existants', () => {
    for (const a of ACHIEVEMENTS) {
      if (a.skin) {
        expect(NIBS[a.skin]).toBeDefined()
      }
    }
  })

  // La plume est le défaut, donc gratuite ; les six autres doivent être
  // gagnables, et par un seul succès — deux portes vers la même récompense
  // rendraient l'une des deux sans objet.
  it('ouvre chaque tracé sauf la plume par exactement un succès', () => {
    const porteurs = ACHIEVEMENTS.filter((a) => a.skin).map((a) => a.skin)
    expect(porteurs).toHaveLength(6)
    expect(new Set(porteurs).size).toBe(6)
    expect(porteurs).not.toContain('quill')
  })
})
