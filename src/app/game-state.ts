export type GameState = 'menu' | 'playing' | 'wavePause' | 'dying' | 'gameover' | 'paused'

export type GameEvent =
  | 'START'
  | 'WAVE_END'
  | 'UPGRADE_CHOSEN'
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
const TRANSITIONS: Record<GameState, Partial<Record<GameEvent, GameState>>> = {
  menu: { START: 'playing' },
  playing: { WAVE_END: 'wavePause', DIED: 'dying', PAUSE: 'paused' },
  wavePause: { UPGRADE_CHOSEN: 'playing', PAUSE: 'paused' },
  dying: { DEATH_ANIM_DONE: 'gameover' },
  gameover: { RESTART: 'playing', QUIT: 'menu' },
  paused: { RESUME: 'playing', QUIT: 'menu' },
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
