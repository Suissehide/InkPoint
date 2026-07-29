import { describe, expect, it } from 'vitest'

import { createCamera } from './camera'

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
})
