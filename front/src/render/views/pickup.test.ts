import { describe, expect, it } from 'vitest'

import { pickupAlarm } from './pickup'

/**
 * Une pastille vit 14 s puis s'efface. Elle le faisait sans rien annoncer :
 * même pulsation de la première à la dernière seconde, puis plus rien. Le
 * joueur traversait l'arène pour un power-up déjà condamné.
 *
 * `pickupAlarm` est la part calculable de l'avertissement — le reste (l'arc
 * qui se vide, le clignotement) est du tracé Pixi qu'aucun test ne peut juger.
 */
describe('pickupAlarm', () => {
  it('reste muette tant que la pastille a le temps', () => {
    expect(pickupAlarm(1)).toBe(0)
    expect(pickupAlarm(0.8)).toBe(0)
    expect(pickupAlarm(0.3)).toBe(0)
  })

  it('monte de zéro à un sur la fin de vie', () => {
    // Au seuil exact, l'alarme n'a pas encore commencé…
    expect(pickupAlarm(0.26)).toBe(0)
    // …à mi-fenêtre elle est à mi-course…
    expect(pickupAlarm(0.13)).toBeCloseTo(0.5, 6)
    // …et pleine à l'instant où la pastille s'efface.
    expect(pickupAlarm(0)).toBe(1)
  })

  it('croît sans à-coup, jamais en escalier', () => {
    let precedent = -1
    for (let i = 0; i <= 40; i++) {
      const alarme = pickupAlarm(1 - i / 40)
      expect(alarme).toBeGreaterThanOrEqual(precedent)
      precedent = alarme
    }
  })

  /**
   * Le rapport vient d'une division par une constante côté `stage.ts` : un
   * `Lifetime` qui dépasserait sa durée nominale, ou passerait sous zéro entre
   * deux pas, ne doit pas rendre une opacité négative ni un arc de plus d'un
   * tour.
   */
  it('borne les valeurs hors plage plutôt que de les propager', () => {
    expect(pickupAlarm(1.5)).toBe(0)
    expect(pickupAlarm(-0.4)).toBe(1)
    expect(pickupAlarm(Number.POSITIVE_INFINITY)).toBe(0)
  })
})
