import { Graphics } from 'pixi.js'
import { describe, expect, it } from 'vitest'

import { INK } from '../ink'
import {
  createEnemyView,
  type EnemyView,
  enemyBodyColor,
  facetPoints,
  shardAim,
  TELEGRAPH_RING_START,
  telegraphFade,
  telegraphRingRadius,
  thawFrostAmount,
} from './enemy'

/**
 * Le corps est le premier enfant de la vue, dans l'ordre d'ajout de
 * `createEnemyView`. Vitest tourne sous Node, mais un `Graphics` se construit
 * et se mesure sans WebGL — `fx/afterimage.test.ts` en dépend déjà.
 */
function corps(view: EnemyView): Graphics {
  const enfant = view.container.children[0]
  if (!(enfant instanceof Graphics)) {
    throw new Error('enemy.test: le premier enfant de la vue devrait être le corps')
  }
  return enfant
}

/** Options d'un ennemi solide, immobile, en pleine santé. */
function solide(over: Partial<Parameters<EnemyView['update']>[0]> = {}) {
  return {
    x: 0,
    y: 0,
    radius: 6,
    type: 'shard' as const,
    aim: 0,
    materializeProgress: 1,
    frozen: false,
    whiten: 0,
    dashState: 0,
    telegraphProgress: 0,
    aimLength: 50,
    ...over,
  }
}

describe('enemyBodyColor', () => {
  /** Somme des écarts composante par composante entre deux couleurs. */
  function ecart(a: number, b: number): number {
    return (
      Math.abs(((a >> 16) & 0xff) - ((b >> 16) & 0xff)) +
      Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)) +
      Math.abs((a & 0xff) - (b & 0xff))
    )
  }

  it('donne a l\'Eclat une encre a lui', () => {
    expect(enemyBodyColor('shard', 0, 0)).toBe(INK.shard)
    expect(enemyBodyColor('shard', 0, 0)).not.toBe(enemyBodyColor('point', 0, 0))
  })

  it('laisse le Point et le Blot en rouge', () => {
    expect(enemyBodyColor('point', 0, 0)).toBe(INK.danger)
    expect(enemyBodyColor('blot', 0, 0)).toBe(INK.danger)
  })

  it('fait passer le gel avant l\'espece : un Eclat gele est bleu comme les autres', () => {
    expect(enemyBodyColor('shard', 1, 0)).toBe(INK.frost)
    expect(enemyBodyColor('shard', 1, 0)).toBe(enemyBodyColor('point', 1, 0))
  })

  it('rapproche le corps de sa couleur d\'espece a chaque palier', () => {
    const gele = ecart(enemyBodyColor('point', 1, 0), INK.danger)
    const delave = ecart(enemyBodyColor('point', 0.5, 0), INK.danger)
    const presque = ecart(enemyBodyColor('point', 0.12, 0), INK.danger)
    expect(delave).toBeLessThan(gele)
    expect(presque).toBeLessThan(delave)
    // Pas zero : le dernier palier garde un reste de givre, sinon rien ne
    // distingue plus un ennemi qui va repartir d'un ennemi qui tue deja.
    expect(presque).toBeGreaterThan(0)
  })

  it('blanchit par-dessus le givre, quel que soit le palier', () => {
    for (const part of [1, 0.5, 0.12, 0]) {
      expect(enemyBodyColor('point', part, 1)).toBe(INK.paper)
    }
  })
})

describe('thawFrostAmount', () => {
  it('laisse le givre plein tant que le degel est loin', () => {
    expect(thawFrostAmount(4000)).toBe(1)
    expect(thawFrostAmount(701)).toBe(1)
  })

  it("delave le givre a partir du seuil d'alerte, seuil compris", () => {
    expect(thawFrostAmount(700)).toBe(0.5)
    expect(thawFrostAmount(221)).toBe(0.5)
  })

  it("rend presque toute sa couleur a l'ennemi sur la fin", () => {
    expect(thawFrostAmount(220)).toBe(0.12)
    expect(thawFrostAmount(0)).toBe(0.12)
  })

  it('ne remonte jamais quand le temps restant descend', () => {
    let precedent = Number.POSITIVE_INFINITY
    for (let ms = 1000; ms >= 0; ms -= 10) {
      const part = thawFrostAmount(ms)
      expect(part).toBeLessThanOrEqual(precedent)
      precedent = part
    }
  })
})

