import { describe, expect, it } from 'vitest'

import { resolveMovementInput } from './input-source'

describe('resolveMovementInput', () => {
  // L'environnement Vitest est `node` : `localStorage` n'existe pas, `storage`
  // rattrape l'erreur et rend le défaut. C'est exactement le cas d'un premier
  // lancement, ou d'une navigation privée qui refuse le stockage.
  it('vaut « souris » sans rien de stocké', () => {
    expect(resolveMovementInput()).toBe('mouse')
  })
})
