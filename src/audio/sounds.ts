import type { PowerUpKind } from '@/sim/data/powerups'
import type { Rarity } from '@/sim/data/upgrades'
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

/**
 * Navigation de menu (spec §Audio) : un clic, pas une note. Il se répète à
 * chaque déplacement, donc il doit être très bref et discret — une hauteur
 * tenue deviendrait une mélodie involontaire dès qu'on parcourt une liste.
 */
export const NAV_VOICE: VoiceSpec = {
  source: 'noise',
  freq: 2400,
  filterHz: 2400,
  durationMs: 25,
  gain: 0.1,
}

/**
 * Tic du décompte de reprise. Le dernier chiffre monte d'une quinte et tient
 * plus longtemps : le joueur doit entendre que ça repart, pas seulement que
 * ça compte.
 */
export function countdownVoice(digit: number): VoiceSpec {
  const last = digit <= 1
  return {
    source: 'tone',
    freq: last ? 660 : 440,
    durationMs: last ? 200 : 110,
    gain: 0.16,
  }
}

/**
 * Choix d'une carte (spec §Audio) : une confirmation, d'autant plus ample que
 * la carte est rare. L'ampleur se lit au nombre de voix et à leur étalement,
 * pas au seul volume — même axe que la carte à l'écran, dont la rareté se lit
 * au nombre de traits et non à une couleur nouvelle (`ui/components/card.ts`).
 */
export function cardVoices(rarity: Rarity): VoiceSpec[] {
  switch (rarity) {
    case 'common':
      return [{ source: 'tone', freq: 440, freqEnd: 660, durationMs: 150, gain: 0.18 }]
    case 'rare':
      return [
        { source: 'tone', freq: 440, freqEnd: 660, durationMs: 180, gain: 0.18 },
        { source: 'tone', freq: 660, durationMs: 260, gain: 0.14, delayMs: 110 },
      ]
    case 'mythic':
      // Trois temps et une tenue grave dessous : la seule carte qui se pose
      // comme un accord plutôt que comme une confirmation.
      return [
        { source: 'tone', freq: 440, freqEnd: 660, durationMs: 200, gain: 0.18 },
        { source: 'tone', freq: 660, freqEnd: 880, durationMs: 260, gain: 0.16, delayMs: 120 },
        { source: 'tone', freq: 220, durationMs: 620, gain: 0.12, delayMs: 120 },
      ]
    default: {
      // Même garde que `powerupVoices` : une quatrième rareté ne doit pas
      // pouvoir compiler en silence puis rester muette.
      const exhaustif: never = rarity
      void exhaustif
      return []
    }
  }
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
    case 'volley':
      // Trois départs rapprochés, un par plume : la volée s'entend comme une
      // rafale, pas comme un tir unique.
      return [
        { source: 'noise', freq: 2200, filterHz: 2200, durationMs: 90, gain: 0.2 },
        { source: 'noise', freq: 2000, filterHz: 2000, durationMs: 90, gain: 0.16, delayMs: 45 },
        { source: 'noise', freq: 1800, filterHz: 1800, durationMs: 90, gain: 0.13, delayMs: 90 },
      ]
    case 'splatter':
      // Un « ploc » mat qui descend : de l'encre qui tombe, pas une détonation.
      return [{ source: 'tone', freq: 380, freqEnd: 190, durationMs: 180, gain: 0.24 }]
    default: {
      // Sans ce contrôle, l'ajout d'un power-up de plus compilerait en
      // silence et son déclenchement serait muet — c'est exactement ce qui est
      // arrivé à la Ronce d'encre côté visuel.
      const exhaustif: never = kind
      void exhaustif
      return []
    }
  }
}
