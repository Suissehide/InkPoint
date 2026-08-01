import type { PowerUpKind } from '@/sim/data/powerups'
import { killPitch } from './curves'
import type { VoiceSpec } from './engine'

/**
 * La palette. Chaque power-up reçoit une signature sonore construite sur les
 * mêmes axes que sa signature visuelle : le sens du mouvement, le rythme, la
 * texture — jamais la seule hauteur.
 */
/** Écart de départ entre deux voix d'une même salve de kills, en ms. */
const KILL_STAGGER_MS = 22
/** Écart de hauteur entre deux voix d'une même salve : ~1 demi-ton par voix. */
const KILL_DETUNE = 0.06
/** Atténuation par voix : la salve se referme au lieu de s'empiler. */
const KILL_FALLOFF = 0.14

/**
 * `index` est le rang de la voix DANS la salve du même pas, pas un compteur
 * global. Sans lui, `n` kills simultanés produisaient `n` voix rigoureusement
 * identiques — même hauteur, même instant de départ : non pas quatre impacts
 * mais un seul, quatre fois plus fort (0,18 × 4 avant gain maître, sans
 * limiteur sur `master`). Décalées, détimbrées et décroissantes, elles
 * s'entendent comme la rafale qu'elles sont.
 */
export function killVoice(comboMultiplier: number, index = 0): VoiceSpec {
  return {
    source: 'tone',
    freq: killPitch(comboMultiplier) * (1 + index * KILL_DETUNE),
    durationMs: 70,
    gain: 0.18 * Math.max(0.2, 1 - index * KILL_FALLOFF),
    delayMs: index * KILL_STAGGER_MS,
  }
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
