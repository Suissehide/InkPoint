import { Container, type Graphics } from 'pixi.js'
import { describe, expect, it } from 'vitest'

import { afterimageAlpha, createAfterimages } from './afterimage'

function disque(gfx: Graphics): void {
  gfx.circle(0, 0, 6).fill({ color: 0xffffff })
}

describe('afterimageAlpha', () => {
  it('part plein et tombe à zéro pile en fin de vie', () => {
    expect(afterimageAlpha(0, 250)).toBe(1)
    expect(afterimageAlpha(250, 250)).toBe(0)
  })

  it('ne redevient jamais négatif', () => {
    expect(afterimageAlpha(1000, 250)).toBe(0)
  })
})

describe('createAfterimages', () => {
  it('respecte le plafond de fantômes qu’on lui donne', () => {
    const container = new Container()
    const fantomes = createAfterimages(container, { draw: disque, limit: 3 })
    for (let i = 0; i < 10; i++) {
      fantomes.emit(i, 0, 0)
    }
    expect(container.children.length).toBe(3)
    fantomes.destroy()
  })

  it('dessine la silhouette qu’on lui passe, pas une autre', () => {
    const container = new Container()
    let appels = 0
    const fantomes = createAfterimages(container, {
      draw: (gfx) => {
        appels++
        disque(gfx)
      },
      limit: 8,
    })
    fantomes.emit(0, 0, 0)
    fantomes.emit(0, 0, 0)
    expect(appels).toBe(2)
    fantomes.destroy()
  })

  it('efface les fantômes arrivés en fin de vie', () => {
    const container = new Container()
    const fantomes = createAfterimages(container, { draw: disque, limit: 8 })
    fantomes.emit(0, 0, 0)
    fantomes.update(300)
    expect(container.children.length).toBe(0)
    fantomes.destroy()
  })

  it('tout nettoyer ne laisse rien derrière', () => {
    const container = new Container()
    const fantomes = createAfterimages(container, { draw: disque, limit: 8 })
    fantomes.emit(0, 0, 0)
    fantomes.emit(1, 0, 0)
    fantomes.destroy()
    expect(container.children.length).toBe(0)
  })
})
