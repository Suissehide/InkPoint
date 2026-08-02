import { describe, expect, it } from 'vitest'

import { INK } from '../ink'
import { enemyBodyColor } from './enemy'

describe('enemyBodyColor', () => {
  it("donne à l'Éclat une encre à lui", () => {
    expect(enemyBodyColor('shard', false, 0)).toBe(INK.shard)
    expect(enemyBodyColor('shard', false, 0)).not.toBe(enemyBodyColor('point', false, 0))
  })

  it('laisse le Point et le Blot en rouge', () => {
    expect(enemyBodyColor('point', false, 0)).toBe(INK.danger)
    expect(enemyBodyColor('blot', false, 0)).toBe(INK.danger)
  })

  it("fait passer le gel avant l'espèce : un Éclat gelé est bleu comme les autres", () => {
    expect(enemyBodyColor('shard', true, 0)).toBe(INK.frost)
    expect(enemyBodyColor('shard', true, 0)).toBe(enemyBodyColor('point', true, 0))
  })

  it('blanchit complètement à la mort, gelé ou non', () => {
    expect(enemyBodyColor('shard', false, 1)).toBe(INK.paper)
    expect(enemyBodyColor('shard', true, 1)).toBe(INK.paper)
  })
})
