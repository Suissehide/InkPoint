import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `stepWorld` et `offerUpgrades` sont remplacés pour tout ce fichier — d'où un
 * fichier à part plutôt qu'un ajout à `run.test.ts`, qui a besoin des vraies
 * implémentations partout ailleurs. `vi.hoisted` : Vitest hoiste les appels
 * `vi.mock` au-dessus des imports, une fabrique qui referme sur une variable
 * déclarée plus bas planterait sans lui.
 *
 * Pourquoi mocker plutôt que jouer une vraie partie jusqu'à une vraie fin de
 * vague : mesuré, aucune politique d'entrées scriptée ne survit assez
 * longtemps pour ça — la traque de pastilles meurt entre 465 et 1144 pas, la
 * fuite d'ennemis culmine à 810 sur 60 graines, et la vague 1 en réclame 2400.
 * Ce fichier teste donc le SEUL point qui ne dépend pas de la survie : la
 * façon dont `replayRun` réagit à un `waveEnded`, quel qu'il soit. La preuve
 * qu'un vrai run peut réellement produire cette coïncidence vit dans
 * `run.test.ts` (graine 210, pas 2508, sur la simulation réelle — mais ce
 * test-là ne fait que constater que la coïncidence existe, il n'appelle pas
 * `replayRun` ; c'est ici, et seulement ici, que l'ordre est éprouvé). La
 * preuve qu'une vraie partie jouée à la main passe par ce chemin de
 * `replayRun` jusqu'au bout (vague 2 atteinte, carte réellement appliquée)
 * reste celle de la tâche 7 — une boucle manuelle enregistrée par le front,
 * pas un test synthétique. Ne pas prétendre le contraire ici.
 *
 * Ce fichier ne tourne que sous Node (voir l'exclusion dans
 * `vitest.browser.config.ts`), pour deux raisons distinctes — l'une choisie,
 * l'autre subie :
 *
 * 1. Choisie : la suite à trois moteurs existe pour attraper une divergence
 *    NUMÉRIQUE entre moteurs JavaScript (arrondis, ordre de sommation en
 *    virgule flottante — voir `math.golden.test.ts`). Un ordre d'instructions
 *    inversé dans `replayRun` est un défaut STRUCTUREL : il se comporte à
 *    l'identique quel que soit le moteur qui l'exécute. Node suffit à
 *    l'attraper ; le rejouer sous Chromium n'ajouterait aucune garantie, seulement
 *    du temps de CI.
 * 2. Subie : `vi.mock` (sur `../step` et `../upgrades/offer`) n'est de toute
 *    façon pas intercepté sous le lanceur navigateur de cette configuration
 *    (Vitest 2.1.9, mode navigateur, provider Playwright) — vérifié
 *    manuellement et confirmé indépendamment : les six assertions qui en
 *    dépendent échouent silencieusement en Chromium.
 */
const { stepWorldMock, offerUpgradesMock } = vi.hoisted(() => ({
  stepWorldMock: vi.fn(),
  offerUpgradesMock: vi.fn(),
}))

vi.mock('../step', () => ({ stepWorld: stepWorldMock }))
vi.mock('../upgrades/offer', () => ({ offerUpgrades: offerUpgradesMock }))

import type { UpgradeDef } from '../data/upgrades'
import { INPUT_FIELDS } from '../input'
import { SIM_VERSION } from '../version.generated'
import type { SimWorld } from '../world'
import type { Replay } from './format'
import { replayRun } from './run'

// 10 = splatter (`POWERUP_ID.splatter`, sim/data/powerups.ts) — peu importe
// lequel, seul compte que `progress.seenPowerups` en porte la trace au bon moment.
const SPLATTER_KIND = 10

const FAKE_CARD: UpgradeDef = {
  id: 'carte-de-test',
  rarity: 'common',
  stackable: true,
  // Sans effet : ce test observe l'ordre de `progress`, pas les statistiques.
  apply: () => undefined,
}

/** Un replay d'un seul pas : `stepWorld` (mocké) décide seul de ce qui s'y passe. */
function oneStepReplay(choices: Replay['choices']): Replay {
  return {
    simVersion: SIM_VERSION,
    seed: 42,
    inputs: new Int16Array(INPUT_FIELDS.length),
    choices,
  }
}

