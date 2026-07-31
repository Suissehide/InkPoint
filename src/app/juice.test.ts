import { describe, expect, it, vi } from 'vitest'

import type { Camera } from '@/render/camera'
import type { Flash } from '@/render/fx/flash'
import type { Shockwaves } from '@/render/fx/shockwave'
import type { Particles } from '@/render/particles'
import { Facing } from '@/sim/components'
import type { PowerUpKind } from '@/sim/data/powerups'
import { POWERUP_ID, POWERUP_KINDS } from '@/sim/data/powerups'
import { spawnPlayer } from '@/sim/spawn'
import { createWorld } from '@/sim/world'
import {
  applyJuice,
  COMBO_FLASH_MIN_MULTIPLIER,
  comboIntensity,
  createJuiceState,
  flashGate,
  HITSTOP_MS,
  resetJuiceState,
  timeScaleFor,
} from './juice'

function fakeFx(motionEnabled: boolean): {
  camera: Camera
  particles: Particles
  flash: Flash
  shockwaves: Shockwaves
  punch: (strength: number) => void
  motionEnabled: boolean
} {
  const camera: Camera = { shake: vi.fn(), update: vi.fn(() => ({ x: 0, y: 0 })) }
  const particles: Particles = { emitBurst: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const flash: Flash = { flash: vi.fn(), resize: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const shockwaves: Shockwaves = { emit: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  return { camera, particles, flash, shockwaves, punch: vi.fn(), motionEnabled }
}

describe('applyJuice — portée du mouvement réduit', () => {
  it('coupe la secousse et les particules sur un kill, mais laisse le hitstop se déclencher', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const state = createJuiceState()
    const fx = fakeFx(false)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })

    applyJuice(world, state, fx)

    expect(state.hitstopRemaining).toBe(HITSTOP_MS)
    expect(fx.camera.shake).not.toHaveBeenCalled()
    expect(fx.particles.emitBurst).not.toHaveBeenCalled()
  })

  it('coupe la secousse et les particules sur une mort, mais laisse le ralenti se déclencher', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const state = createJuiceState()
    const fx = fakeFx(false)
    world.events.push({ type: 'playerDied', x: 10, y: 20 })

    applyJuice(world, state, fx)

    expect(fx.camera.shake).not.toHaveBeenCalled()
    expect(fx.particles.emitBurst).not.toHaveBeenCalled()
  })

  it('déclenche bien la secousse et les particules quand le mouvement est activé', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const state = createJuiceState()
    const fx = fakeFx(true)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })

    applyJuice(world, state, fx)

    expect(fx.camera.shake).toHaveBeenCalled()
    expect(fx.particles.emitBurst).toHaveBeenCalled()
  })
})

describe('comboIntensity', () => {
  it('vaut 0 au multiplicateur ×1', () => {
    expect(comboIntensity(1)).toBe(0)
  })

  it('vaut 1 au multiplicateur maximal ×10', () => {
    expect(comboIntensity(10)).toBe(1)
  })

  it('croît avec le multiplicateur', () => {
    expect(comboIntensity(5)).toBeGreaterThan(comboIntensity(2))
  })

  it('borne les valeurs hors plage', () => {
    expect(comboIntensity(0)).toBe(0)
    expect(comboIntensity(50)).toBe(1)
  })
})

describe('flashGate', () => {
  it('part de 0 pile au seuil de flash', () => {
    expect(flashGate(COMBO_FLASH_MIN_MULTIPLIER)).toBe(0)
  })

  it('vaut 1 au multiplicateur maximal ×10', () => {
    expect(flashGate(10)).toBe(1)
  })

  it('reste borné à 0 sous le seuil', () => {
    expect(flashGate(1)).toBe(0)
    expect(flashGate(2)).toBe(0)
    expect(flashGate(-5)).toBe(0)
  })

  it('croît entre le seuil et le maximum', () => {
    expect(flashGate(6)).toBeGreaterThan(flashGate(4))
    expect(flashGate(9)).toBeGreaterThan(flashGate(6))
  })
})

