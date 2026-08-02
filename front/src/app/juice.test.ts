import { Facing } from '@sim/components'
import type { PowerUpKind } from '@sim/data/powerups'
import { POWERUP_BASE, POWERUP_ID, POWERUP_KINDS } from '@sim/data/powerups'
import { spawnPlayer } from '@sim/spawn'
import { COMBO_MAX_MULTIPLIER, comboMultiplier } from '@sim/systems/score'
import { createWorld } from '@sim/world'
import { describe, expect, it, vi } from 'vitest'

import type { Camera } from '@/render/camera'
import type { Flash } from '@/render/fx/flash'
import type { FrostStars } from '@/render/fx/frost-star'
import type { Shockwaves } from '@/render/fx/shockwave'
import type { Particles } from '@/render/particles'
import {
  applyJuice,
  COMBO_FLASH_MIN_MULTIPLIER,
  comboIntensity,
  createJuiceState,
  flashGate,
  HITSTOP_MS,
  killShakeFelt,
  resetJuiceState,
  timeScaleFor,
} from './juice'

function fakeFx(motionEnabled: boolean): {
  camera: Camera
  particles: Particles
  flash: Flash
  shockwaves: Shockwaves
  frostStars: FrostStars
  punch: (strength: number) => void
  motionEnabled: boolean
} {
  const camera: Camera = {
    shake: vi.fn(),
    shakeUpTo: vi.fn(),
    update: vi.fn(() => ({ x: 0, y: 0 })),
  }
  const particles: Particles = { emitBurst: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const flash: Flash = { flash: vi.fn(), resize: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const shockwaves: Shockwaves = { emit: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const frostStars: FrostStars = { emit: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  return { camera, particles, flash, shockwaves, frostStars, punch: vi.fn(), motionEnabled }
}

describe('applyJuice — portée du mouvement réduit', () => {
  it('coupe la secousse et les particules sur un kill, mais laisse le hitstop se déclencher', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const state = createJuiceState()
    const fx = fakeFx(false)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })

    applyJuice(world, state, fx)

    expect(state.hitstopRemaining).toBe(HITSTOP_MS)
    expect(fx.camera.shakeUpTo).not.toHaveBeenCalled()
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

    expect(fx.camera.shakeUpTo).toHaveBeenCalled()
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

describe('killShakeFelt', () => {
  it('reste sous quelques pixels pour un kill isolé, même à combo maximal', () => {
    // Le seuil de la plainte : en fin de partie les kills s'enchaînent, et
    // c'est le régime où la secousse doit le plus s'effacer.
    expect(killShakeFelt(1, 1)).toBeLessThan(2)
    expect(killShakeFelt(1, COMBO_MAX_MULTIPLIER)).toBeLessThan(2.5)
  })

  it('grimpe avec le nombre de morts du pas, mais plafonne', () => {
    expect(killShakeFelt(6, 1)).toBeGreaterThan(killShakeFelt(1, 1))
    // Une Bombe au cœur d'une arène dense peut rapporter un `kills`
    // arbitrairement grand : le plafond est la seule chose qui l'arrête.
    expect(killShakeFelt(500, COMBO_MAX_MULTIPLIER)).toBe(killShakeFelt(50, COMBO_MAX_MULTIPLIER))
  })

  it('ne laisse pas le combo doubler la secousse', () => {
    // Le combo se lit par les particules, le flash et l'anneau ; l'amplifier
    // ici transformerait la fin de partie en tremblement de fond.
    expect(killShakeFelt(1, COMBO_MAX_MULTIPLIER)).toBeLessThan(2 * killShakeFelt(1, 1))
  })
})

describe('applyJuice — la secousse des kills ne s’empile pas', () => {
  it('porte la secousse au niveau voulu au lieu de l’ajouter au trauma en cours', () => {
    // `shake` empile en amplitude interne : une rafale de kills y saturerait
    // le plafond de la caméra et l'écran ne redescendrait plus.
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.combo = 40
    const fx = fakeFx(true)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })
    applyJuice(world, createJuiceState(), fx)

    expect(fx.camera.shake).not.toHaveBeenCalled()
    const felt = vi.mocked(fx.camera.shakeUpTo).mock.calls[0]?.[0]
    expect(felt).toBe(killShakeFelt(1, comboMultiplier(40)))
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
  function declenche(kind: PowerUpKind, radius: number | null = null): ReturnType<typeof fakeFx> {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x: 100, y: 100, radius })
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

  it('le Givre plante une étoile à la portée réelle du gel, et fige ses éclats', () => {
    // 175 et non le rayon de base : c'est la portée publiée par l'événement qui
    // doit piloter le dessin, sinon « Gel élargi » resterait invisible.
    const fx = declenche('freeze', 175)
    expect(vi.mocked(fx.frostStars.emit).mock.calls[0]?.[2].radius).toBe(175)
    expect(vi.mocked(fx.particles.emitBurst).mock.calls[0]?.[2].stallAfterMs).toBeGreaterThan(0)
  })

  it("le Givre n'émet plus d'anneau : une seule forme de givre à l'écran", () => {
    // Garder l'onde à aiguilles superposerait deux givres concentriques, et
    // l'anneau raconterait une zone que le Gel ne pose plus.
    const fx = declenche('freeze', 130)
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
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

  it('la Volée émet une giclée par plume et aucun anneau', () => {
    const fx = declenche('volley')
    // Une giclée par plume : c'est la multiplicité qui la distingue de la Ruée.
    expect(fx.particles.emitBurst).toHaveBeenCalledTimes(POWERUP_BASE.volley.count)
    // Rien n'explose au lancement. Les explosions de la Volée naissent à
    // l'impact et ce sont de vraies zones mortelles (seeker.ts) : un anneau
    // ici annoncerait une mort qui n'a pas lieu à cet endroit.
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
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
    world.events.push({ type: 'powerupUsed', kind: POWERUP_ID.dash, x: 100, y: 100, radius: null })
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

  it('la Bavure jette son encre vers l’avant, en laisse baver sur place, et n’émet aucun anneau', () => {
    // Un vrai joueur, orienté ailleurs que vers +x : sans lui `world.playerEid`
    // resterait à -1, `dir` retomberait sur 0, et une giclée partie à l'opposé
    // (l'erreur de la Ruée recopiée telle quelle) passerait inaperçue.
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const playerEid = spawnPlayer(world)
    const facing = Math.PI / 2
    Facing.angle[playerEid] = facing
    world.events.push({
      type: 'powerupUsed',
      kind: POWERUP_ID.splatter,
      x: 100,
      y: 100,
      radius: null,
    })
    const fx = fakeFx(true)
    applyJuice(world, createJuiceState(), fx)

    // Deux émissions et pas une : le jet qui part, puis la bavure qui reste.
    const emissions = vi.mocked(fx.particles.emitBurst).mock.calls
    expect(emissions).toHaveLength(2)

    const jet = emissions[0]?.[2]
    const bavure = emissions[1]?.[2]
    if (!jet || !bavure) {
      throw new Error('les deux émissions de la Bavure sont attendues')
    }

    // Le jet suit le regard, il ne part PAS à l'opposé comme celui de la Ruée :
    // c'est la goutte qu'on lance, pas le joueur qui se jette.
    if (jet.dir === undefined) {
      throw new Error('aucune direction émise')
    }
    expect(Math.cos(jet.dir)).toBeCloseTo(Math.cos(facing))
    expect(Math.sin(jet.dir)).toBeCloseTo(Math.sin(facing))
    // Serré : un seul départ, contre l'éventail de la Volée et la large giclée
    // de la Ruée (0,9 rad).
    expect(jet.spread ?? Math.PI * 2).toBeLessThan(0.9)
    expect(jet.streak).toBe(true)

    // La bavure, elle, ne file nulle part : tout autour, lente, et elle sèche
    // sur place. C'est ce qui la distingue d'une simple giclée de départ.
    expect(bavure.spread ?? Math.PI * 2).toBeCloseTo(Math.PI * 2)
    expect(bavure.speed ?? 0).toBeLessThan(jet.speed ?? 0)
    expect(bavure.stallAfterMs ?? 0).toBeGreaterThan(0)
    expect(bavure.streak ?? false).toBe(false)

    // Rien n'explose au lancement, et la létalité s'en va avec la goutte : un
    // anneau marquerait comme dangereux un pourtour déjà quitté.
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
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
    world.events.push({ type: 'powerupUsed', kind: POWERUP_ID.blast, x: 100, y: 100, radius: null })
    const fx = fakeFx(false)
    applyJuice(world, createJuiceState(), fx)
    expect(fx.particles.emitBurst).not.toHaveBeenCalled()
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
  })
})