describe('facetPoints', () => {
  it('rend trois sommets, soit six coordonnées', () => {
    expect(facetPoints(6, 0)).toHaveLength(6)
  })

  it('pose le premier sommet sur l’angle demandé', () => {
    const [x, y] = facetPoints(6, 0)
    expect(x).toBeCloseTo(6, 10)
    expect(y).toBeCloseTo(0, 10)
  })

  it('pose tous les sommets sur le cercle du rayon donné', () => {
    const pts = facetPoints(6, 0.7)
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i] ?? 0, pts[i + 1] ?? 0)).toBeCloseTo(6, 10)
    }
  })

  it('espace les sommets de 120°', () => {
    const pts = facetPoints(6, 0)
    const angles = [0, 2, 4].map((i) => Math.atan2(pts[i + 1] ?? 0, pts[i] ?? 0))
    const ecart = ((angles[1] ?? 0) - (angles[0] ?? 0) + Math.PI * 2) % (Math.PI * 2)
    expect(ecart).toBeCloseTo((Math.PI * 2) / 3, 10)
  })

  it('creuse la moitié du rayon en milieu d’arête, ce qui est ce qui rend la facette visible', () => {
    const pts = facetPoints(6, 0)
    const milieu = {
      x: ((pts[0] ?? 0) + (pts[2] ?? 0)) / 2,
      y: ((pts[1] ?? 0) + (pts[3] ?? 0)) / 2,
    }
    expect(Math.hypot(milieu.x, milieu.y)).toBeCloseTo(3, 10)
  })

  it('tourne avec l’angle', () => {
    const [x, y] = facetPoints(6, Math.PI / 2)
    expect(x).toBeCloseTo(0, 10)
    expect(y).toBeCloseTo(6, 10)
  })
})

describe('shardAim', () => {
  it('suit le vecteur vitesse en charge, pas le joueur', () => {
    // Vitesse plein nord, joueur plein est : la charge ne corrige plus sa
    // trajectoire, c'est elle que la facette doit dire.
    expect(shardAim(2, 0, -10, 100, 0)).toBeCloseTo(-Math.PI / 2, 10)
  })

  it('pointe le joueur en approche et pendant le télégraphe', () => {
    // Même vitesse plein nord : hors de la charge, elle ne décide de rien.
    expect(shardAim(0, 0, -10, 100, 0)).toBeCloseTo(0, 10)
    expect(shardAim(1, 0, 0, 0, 50)).toBeCloseTo(Math.PI / 2, 10)
  })

  it('se rabat sur le joueur si la vitesse est nulle en charge', () => {
    // `freezeSystem` annule `Velocity` sans sortir de l'état 2 : sans ce repli,
    // `Math.atan2(0, 0)` figerait la facette plein est pendant tout le gel.
    expect(shardAim(2, 0, 0, 0, -50)).toBeCloseTo(-Math.PI / 2, 10)
    expect(shardAim(2, 0, 0, -50, 0)).toBeCloseTo(Math.PI, 10)
  })
})

describe('telegraphRingRadius', () => {
  it('part à quatre fois le rayon du corps', () => {
    expect(telegraphRingRadius(6, 0)).toBe(6 * TELEGRAPH_RING_START)
  })

  it('touche EXACTEMENT le corps à la fin : c’est le contact qui annonce le tir', () => {
    expect(telegraphRingRadius(6, 1)).toBe(6)
  })

  it('se contracte sans jamais repartir en arrière', () => {
    let precedent = Number.POSITIVE_INFINITY
    for (let k = 0; k <= 1; k += 0.01) {
      const r = telegraphRingRadius(6, k)
      expect(r).toBeLessThanOrEqual(precedent + 1e-9)
      precedent = r
    }
  })

  it('reste borné si l’avancement sort de [0, 1]', () => {
    expect(telegraphRingRadius(6, -1)).toBe(6 * TELEGRAPH_RING_START)
    expect(telegraphRingRadius(6, 2)).toBe(6)
  })
})

