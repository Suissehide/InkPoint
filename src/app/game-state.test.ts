import { describe, expect, it } from 'vitest'

import { createGameStateMachine } from './game-state'

describe('machine à états', () => {
  it('démarre au menu', () => {
    expect(createGameStateMachine().state).toBe('menu')
  })

  it('menu → playing sur START', () => {
    const m = createGameStateMachine()
    m.send('START')
    expect(m.state).toBe('playing')
  })

  it('playing → wavePause sur WAVE_END', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('WAVE_END')
    expect(m.state).toBe('wavePause')
  })

  it('wavePause → playing sur UPGRADE_CHOSEN', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('WAVE_END')
    m.send('UPGRADE_CHOSEN')
    expect(m.state).toBe('playing')
  })

  it('playing → dying → gameover', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('DIED')
    expect(m.state).toBe('dying')
    m.send('DEATH_ANIM_DONE')
    expect(m.state).toBe('gameover')
  })

  it('gameover → playing sur RESTART', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('DIED')
    m.send('DEATH_ANIM_DONE')
    m.send('RESTART')
    expect(m.state).toBe('playing')
  })

  it('playing ↔ paused', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('PAUSE')
    expect(m.state).toBe('paused')
    m.send('RESUME')
    expect(m.state).toBe('playing')
  })

  it('ignore une transition invalide sans planter', () => {
    const m = createGameStateMachine()
    m.send('WAVE_END')
    expect(m.state).toBe('menu')
  })

  it('notifie les abonnés à chaque changement', () => {
    const m = createGameStateMachine()
    const seen: string[] = []
    m.subscribe((s) => seen.push(s))
    m.send('START')
    expect(seen).toEqual(['playing'])
  })
})