describe('applyJuice — le combo module le ressenti', () => {
  const killWith = (combo: number) => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.combo = combo
    const state = createJuiceState()
    const fx = fakeFx(true)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })
    applyJuice(world, state, fx)
    return fx
  }

  it('émet plus de particules à haut combo qu’à bas combo', () => {
    // `world.combo` est déjà à jour quand `applyJuice` tourne : `scoreSystem`
    // passe en dernier dans `stepWorld`, avant l'appel depuis `game.ts`.
    const low = killWith(0)
    const high = killWith(40)
    const countOf = (fx: ReturnType<typeof fakeFx>): number => {
      const call = vi.mocked(fx.particles.emitBurst).mock.calls[0]
      if (!call) {
        throw new Error('aucune émission de particules')
      }
      return call[2].count
    }
    expect(countOf(high)).toBeGreaterThan(countOf(low))
  })

  it('ne déclenche flash ni anneau sous le seuil de combo', () => {
    const fx = killWith(0)
    expect(fx.flash.flash).not.toHaveBeenCalled()
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
  })

  it('ne déclenche flash ni anneau au multiplicateur juste sous le seuil', () => {
    // 4 kills par palier : combo 4 → multiplicateur ×2, le dernier cran avant
    // le seuil. Épingle la comparaison `>=` exactement.
    const fx = killWith(4)
    expect(fx.flash.flash).not.toHaveBeenCalled()
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
  })

  it('déclenche flash et anneau à partir du seuil de combo', () => {
    // 4 kills par palier : combo 8 → multiplicateur ×3.
    const fx = killWith(4 * (COMBO_FLASH_MIN_MULTIPLIER - 1))
    expect(fx.flash.flash).toHaveBeenCalled()
    expect(fx.shockwaves.emit).toHaveBeenCalled()
  })

  it('sort un flash visible dès le seuil, pas un voile à 1 %', () => {
    // Piloté par `flashGate` et non par `comboIntensity` (0,22 à ×3) : sinon
    // l'alpha tombait à 0,011, invisible au moment même de la récompense.
    const fx = killWith(4 * (COMBO_FLASH_MIN_MULTIPLIER - 1))
    const call = vi.mocked(fx.flash.flash).mock.calls[0]
    if (!call) {
      throw new Error('aucun flash émis')
    }
    expect(call[1]).toBeGreaterThanOrEqual(0.025)
  })

  it('secoue le HUD sur un kill, sauf en mouvement réduit', () => {
    expect(killWith(0).punch).toHaveBeenCalled()

    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const fx = fakeFx(false)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })
    applyJuice(world, createJuiceState(), fx)
    expect(fx.punch).not.toHaveBeenCalled()
  })
})

describe('resetJuiceState', () => {
  it('remet à zéro un hitstop en cours', () => {
    const state = createJuiceState()
    state.hitstopRemaining = 42
    state.hitstopCooldownRemaining = 130
    resetJuiceState(state)
    expect(state.hitstopRemaining).toBe(0)
    expect(state.hitstopCooldownRemaining).toBe(0)
  })

  it('rend au pas suivant sa vitesse pleine', () => {
    // Le scénario de la fuite : une run se termine pendant un hitstop, la
    // suivante démarre avec le même objet d'état.
    const state = createJuiceState()
    state.hitstopRemaining = 60
    resetJuiceState(state)
    expect(timeScaleFor(state, 16.67)).toBe(1)
  })
})

