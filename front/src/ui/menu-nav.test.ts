import { describe, expect, it } from 'vitest'

import { createMenuNav } from './menu-nav'

describe('createMenuNav', () => {
  it('démarre à 0', () => expect(createMenuNav(3).index).toBe(0))

  it('avance', () => {
    const nav = createMenuNav(3)
    nav.move(1)
    expect(nav.index).toBe(1)
  })

  it('boucle à la fin', () => {
    const nav = createMenuNav(3)
    nav.move(1)
    nav.move(1)
    nav.move(1)
    expect(nav.index).toBe(0)
  })

  it('boucle au début en reculant', () => {
    const nav = createMenuNav(3)
    nav.move(-1)
    expect(nav.index).toBe(2)
  })

  it('reset revient à 0', () => {
    const nav = createMenuNav(3)
    nav.move(1)
    nav.reset()
    expect(nav.index).toBe(0)
  })

  it('gère un seul élément', () => {
    const nav = createMenuNav(1)
    nav.move(1)
    expect(nav.index).toBe(0)
  })
})
