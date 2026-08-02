import type { Rarity } from '@/sim/data/upgrades'
import type { AudioEngine } from './engine'
import { cardVoices, countdownVoice, NAV_VOICE } from './sounds'

/**
 * Le point d'entrée audio des écrans. `applyAudio` ne traduit que des
 * événements de simulation : sans ce module, le joueur n'entendrait
 * rigoureusement rien avant sa première partie.
 *
 * Un moteur posé une fois pour toutes plutôt qu'un rappel passé de proche en
 * proche : les écrans créent eux-mêmes leur navigation (`createMenuNav`), il
 * faudrait faire descendre l'objet jusque dans chacun d'eux pour un clic de
 * 25 ms. Même découpe que `src/i18n` — un état de module, réglé une fois par
 * `app/game.ts` au démarrage.
 *
 * Les écrans appellent `playMenuMove` / `playCardChosen` et rien d'autre : la
 * synthèse reste entièrement dans `sounds.ts`, comme pour les sons de jeu.
 */
let engine: Pick<AudioEngine, 'play'> | null = null

export function bindUiAudio(next: Pick<AudioEngine, 'play'> | null): void {
  engine = next
}

/** Déplacement dans un menu. Muet tant que `bindUiAudio` n'a rien reçu (tests, écrans hors jeu). */
export function playMenuMove(): void {
  engine?.play(NAV_VOICE)
}

/** Choix d'une carte d'amélioration : d'autant plus ample que la carte est rare. */
export function playCardChosen(rarity: Rarity): void {
  for (const voice of cardVoices(rarity)) {
    engine?.play(voice)
  }
}

/** Un tic par chiffre du décompte de reprise. */
export function playCountdownTick(digit: number): void {
  engine?.play(countdownVoice(digit))
}
