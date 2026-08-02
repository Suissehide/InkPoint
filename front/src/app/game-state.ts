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