describe('telegraphFade', () => {
  it('rend ses bornes aux extrémités', () => {
    expect(telegraphFade(0, 0.5, 0.9)).toBeCloseTo(0.5, 10)
    expect(telegraphFade(1, 0.5, 0.9)).toBeCloseTo(0.9, 10)
  })

  it('ne sort jamais de l’intervalle, même hors de [0, 1]', () => {
    for (let k = -0.5; k <= 1.5; k += 0.05) {
      const a = telegraphFade(k, 0, 0.7)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(0.7)
    }
  })
})

describe('createEnemyView : ce qui est affiché est ce qui tue', () => {
  // La jointure `miter` par défaut de Pixi faisait dépasser les pointes du
  // triangle de 1 px — (edge/2)/sin(30°) — et non de edge/2 : les bornes
  // montaient à 6,5 pour un collider de 6. C'est cette mesure qui l'interdit.
  it('ne laisse aucune pointe de la facette sortir du rayon du collider', () => {
    const view = createEnemyView()
    const body = corps(view)
    // Balayage : la pointe qui dépassait tournait avec la visée.
    for (let aim = 0; aim < Math.PI * 2; aim += Math.PI / 12) {
      view.update(solide({ aim }))
      const b = body.context.bounds
      expect(b.maxX).toBeLessThanOrEqual(6 + 1e-9)
      expect(b.maxY).toBeLessThanOrEqual(6 + 1e-9)
      expect(b.minX).toBeGreaterThanOrEqual(-6 - 1e-9)
      expect(b.minY).toBeGreaterThanOrEqual(-6 - 1e-9)
    }
    view.container.destroy({ children: true })
  })

  it('garde aussi le liseré circulaire du Point dans son rayon', () => {
    const view = createEnemyView()
    const body = corps(view)
    view.update(solide({ type: 'point', radius: 7 }))
    const b = body.context.bounds
    expect(b.maxX).toBeLessThanOrEqual(7 + 1e-9)
    expect(b.maxY).toBeLessThanOrEqual(7 + 1e-9)
    expect(b.minX).toBeGreaterThanOrEqual(-7 - 1e-9)
    expect(b.minY).toBeGreaterThanOrEqual(-7 - 1e-9)
    view.container.destroy({ children: true })
  })
})

describe('createEnemyView : la clé de cache du corps', () => {
  /** Compte les redessins du corps : `GraphicsContext` émet `update` à chaque tracé. */
  function compteurDeRedessins(view: EnemyView): () => number {
    let n = 0
    corps(view).context.on('update', () => {
      n++
    })
    return () => n
  }

  it('ne redessine pas le corps sur deux appels identiques', () => {
    const view = createEnemyView()
    view.update(solide())
    const redessins = compteurDeRedessins(view)
    view.update(solide())
    expect(redessins()).toBe(0)
    view.container.destroy({ children: true })
  })

  it('redessine l’Éclat quand la facette tourne visiblement', () => {
    const view = createEnemyView()
    view.update(solide({ aim: 0 }))
    const redessins = compteurDeRedessins(view)
    view.update(solide({ aim: 0.2 }))
    expect(redessins()).toBeGreaterThan(0)
    view.container.destroy({ children: true })
  })

  it('ne redessine pas le Point pour un angle qui n’entre dans aucun tracé', () => {
    const view = createEnemyView()
    view.update(solide({ type: 'point', aim: 0 }))
    const redessins = compteurDeRedessins(view)
    view.update(solide({ type: 'point', aim: 0.2 }))
    expect(redessins()).toBe(0)
    view.container.destroy({ children: true })
  })
})