describe('signatures de déclenchement des power-ups', () => {
  /** Rejoue un `powerupUsed` du kind donné et rend les appels observés. */
  function declenche(kind: PowerUpKind): ReturnType<typeof fakeFx> {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x: 100, y: 100 })
    const fx = fakeFx(true)
    applyJuice(world, createJuiceState(), fx)
    return fx
  }

  it('la Bombe frappe deux fois, la seconde en retard', () => {
    const fx = declenche('blast')
    expect(fx.shockwaves.emit).toHaveBeenCalledTimes(2)
    const retards = vi.mocked(fx.shockwaves.emit).mock.calls.map((c) => c[2].delayMs ?? 0)
    expect(retards.filter((d) => d > 0)).toHaveLength(1)
  })

  it('le Givre hérisse son onde et fige ses éclats', () => {
    const fx = declenche('freeze')
    expect(vi.mocked(fx.shockwaves.emit).mock.calls[0]?.[2].needles).toBeGreaterThan(0)
    expect(vi.mocked(fx.particles.emitBurst).mock.calls[0]?.[2].stallAfterMs).toBeGreaterThan(0)
  })

  it('le Buvard aspire : ses éclats naissent au bord et convergent', () => {
    const fx = declenche('blotter')
    const burst = vi.mocked(fx.particles.emitBurst).mock.calls[0]?.[2]
    expect(burst?.converge).toBe(true)
    expect(burst?.spawnRadius).toBeGreaterThan(0)
    const ring = vi.mocked(fx.shockwaves.emit).mock.calls[0]?.[2]
    expect(ring?.fromRadius).toBeGreaterThan(ring?.radius ?? 0)
  })

  it('la Ruée n’émet aucun anneau : elle part quelque part', () => {
    const fx = declenche('dash')
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
    expect(fx.particles.emitBurst).toHaveBeenCalled()
  })

  it('la giclée de la Ruée part à l’opposé de l’orientation du joueur', () => {
    // `declenche()` ne spawne pas de joueur : `world.playerEid` resterait à
    // -1 et `dir` retomberait toujours sur 0, ce qui masquerait une erreur de
    // signe (`- Math.PI` au lieu de `+ Math.PI`, ou l'oubli du décalage). On
    // spawne donc un vrai joueur et on lui donne une orientation non nulle et
    // non ambiguë.
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const playerEid = spawnPlayer(world)
    const facing = Math.PI / 2
    Facing.angle[playerEid] = facing
    world.events.push({ type: 'powerupUsed', kind: POWERUP_ID.dash, x: 100, y: 100 })
    const fx = fakeFx(true)
    applyJuice(world, createJuiceState(), fx)
    const burst = vi.mocked(fx.particles.emitBurst).mock.calls[0]?.[2]
    const dir = burst?.dir
    if (dir === undefined) {
      throw new Error('aucune direction émise')
    }
    // Comparaison via cos/sin plutôt qu'égalité stricte de flottants, et
    // modulo 2π implicite par la trigonométrie.
    expect(Math.cos(dir)).toBeCloseTo(Math.cos(facing + Math.PI))
    expect(Math.sin(dir)).toBeCloseTo(Math.sin(facing + Math.PI))
  })

  it('la Ronce d’encre conserve le souffle générique en attendant sa propre signature', () => {
    // `bramble` tombait sur le `default` du switch et ne jouait plus rien. En
    // attendant sa propre signature, elle doit continuer à émettre burst+anneau —
    // ce test l'empêche de redisparaître silencieusement.
    const fx = declenche('bramble')
    expect(fx.particles.emitBurst).toHaveBeenCalled()
    expect(fx.shockwaves.emit).toHaveBeenCalled()
  })

  it('le Halo ne détone pas', () => {
    const fx = declenche('halo')
    expect(fx.particles.emitBurst).not.toHaveBeenCalled()
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
    // Il s'annonce quand même : c'est `views/player.ts` qui l'installe.
    expect(fx.flash.flash).toHaveBeenCalled()
  })

  it('chaque power-up de POWERUP_KINDS déclenche au moins un effet', () => {
    // Ceinture, à côté du contrôle d'exhaustivité (bretelle) du switch : boucle
    // sur la liste réelle des kinds pour attraper un futur kind silencieux
    // même sans test nommé dédié.
    for (const kind of POWERUP_KINDS) {
      const fx = declenche(kind)
      const aDeclencheUnEffet =
        vi.mocked(fx.particles.emitBurst).mock.calls.length > 0 ||
        vi.mocked(fx.shockwaves.emit).mock.calls.length > 0 ||
        vi.mocked(fx.flash.flash).mock.calls.length > 0
      expect(aDeclencheUnEffet, `${kind} ne déclenche aucun effet`).toBe(true)
    }
  })

  it('ne joue aucune signature en mouvement réduit', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.events.push({ type: 'powerupUsed', kind: POWERUP_ID.blast, x: 100, y: 100 })
    const fx = fakeFx(false)
    applyJuice(world, createJuiceState(), fx)
    expect(fx.particles.emitBurst).not.toHaveBeenCalled()
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
  })
})