beforeEach(() => {
  stepWorldMock.mockReset()
  offerUpgradesMock.mockReset()
})

describe('ordre absorbEvents / waveEnded au pas de bascule', () => {
  it(
    'l’offre voit déjà le power-up ramassé au pas même où la vague se termine — ' +
      'le pas de bascule que `game.ts` traite dans cet ordre (absorbEvents avant ' +
      'handleSimEvents), et que `replayRun` doit reproduire',
    () => {
      stepWorldMock.mockImplementation((world: SimWorld) => {
        world.events = [
          { type: 'powerupPicked', kind: SPLATTER_KIND },
          { type: 'waveEnded', wave: 1 },
        ]
      })
      // `progress.seenPowerups` est un `Set` muté en place : l'inspecter APRÈS
      // `replayRun` refléterait son état final, pas celui vu par l'appel — qui
      // se trouve être identique ici puisque rien ne le modifie plus après. Le
      // capturer par copie AU MOMENT de l'appel est ce qui rend ce test
      // sensible à l'ordre (et non seulement à l'état final du `Set`).
      let seenAtCallTime: Set<unknown> | undefined
      offerUpgradesMock.mockImplementation(
        (_seed: number, _wave: number, progress: { seenPowerups: Set<unknown> }) => {
          seenAtCallTime = new Set(progress.seenPowerups)
          return [FAKE_CARD]
        },
      )

      replayRun(oneStepReplay([{ step: 0, index: 0 }]))

      expect(offerUpgradesMock).toHaveBeenCalledTimes(1)
      // Si `replayRun` traitait `waveEnded` avant d'absorber les événements du
      // pas (l'ordre inverse), ce `Set` serait encore vide au moment de l'appel :
      // c'est exactement le trou que ce test ferme. Renverser l'ordre dans
      // `run.ts` fait rougir cette assertion — vérifié manuellement, voir le
      // rapport.
      expect(seenAtCallTime?.has('splatter')).toBe(true)
    },
  )
})

describe('replayRun face à une fin de vague, contrôlée pas à pas', () => {
  it('refuse un indice de carte hors des cartes proposées', () => {
    stepWorldMock.mockImplementation((world: SimWorld) => {
      world.events = [{ type: 'waveEnded', wave: 1 }]
    })
    offerUpgradesMock.mockReturnValue([FAKE_CARD])

    expect(() => replayRun(oneStepReplay([{ step: 0, index: 5 }]))).toThrow(
      /indice 5 hors des 1 cartes/i,
    )
  })

  it('refuse un choix annoncé à un pas différent de celui où la vague se termine', () => {
    stepWorldMock.mockImplementation((world: SimWorld) => {
      world.events = [{ type: 'waveEnded', wave: 1 }]
    })
    offerUpgradesMock.mockReturnValue([FAKE_CARD])

    expect(() => replayRun(oneStepReplay([{ step: 7, index: 0 }]))).toThrow(
      /choix 0 annoncé au pas 7, vague terminée au pas 0/i,
    )
  })

  it('refuse une fin de vague sans le moindre choix enregistré', () => {
    stepWorldMock.mockImplementation((world: SimWorld) => {
      world.events = [{ type: 'waveEnded', wave: 1 }]
    })
    offerUpgradesMock.mockReturnValue([FAKE_CARD])

    expect(() => replayRun(oneStepReplay([]))).toThrow(/vague 1 terminée au pas 0 sans choix/i)
  })

  it('applique la carte choisie quand tout concorde', () => {
    stepWorldMock.mockImplementation((world: SimWorld) => {
      world.events = [{ type: 'waveEnded', wave: 1 }]
    })
    offerUpgradesMock.mockReturnValue([FAKE_CARD])

    // Ne lève pas : c'est la seule façon d'observer que ce chemin va au bout
    // sans lever une erreur — `ReplayResult` n'expose pas la carte prise.
    expect(() => replayRun(oneStepReplay([{ step: 0, index: 0 }]))).not.toThrow()
  })
})
