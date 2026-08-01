import type { PowerUpKind } from '@/sim/data/powerups'
import { killPitch } from './curves'
import type { VoiceSpec } from './engine'

/**
 * La palette. Chaque power-up reçoit une signature sonore construite sur les
 * mêmes axes que sa signature visuelle : le sens du mouvement, le rythme, la
 * texture — jamais la seule hauteur.
 */
export function killVoice(comboMultiplier: number): VoiceSpec {
  return { source: 'tone', freq: killPitch(comboMultiplier), durationMs: 70, gain: 0.18 }
}

export const PICKUP_VOICE: VoiceSpec = {
  source: 'tone',
  freq: 520,
  freqEnd: 780,
  durationMs: 120,
  gain: 0.22,
}

export const HALO_BROKEN_VOICE: VoiceSpec = {
  source: 'noise',
  freq: 300,
  filterHz: 300,
  durationMs: 320,
  gain: 0.3,
}

export const DEATH_VOICE: VoiceSpec = {
  source: 'tone',
  freq: 320,
  freqEnd: 60,
  durationMs: 900,
  gain: 0.32,
}

export const WAVE_VOICE: VoiceSpec = {
  source: 'tone',
  freq: 440,
  durationMs: 90,
  gain: 0.12,
}

export function powerupVoices(kind: PowerUpKind): VoiceSpec[] {
  switch (kind) {
    case 'blast':
      // Deux temps, comme sa double onde à l'écran.
      return [
        { source: 'noise', freq: 900, filterHz: 900, durationMs: 160, gain: 0.34 },
        { source: 'noise', freq: 500, filterHz: 500, durationMs: 260, gain: 0.22, delayMs: 90 },
      ]
    case 'freeze':
      // Cristallin, puis figé : la hauteur cesse de bouger en fin d'enveloppe.
      return [{ source: 'tone', freq: 1400, freqEnd: 1180, durationMs: 380, gain: 0.2 }]
    case 'blotter':
      // Glissando descendant : le seul son qui va vers l'intérieur.
      return [{ source: 'tone', freq: 700, freqEnd: 140, durationMs: 420, gain: 0.24 }]
    case 'dash':
      // Souffle bref et orienté, sans hauteur définie.
      return [{ source: 'noise', freq: 1600, filterHz: 1600, durationMs: 130, gain: 0.26 }]
    case 'halo':
      // Accord tenu : une protection ne détone pas.
      return [
        { source: 'tone', freq: 330, durationMs: 520, gain: 0.16 },
        { source: 'tone', freq: 495, durationMs: 520, gain: 0.12 },
      ]
    case 'bramble':
      // Rien de percussif : la Ronce se pose, elle n'explose pas.
      return [{ source: 'noise', freq: 420, filterHz: 420, durationMs: 240, gain: 0.14 }]
    default: {
      // Sans ce contrôle, l'ajout d'un septième power-up compilerait en
      // silence et son déclenchement serait muet — c'est exactement ce qui est
      // arrivé à la Ronce d'encre côté visuel.
      const exhaustif: never = kind
      void exhaustif
      return []
    }
  }
}
