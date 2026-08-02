import { describe, expect, it } from 'vitest'

import { createCamera, kickFor, MAX_AMPLITUDE, shakeForFelt, traumaAmplitude } from './camera'

describe('createCamera', () => {
  it('reste immobile au repos', () => {
    const cam = createCamera()
    expect(cam.update(16)).toEqual({ x: 0, y: 0 })
  })

  it('se décale après une secousse', () => {
    const cam = createCamera()
    cam.shake(20)
    const o = cam.update(16)
    expect(Math.hypot(o.x, o.y)).toBeGreaterThan(0)
  })

  it("revient au repos en moins d'une seconde", () => {
    const cam = createCamera()
    cam.shake(20)
    for (let i = 0; i < 70; i++) {
      cam.update(16)
    }
    const o = cam.update(16)
    expect(Math.hypot(o.x, o.y)).toBeLessThan(0.5)
  })

  it('cumule les secousses sans dépasser le plafond', () => {
    const cam = createCamera()
    for (let i = 0; i < 50; i++) {
      cam.shake(20)
    }
    const o = cam.update(16)
    expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(30)
  })

  it('respecte le plafond même quand la poussée dirigée s’ajoute au bruit', () => {
    // Régression : bruit + poussée non bornés ensemble dépassaient le plafond.
    const cam = createCamera()
    // Ré-secoué à chaque frame : le bruit reste maximal, l'angle aléatoire finit
    // forcément par pointer dans le sens de la poussée.
    for (let i = 0; i < 200; i++) {
      cam.shake(MAX_AMPLITUDE, 1, 0)
      const o = cam.update(16)
      expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(MAX_AMPLITUDE + 1e-9)
    }
  })
})

describe('shakeUpTo', () => {
  it('amène l’écran au niveau ressenti demandé', () => {
    const cam = createCamera()
    cam.shakeUpTo(4)
    // Un pas très court : la décroissance n'a presque rien mangé.
    const o = cam.update(0.001)
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(4, 1)
  })

  it('ne s’empile pas : dix appels d’affilée valent le même tremblement qu’un seul', () => {
    // Le cœur de la correction : en fin de partie les kills s'enchaînent, et
    // `shake` cumulait jusqu'à coller l'image au plafond de la caméra.
    const empile = createCamera()
    const seul = createCamera()
    for (let i = 0; i < 10; i++) {
      empile.shakeUpTo(4)
    }
    seul.shakeUpTo(4)
    const a = empile.update(0.001)
    const b = seul.update(0.001)
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(Math.hypot(b.x, b.y), 6)
  })

  it('laisse la secousse redescendre entre deux rafales espacées', () => {
    // Une frame de jeu entre chaque impact, sur trois secondes : sans le
    // plafonnement l'amplitude saturait et n'en repartait jamais.
    const cam = createCamera()
    let max = 0
    for (let i = 0; i < 180; i++) {
      cam.shakeUpTo(2)
      const o = cam.update(16.67)
      max = Math.max(max, Math.hypot(o.x, o.y))
    }
    expect(max).toBeLessThan(3)
  })

  it('n’écrase pas une secousse plus forte déjà en cours', () => {
    // La mort et le halo brisé passent par `shake` : un kill simultané ne doit
    // pas ramener leur grande secousse à sa petite valeur.
    const cam = createCamera()
    cam.shake(MAX_AMPLITUDE)
    cam.shakeUpTo(1)
    const o = cam.update(0.001)
    expect(Math.hypot(o.x, o.y)).toBeGreaterThan(MAX_AMPLITUDE / 2)
  })
})

describe('traumaAmplitude', () => {
  it('ne déplace rien au repos', () => {
    expect(traumaAmplitude(0)).toBe(0)
  })

  it('laisse le plafond intact', () => {
    expect(traumaAmplitude(MAX_AMPLITUDE)).toBeCloseTo(MAX_AMPLITUDE, 10)
  })

  it('écrase les petites secousses plus que les grosses', () => {
    // Le carré est ce qui rend la retombée nerveuse : à mi-amplitude, on ne
    // ressent qu'un quart du déplacement, pas la moitié.
    expect(traumaAmplitude(MAX_AMPLITUDE / 2)).toBeCloseTo(MAX_AMPLITUDE / 4, 10)
  })

  it('reste monotone croissante', () => {
    expect(traumaAmplitude(10)).toBeGreaterThan(traumaAmplitude(5))
  })
})

describe('shakeForFelt', () => {
  it('est bien la réciproque de traumaAmplitude', () => {
    expect(traumaAmplitude(shakeForFelt(3.5))).toBeCloseTo(3.5, 10)
  })

  it('atteint le plafond sans le dépasser', () => {
    expect(traumaAmplitude(shakeForFelt(MAX_AMPLITUDE))).toBeCloseTo(MAX_AMPLITUDE, 10)
  })

  it('ne demande rien pour zéro pixel ressenti', () => {
    expect(shakeForFelt(0)).toBe(0)
  })

  it('borne au plancher plutôt que de renvoyer NaN', () => {
    expect(shakeForFelt(-5)).toBe(0)
  })
})

describe('kickFor', () => {
  it('ne pousse nulle part sans direction', () => {
    expect(kickFor(20, 0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('pousse dans la direction donnée, proportionnellement à la secousse', () => {
    const kick = kickFor(20, 1, 0)
    expect(kick.x).toBeGreaterThan(0)
    expect(kick.y).toBe(0)
    expect(kickFor(10, 1, 0).x).toBeLessThan(kick.x)
  })

  it('normalise la direction : seule son orientation compte', () => {
    expect(kickFor(20, 3, 0)).toEqual(kickFor(20, 1, 0))
  })

  it('affaiblit la poussée quand la direction est plus courte que 1', () => {
    // `shake` reçoit la MOYENNE des directions de kill : une foule qui entoure
    // le joueur s'annule presque et doit secouer sans pousser.
    expect(kickFor(20, 0.5, 0).x).toBeCloseTo(kickFor(20, 1, 0).x / 2, 10)
    expect(kickFor(20, 0.001, 0).x).toBeCloseTo(kickFor(20, 1, 0).x / 1000, 10)
  })
})
