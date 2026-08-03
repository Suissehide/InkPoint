import { afterEach, describe, expect, it, vi } from 'vitest'

import { fakeLocalStorage } from './fake-local-storage'
import { resolveMovementInput } from './input-source'
import { storage } from './storage'

describe('resolveMovementInput', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Sans `localStorage` du tout : `storage` rattrape l'erreur et rend le
  // défaut. C'est le cas d'un premier lancement, ou d'une navigation privée
  // qui refuse le stockage.
  it('choisit la souris par défaut sur pointeur fin', () => {
    expect(resolveMovementInput(false)).toBe('mouse')
  })

  it('choisit le joystick par défaut sur pointeur grossier', () => {
    expect(resolveMovementInput(true)).toBe('joystick')
  })

  it('honore une valeur stockée servie, quel que soit l’appareil', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    storage.set('movementInput', 'keyboard')
    expect(resolveMovementInput(true)).toBe('keyboard')
    expect(resolveMovementInput(false)).toBe('keyboard')
  })

  // Le lot 2 apportera l'inclinaison ; d'ici là, une valeur stockée par une
  // version future ne doit pas rendre le jeu injouable.
  it('rabat « tilt » sur le joystick tant que l’inclinaison n’existe pas', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    storage.set('movementInput', 'tilt')
    expect(resolveMovementInput(true)).toBe('joystick')
  })

  it('rabat une valeur corrompue sur le défaut de l’appareil', () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    storage.set('movementInput', 'trackball')
    expect(resolveMovementInput(true)).toBe('joystick')
    expect(resolveMovementInput(false)).toBe('mouse')
  })
})
