import { describe, expect, it } from 'vitest'

import { advancesBadge, createGameStateMachine } from './game-state'

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

  it('wavePause → countdown sur UPGRADE_CHOSEN', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('WAVE_END')
    m.send('UPGRADE_CHOSEN')
    expect(m.state).toBe('countdown')
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

  it('playing ↔ paused, la reprise repassant par le décompte', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('PAUSE')
    expect(m.state).toBe('paused')
    m.send('RESUME')
    m.send('COUNTDOWN_DONE')
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

  it('paused → countdown sur RESUME', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('PAUSE')
    m.send('RESUME')
    expect(m.state).toBe('countdown')
  })

  it('countdown → playing sur COUNTDOWN_DONE', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('PAUSE')
    m.send('RESUME')
    m.send('COUNTDOWN_DONE')
    expect(m.state).toBe('playing')
  })

  // Échap pendant le décompte doit remettre en pause, pas laisser filer.
  it('countdown → paused sur PAUSE', () => {
    const m = createGameStateMachine()
    m.send('START')
    m.send('PAUSE')
    m.send('RESUME')
    m.send('PAUSE')
    expect(m.state).toBe('paused')
  })

  // Le début de partie a déjà sa mise en scène (l'arrivée du curseur) : les
  // deux se superposeraient.
  it('démarrer et relancer une partie ne passent pas par le décompte', () => {
    const m = createGameStateMachine()
    m.send('START')
    expect(m.state).toBe('playing')

    m.send('DIED')
    m.send('DEATH_ANIM_DONE')
    m.send('RESTART')
    expect(m.state).toBe('playing')
  })
})

describe('advancesBadge', () => {
  /**
   * `wavePause` est le cas qui manquait, et il n'était pas anodin : **huit
   * succès sur vingt-deux** se décident sur l'événement `waveEnded`
   * (`achievements/trace.ts`) — les quatre paliers de vague, les deux
   * immaculés, « Pacifiste » et « Casanier ». Ils sont donc mis en file au pas
   * même où la machine bascule en `wavePause` pour ouvrir l'écran de cartes.
   *
   * Tant que cet état n'avançait pas le bandeau, ces huit-là ne pouvaient
   * **jamais** s'annoncer à leur moment : ils restaient gelés dans la file
   * pendant tout le choix de carte, puis s'ouvraient sur le décompte de la
   * vague suivante, loin de ce qu'ils célébraient. Constaté en jeu sur
   * « Pacifiste ».
   */
  it('avance là où le joueur peut lire le bandeau, écran de cartes compris', () => {
    expect(advancesBadge('playing')).toBe(true)
    expect(advancesBadge('wavePause')).toBe(true)
    expect(advancesBadge('countdown')).toBe(true)
    // `dying` : la simulation s'arrête, mais le bandeau doit finir sa rotation.
    expect(advancesBadge('dying')).toBe(true)
    // `gameover` : trois succès ne se décident QUE sur le pas de la mort —
    // Page blanche, Faux départ, Retour à l'encrier. Ils s'ouvrent pendant
    // l'animation de mort (1,6 s), bien trop court pour être lus ; il faut donc
    // que le bandeau continue de tourner par-dessus le récapitulatif, qui lui
    // n'a pas de fin imposée. C'est aussi pourquoi `game.ts` n'y appelle plus
    // `badge.clear()` — le nettoyage se fait au démarrage de la partie
    // suivante, et les deux sorties de l'écran de fin y passent.
    expect(advancesBadge('gameover')).toBe(true)
  })

  /**
   * L'exclusion garde son sens d'origine : un bandeau qui défilerait derrière
   * un écran que le joueur ne quitte pas des yeux serait perdu pour lui.
   */
  it('n’avance pas là où il défilerait sans être lu', () => {
    expect(advancesBadge('menu')).toBe(false)
    expect(advancesBadge('paused')).toBe(false)
  })
})
