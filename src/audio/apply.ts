import { POWERUP_BY_ID } from '@/sim/data/powerups'
import { comboMultiplier } from '@/sim/systems/score'
import type { SimWorld } from '@/sim/world'
import { allowedVoices, VOICE_CAP_PER_FRAME } from './curves'
import type { AudioEngine } from './engine'
import {
  DEATH_VOICE,
  HALO_BROKEN_VOICE,
  killVoice,
  PICKUP_VOICE,
  powerupVoices,
  WAVE_VOICE,
} from './sounds'

/**
 * Voix déjà déclenchées dans l'image courante. Vit hors d'`applyAudio` parce
 * qu'une image contient jusqu'à quinze pas de simulation (`app/loop.ts`) :
 * un compteur local à `applyAudio` plafonnait quinze fois de suite au lieu
 * d'une. `resetVoiceBudget` est appelé par `onRender` (`app/game.ts`), une
 * fois par image — même découpe que `createJuiceState`/`resetJuiceState`.
 */
export interface VoiceBudget {
  played: number
}

export function createVoiceBudget(): VoiceBudget {
  return { played: 0 }
}

export function resetVoiceBudget(budget: VoiceBudget): void {
  budget.played = 0
}

/**
 * Traduit les événements d'un pas de simulation en sons. Symétrique
 * d'`applyJuice` (`src/app/juice.ts`), qui les traduit en image : même source,
 * même absence d'écriture dans le monde.
 *
 * Le plafond de voix ne s'applique qu'aux kills : ce sont les seuls qui
 * arrivent par vingtaines dans un même pas. Les autres événements sont uniques
 * par nature.
 */
export function applyAudio(
  world: SimWorld,
  engine: Pick<AudioEngine, 'play'>,
  budget: VoiceBudget,
): void {
  let kills = 0
  const multiplier = comboMultiplier(world.combo)

  for (const event of world.events) {
    switch (event.type) {
      case 'enemyKilled':
        kills++
        break
      case 'powerupPicked':
        engine.play(PICKUP_VOICE)
        break
      case 'powerupUsed': {
        const kind = POWERUP_BY_ID[event.kind]
        if (kind) {
          for (const voice of powerupVoices(kind)) {
            engine.play(voice)
          }
        }
        break
      }
      case 'haloBroken':
        engine.play(HALO_BROKEN_VOICE)
        break
      case 'playerDied':
        engine.play(DEATH_VOICE)
        break
      case 'waveStarted':
        engine.play(WAVE_VOICE)
        break
      default:
        break
    }
  }

  // `budget.played` et non `0` : c'est ce qui rend le plafond réellement par
  // image quand plusieurs pas de simulation en partagent une seule.
  const voices = allowedVoices(kills, budget.played, VOICE_CAP_PER_FRAME)
  for (let i = 0; i < voices; i++) {
    // Rang dans la salve : décale et détimbre chaque voix (voir `killVoice`).
    engine.play(killVoice(multiplier, budget.played + i))
  }
  budget.played += voices
}
