import { Container, type Graphics } from 'pixi.js'
import { describe, expect, it } from 'vitest'

import { createFixedLoop } from '@/app/loop'
import {
  type AfterimageBeat,
  advanceAfterimageBeat,
  afterimageAlpha,
  createAfterimages,
} from './afterimage'

function disque(gfx: Graphics): void {
  gfx.circle(0, 0, 6).fill({ color: 0xffffff })
}

const INTERVALLE_MS = 40

/** Le battement, replié sur une seule question : cette image émet-elle ? */
function batteur(): (dtMs: number, simAdvanced: boolean) => boolean {
  let beat: AfterimageBeat = { elapsedMs: 0, sawSimStep: false }
  return (dtMs, simAdvanced) => {
    const suite = advanceAfterimageBeat({ beat, dtMs, intervalMs: INTERVALLE_MS, simAdvanced })
    beat = { elapsedMs: suite.elapsedMs, sawSimStep: suite.sawSimStep }
    return suite.emit
  }
}

/**
 * Millisecondes par fantôme sur un écran à `hz`, entraîné par la VRAIE boucle à
 * pas fixe : c'est elle qui décide quelles images portent un pas de simulation,
 * et au-dessus de 60 Hz la plupart n'en portent aucun.
 */
function msParFantome(hz: number, dureeMs: number): number {
  const frameMs = 1000 / hz
  const image = batteur()
  let pas = 0
  let fantomes = 0
  const loop = createFixedLoop({
    onStep: (): void => {
      pas += 1
    },
    onRender: (): void => {
      if (image(frameMs, pas > 0)) {
        fantomes += 1
      }
      pas = 0
    },
  })
  for (let t = 0; t + frameMs <= dureeMs; t += frameMs) {
    loop.advance(frameMs)
  }
  return dureeMs / fantomes
}

describe('afterimageAlpha', () => {
  it('part plein et tombe à zéro pile en fin de vie', () => {
    expect(afterimageAlpha(0, 250)).toBe(1)
    expect(afterimageAlpha(250, 250)).toBe(0)
  })

  it('ne redevient jamais négatif', () => {
    expect(afterimageAlpha(1000, 250)).toBe(0)
  })

  it('décroît de façon monotone', () => {
    expect(afterimageAlpha(50, 250)).toBeGreaterThan(afterimageAlpha(150, 250))
  })
})

describe('advanceAfterimageBeat', () => {
  it('tient la cadence de 40 ms à 60 Hz, où chaque image porte un pas', () => {
    expect(msParFantome(60, 60_000)).toBeCloseTo(INTERVALLE_MS, 1)
  })

  it('tient la MÊME cadence au-dessus de 60 Hz, où la plupart des images n’en portent aucun', () => {
    // La traînée dit la vitesse : sa densité ne peut pas dépendre du
    // rafraîchissement de l'écran. Échantillonner le pas de simulation sur la
    // seule image qui franchit le seuil donnait 66,7 ms à 120 Hz et 100 ms à
    // 144 Hz — une traînée deux fois et demie trop claire sur un Mac ProMotion.
    for (const hz of [90, 120, 144, 165, 240]) {
      expect(msParFantome(hz, 60_000)).toBeCloseTo(INTERVALLE_MS, 1)
    }
  })

  it('n’émet qu’un fantôme au plus sur un monde figé, celui du dernier pas réel', () => {
    const image = batteur()
    // Le monde tourne : le battement est armé.
    for (let t = 0; t < 200; t += 8) {
      image(8, true)
    }
    // Gel de 4 s — séquence de mort, décompte, pause.
    let fantomes = 0
    let apresLaPremiereSeconde = 0
    for (let t = 0; t < 4000; t += 8) {
      if (image(8, false)) {
        fantomes += 1
        if (t >= 1000) {
          apresLaPremiereSeconde += 1
        }
      }
    }
    expect(fantomes).toBeLessThanOrEqual(1)
    expect(apresLaPremiereSeconde).toBe(0)
  })

  it('ne déverse pas le gel d’un coup au dégel', () => {
    const image = batteur()
    for (let t = 0; t < 4000; t += 8) {
      image(8, false)
    }
    // Le gel a traversé une centaine de battements. Le dégel n'en rend aucun :
    // sur 200 ms, la cadence ordinaire, pas 25 fantômes en rafale — ce que
    // donnerait un accumulateur qu'on laisserait grossir pendant le gel.
    let fantomes = 0
    for (let t = 0; t < 200; t += 8) {
      if (image(8, true)) {
        fantomes += 1
      }
    }
    expect(fantomes).toBeLessThanOrEqual(200 / INTERVALLE_MS + 1)
    expect(fantomes).toBeGreaterThanOrEqual(200 / INTERVALLE_MS - 1)
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
