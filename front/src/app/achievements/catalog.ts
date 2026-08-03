import { POWERUP_DRAWABLE } from '@sim/data/powerups'

import type { SkinId } from '@/render/views/nibs'
import type { RunTrace } from './trace'

export type AchievementFamily = 'progression' | 'mastery' | 'oddity'

export interface AchievementDef {
  id: string
  family: AchievementFamily
  /** Le tracé que ce succès ouvre, quand il en ouvre un. */
  skin?: SkinId
  /** Vrai dès que la condition est remplie. Fonction pure de la trace. */
  done(trace: RunTrace): boolean
}

/**
 * Les seuils, nommés et groupés : ils vont bouger. Ceux de combo et de rafale
 * sont dérivés d'un seul repère de jeu réel — des parties à 500 000 points
 * pour 2 000 tués, un record à 1 300 000 — et non d'une mesure du combo
 * courant en fin de partie. Les réviser ne doit toucher que ce bloc.
 */
const WAVE = { first: 5, book: 10, volume: 20, complete: 30 } as const
const SCORE = { good: 100_000, large: 500_000, million: 1_000_000 } as const
const KILLS = { blotter: 500, tide: 2_000 } as const
const COMBO = { roll: 250, chain: 750 } as const
const BURST_KILLS = 100
const CLEAN_WAVES = 3
const BARE_HANDS_WAVE = 5
const NO_HALO_WAVE = 10
const FALSE_START_MS = 5_000
const STILL_LIFE_MS = 15_000
const GRAND_TOUR_MS = 5_000
const INKWELL_PX = 50

/**
 * Les succès sont des données : en ajouter un ne touche aucun système, comme
 * les cartes d'amélioration (`sim/data/upgrades.ts`). Les clés i18n sont
 * dérivées de l'identifiant : `achievement.<id>.name` et `.desc`.
 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // ── Progression ───────────────────────────────────────────────────────────
  { id: 'wave-5', family: 'progression', done: (t) => t.wave >= WAVE.first },
  { id: 'wave-10', family: 'progression', skin: 'ball', done: (t) => t.wave >= WAVE.book },
  { id: 'wave-20', family: 'progression', done: (t) => t.wave >= WAVE.volume },
  { id: 'wave-30', family: 'progression', skin: 'seal', done: (t) => t.wave >= WAVE.complete },
  { id: 'score-100k', family: 'progression', done: (t) => t.score >= SCORE.good },
  { id: 'score-500k', family: 'progression', done: (t) => t.score >= SCORE.large },
  { id: 'score-1m', family: 'progression', done: (t) => t.score >= SCORE.million },
  { id: 'kills-500', family: 'progression', done: (t) => t.kills >= KILLS.blotter },
  { id: 'kills-2000', family: 'progression', done: (t) => t.kills >= KILLS.tide },

  // ── Maîtrise ──────────────────────────────────────────────────────────────
  { id: 'combo-250', family: 'mastery', done: (t) => t.maxCombo >= COMBO.roll },
  { id: 'combo-750', family: 'mastery', done: (t) => t.maxCombo >= COMBO.chain },
  { id: 'clean-wave', family: 'mastery', done: (t) => t.cleanWaveStreak >= 1 },
  {
    id: 'clean-three',
    family: 'mastery',
    skin: 'brush',
    done: (t) => t.cleanWaveStreak >= CLEAN_WAVES,
  },
  { id: 'burst-100', family: 'mastery', done: (t) => t.killTimestamps.length >= BURST_KILLS },
  // Comparé à `POWERUP_DRAWABLE` et jamais à un littéral : c'est la seule
  // liste dans laquelle `pickup.ts` puise, donc la seule qu'une partie puisse
  // épuiser. Contre `POWERUP_KINDS`, le succès exigerait aussi les genres
  // rangés dans `POWERUP_DISABLED` (le Buvard aujourd'hui) et resterait
  // inatteignable. Désactiver ou remettre un genre le recalibre tout seul.
  {
    id: 'full-kit',
    family: 'mastery',
    done: (t) => t.powerupsPicked.size >= POWERUP_DRAWABLE.length,
  },
  {
    id: 'bare-hands',
    family: 'mastery',
    done: (t) => t.wave >= BARE_HANDS_WAVE && t.powerupCount === 0,
  },
  {
    id: 'no-halo',
    family: 'mastery',
    done: (t) => t.wave >= NO_HALO_WAVE && !t.powerupsPicked.has('halo'),
  },

  // ── Loufoques ─────────────────────────────────────────────────────────────
  { id: 'blank-page', family: 'oddity', skin: 'blot', done: (t) => t.died && t.kills === 0 },
  { id: 'false-start', family: 'oddity', done: (t) => t.died && t.timeMs < FALSE_START_MS },
  {
    id: 'still-life',
    family: 'oddity',
    skin: 'dropper',
    done: (t) => t.stillMs >= STILL_LIFE_MS,
  },
  { id: 'pacifist', family: 'oddity', skin: 'pencil', done: (t) => t.hadPacifistWave },
  {
    id: 'grand-tour',
    family: 'oddity',
    // Un bord jamais touché vaut `-Infinity` : l'écart reste infini, donc le
    // succès fermé, sans avoir à tester chaque bord séparément.
    done: (t) => Math.max(...t.edgeTouchedAt) - Math.min(...t.edgeTouchedAt) <= GRAND_TOUR_MS,
  },
  { id: 'homebody', family: 'oddity', done: (t) => t.hadHomebodyWave },
  {
    id: 'back-to-inkwell',
    family: 'oddity',
    done: (t) => t.died && Math.hypot(t.x - t.spawnX, t.y - t.spawnY) <= INKWELL_PX,
  },
]

/** Le succès qui ouvre un tracé donné — la vitrine des tracés l'affiche. */
export const ACHIEVEMENT_BY_SKIN: Partial<Record<SkinId, AchievementDef>> = Object.fromEntries(
  ACHIEVEMENTS.filter((a) => a.skin).map((a) => [a.skin, a]),
)
