export type GameState =
  | 'menu'
  | 'playing'
  | 'wavePause'
  | 'countdown'
  | 'dying'
  | 'gameover'
  | 'paused'

export type GameEvent =
  | 'START'
  | 'WAVE_END'
  | 'UPGRADE_CHOSEN'
  | 'COUNTDOWN_DONE'
  | 'DIED'
  | 'DEATH_ANIM_DONE'
  | 'RESTART'
  | 'PAUSE'
  | 'RESUME'
  | 'QUIT'

// Table de transitions explicite : un état absent de la clé d'un état donné
// est ignoré silencieusement par `send`, ce qui est le comportement voulu —
// une entrée non gérée par l'UI (double clic, race d'input) ne doit jamais
// faire planter la machine.
//
// `countdown` s'intercale sur les deux reprises — sortie de pause, carte
// choisie — et sur elles seules. `START` et `RESTART` mènent toujours
// directement à `playing` : le début d'une partie a déjà sa mise en scène,
// l'arrivée du curseur, et les deux se superposeraient.
const TRANSITIONS: Record<GameState, Partial<Record<GameEvent, GameState>>> = {
  menu: { START: 'playing' },
  playing: { WAVE_END: 'wavePause', DIED: 'dying', PAUSE: 'paused' },
  wavePause: { UPGRADE_CHOSEN: 'countdown', PAUSE: 'paused' },
  countdown: { COUNTDOWN_DONE: 'playing', PAUSE: 'paused' },
  dying: { DEATH_ANIM_DONE: 'gameover' },
  gameover: { RESTART: 'playing', QUIT: 'menu' },
  paused: { RESUME: 'countdown', QUIT: 'menu' },
}

/**
 * Les états où le bandeau des succès continue d'avancer.
 *
 * Vit ici, à côté de la table des transitions, et non en ligne dans la boucle
 * de rendu de `game.ts` : c'est une règle sur les états, et tant qu'elle était
 * noyée dans un `if` du chemin d'image, aucun test ne pouvait mordre dessus.
 * Elle a d'ailleurs été fausse tout ce temps sans que rien ne le signale.
 *
 * `wavePause` en fait partie — c'est le point qui manquait. Huit succès sur
 * vingt-deux se décident sur `waveEnded` (`achievements/trace.ts`), donc au pas
 * même où la machine y bascule pour ouvrir l'écran de cartes : les exclure
 * revenait à ne jamais pouvoir les annoncer à leur moment. Le bandeau est monté
 * en dernier sur `#ui` (voir `game.ts`) précisément pour passer par-dessus cet
 * écran, faute de quoi il défilerait derrière lui.
 *
 * Restent dehors les états où le joueur regarde autre chose et n'y verrait
 * rien : le menu, la pause, l'écran de fin.
 */
export function advancesBadge(state: GameState): boolean {
  return state === 'playing' || state === 'wavePause' || state === 'countdown' || state === 'dying'
}

export interface GameStateMachine {
  readonly state: GameState
  send(event: GameEvent): void
  subscribe(listener: (state: GameState) => void): () => void
}

export function createGameStateMachine(): GameStateMachine {
  let state: GameState = 'menu'
  const listeners = new Set<(s: GameState) => void>()

  return {
    get state() {
      return state
    },
    send(event: GameEvent): void {
      const next = TRANSITIONS[state][event]
      if (!next || next === state) {
        return
      }
      state = next
      for (const listener of listeners) {
        listener(state)
      }
    },
    subscribe(listener: (s: GameState) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
