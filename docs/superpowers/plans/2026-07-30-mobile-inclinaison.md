# Mobile : rotation, inclinaison et joystick — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le jeu jouable sur téléphone — arène pivotée en portrait, déplacement à l'inclinaison de l'appareil, joystick virtuel en repli — sans jamais changer l'arène.

**Architecture:** Trois sources d'entrée (clavier, inclinaison, joystick) exposent la même méthode `writeInto(input)` ; `game.ts` retient celle de plus forte magnitude. Le cœur de chaque source est une fonction pure testable sans appareil ; seul le branchement des événements ne l'est pas. En portrait sur pointeur tactile, une unique transformation CSS fait pivoter `#app`, canvas et menus compris.

**Tech Stack:** TypeScript strict, PixiJS v8, bitECS, Vitest, Biome, Tailwind v4, DeviceOrientationEvent, Pointer Events.

**Spec :** `docs/superpowers/specs/2026-07-30-mobile-inclinaison-design.md`

**PRÉREQUIS :** le lot 1 (`docs/superpowers/plans/2026-07-30-arene-fixe.md`) doit être entièrement terminé. Ce plan s'appuie sur `computeViewport`, `Viewport`, `ARENA`, `stage.setViewport` et `hud.setViewport`.

## Global Constraints

- Documentation et commentaires **en français**. Commits en conventional commits (commitlint actif).
- `src/sim/` reste pur et déterministe. Toute valeur d'entrée écrite dans la simulation est **quantifiée à 1/128** pour rester rejouable à l'identique.
- `src/render/` n'écrit jamais dans la simulation et n'a pas droit à `!`.
- Vérifications avant chaque commit : `npm run typecheck`, `npm run lint`, `npm test`.
- **Ne jamais pousser vers origin.**
- Relire chaque fichier avant de le modifier : un autre agent travaille parfois dans ce dépôt.
- **Limite de vérification connue :** l'inclinaison réelle ne peut pas être testée depuis la session de développement (pas d'appareil, et les capteurs exigent un contexte sécurisé — un serveur de dev en `http://` sur IP locale ne les expose pas). Les fonctions pures et le rendu pivoté sont testables ; la calibration se fait par le propriétaire du projet sur l'URL HTTPS déployée. Ne jamais annoncer l'inclinaison comme « vérifiée » sur la seule foi des tests unitaires.

---

### Task 1 : rotation de vecteurs, la brique partagée

**Files:**
- Create: `src/app/orientation.ts`
- Test: `src/app/orientation.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `type QuarterTurns = 0 | 1 | 2 | 3` et `rotateVector(x: number, y: number, quarters: QuarterTurns): { x: number; y: number }`. Les tâches 2, 5 et 6 en dépendent.

Convention, à respecter partout : repère écran, `y` vers le bas ; un quart de tour est **horaire**. `rotateVector(1, 0, 1)` vaut donc `{ x: 0, y: 1 }` — « vers la droite » devient « vers le bas ».

- [ ] **Step 1 : écrire le test qui échoue**

```ts
// src/app/orientation.test.ts
import { describe, expect, it } from 'vitest'

import { rotateVector } from './orientation'

describe('rotateVector', () => {
  it('ne touche à rien sans quart de tour', () => {
    expect(rotateVector(3, -4, 0)).toEqual({ x: 3, y: -4 })
  })

  it('tourne d’un quart horaire : la droite devient le bas', () => {
    expect(rotateVector(1, 0, 1)).toEqual({ x: 0, y: 1 })
  })

  it('tourne d’un demi-tour', () => {
    expect(rotateVector(1, 2, 2)).toEqual({ x: -1, y: -2 })
  })

  it('tourne de trois quarts : la droite devient le haut', () => {
    expect(rotateVector(1, 0, 3)).toEqual({ x: 0, y: -1 })
  })

  it('trois quarts annulent un quart', () => {
    const once = rotateVector(5, -2, 1)
    expect(rotateVector(once.x, once.y, 3)).toEqual({ x: 5, y: -2 })
  })

  it('conserve la norme', () => {
    for (const q of [0, 1, 2, 3] as const) {
      const v = rotateVector(3, 4, q)
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(5, 10)
    }
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/app/orientation.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3 : écrire l'implémentation**

```ts
// src/app/orientation.ts
/** Nombre de quarts de tour horaires appliqués à l'affichage. */
export type QuarterTurns = 0 | 1 | 2 | 3

/**
 * Rotation d'un vecteur par quarts de tour horaires, en repère écran (`y` vers
 * le bas). Partagée par l'inclinaison et le joystick : les deux mesurent dans
 * le repère de l'écran et doivent ramener leur vecteur dans celui de l'arène.
 */
export function rotateVector(x: number, y: number, quarters: QuarterTurns): { x: number; y: number } {
  switch (quarters) {
    case 1:
      return { x: -y, y: x }
    case 2:
      return { x: -x, y: -y }
    case 3:
      return { x: y, y: -x }
    default:
      return { x, y }
  }
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/app/orientation.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5 : commit**

```bash
git add src/app/orientation.ts src/app/orientation.test.ts
git commit -m "feat(app): add quarter-turn vector rotation"
```

---

### Task 2 : `tiltToInput`, l'inclinaison en intention de déplacement

**Files:**
- Create: `src/app/tilt.ts`
- Test: `src/app/tilt.test.ts`

**Interfaces:**
- Consumes: `rotateVector`, `QuarterTurns` (tâche 1).
- Produces: `TILT_DEAD_ZONE_DEG`, `TILT_FULL_DEG`, `INPUT_QUANTUM`, et `tiltToInput(deltaBeta: number, deltaGamma: number, quarters: QuarterTurns): { x: number; y: number }`. La tâche 4 branche les événements dessus ; la tâche 5 réutilise `INPUT_QUANTUM`.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
// src/app/tilt.test.ts
import { describe, expect, it } from 'vitest'

import { INPUT_QUANTUM, TILT_FULL_DEG, tiltToInput } from './tilt'

describe('tiltToInput', () => {
  it('ignore une inclinaison dans la zone morte', () => {
    expect(tiltToInput(2, 0, 0)).toEqual({ x: 0, y: 0 })
    expect(tiltToInput(0, -2, 0)).toEqual({ x: 0, y: 0 })
  })

  it('sature à la magnitude 1 à l’angle plein', () => {
    const v = tiltToInput(0, TILT_FULL_DEG, 0)
    expect(v.x).toBeCloseTo(1, 5)
    expect(v.y).toBe(0)
  })

  it('ne dépasse jamais la magnitude 1', () => {
    const v = tiltToInput(70, 70, 0)
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('donne une magnitude intermédiaire entre zone morte et angle plein', () => {
    const v = tiltToInput(0, 11.5, 0)
    const magnitude = Math.hypot(v.x, v.y)
    expect(magnitude).toBeGreaterThan(0.4)
    expect(magnitude).toBeLessThan(0.6)
  })

  it('mappe gamma sur x et beta sur y sans rotation', () => {
    const droite = tiltToInput(0, TILT_FULL_DEG, 0)
    expect(droite.x).toBeGreaterThan(0)
    expect(droite.y).toBe(0)

    const avant = tiltToInput(TILT_FULL_DEG, 0, 0)
    expect(avant.x).toBe(0)
    expect(avant.y).toBeGreaterThan(0)
  })

  it('applique le quart de tour de l’affichage', () => {
    const v = tiltToInput(0, TILT_FULL_DEG, 1)
    expect(v.x).toBe(0)
    expect(v.y).toBeCloseTo(1, 5)
  })

  it('quantifie les composantes en multiples de 1/128', () => {
    const v = tiltToInput(7, 13, 0)
    expect(Math.abs(v.x / INPUT_QUANTUM % 1)).toBeLessThan(1e-9)
    expect(Math.abs(v.y / INPUT_QUANTUM % 1)).toBeLessThan(1e-9)
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/app/tilt.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3 : écrire l'implémentation**

```ts
// src/app/tilt.ts
import { type QuarterTurns, rotateVector } from './orientation'

/** En dessous, on considère que le joueur tient l'appareil au repos. */
export const TILT_DEAD_ZONE_DEG = 3
/** Angle à partir duquel la magnitude vaut 1, donc la vitesse maximale. */
export const TILT_FULL_DEG = 20
/**
 * Pas de quantification des entrées écrites dans la simulation : un flux
 * d'entrées doit se rejouer à l'identique, ce qu'un flottant brut issu d'un
 * capteur ne garantit pas.
 */
export const INPUT_QUANTUM = 1 / 128

const quantize = (v: number): number => Math.round(v / INPUT_QUANTUM) * INPUT_QUANTUM

/**
 * Convertit un écart d'inclinaison par rapport à la pose neutre en intention de
 * déplacement. `gamma` (gauche/droite) donne l'axe x, `beta` (avant/arrière)
 * l'axe y ; `quarters` ramène le vecteur dans le repère de l'arène quand
 * l'affichage est pivoté.
 */
export function tiltToInput(
  deltaBeta: number,
  deltaGamma: number,
  quarters: QuarterTurns,
): { x: number; y: number } {
  const raw = rotateVector(deltaGamma, deltaBeta, quarters)
  const angle = Math.hypot(raw.x, raw.y)
  if (angle <= TILT_DEAD_ZONE_DEG) {
    return { x: 0, y: 0 }
  }
  const magnitude = Math.min(
    1,
    (angle - TILT_DEAD_ZONE_DEG) / (TILT_FULL_DEG - TILT_DEAD_ZONE_DEG),
  )
  return {
    x: quantize((raw.x / angle) * magnitude),
    y: quantize((raw.y / angle) * magnitude),
  }
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/app/tilt.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5 : commit**

```bash
git add src/app/tilt.ts src/app/tilt.test.ts
git commit -m "feat(app): map device tilt to a movement intent"
```

---

### Task 3 : la vitesse suit la magnitude de l'entrée

Une seule modification de la simulation dans tout ce lot. Le clavier envoie toujours une magnitude de 0 ou 1 (la diagonale est normalisée), donc son comportement doit rester identique — c'est le point que les tests doivent verrouiller.

**Files:**
- Modify: `src/sim/systems/player-movement.ts`
- Test: `src/sim/systems/player-movement.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: aucune API nouvelle. Comportement : plafond de vitesse `maxSpeed × min(1, hypot(moveX, moveY))` **tant qu'il y a une entrée**.

Piège à ne pas manquer : le plafond ne doit **pas** s'appliquer quand l'entrée est nulle, sinon relâcher les commandes annulerait instantanément la vitesse et détruirait l'inertie que la friction est censée gérer.

- [ ] **Step 1 : relire `src/sim/systems/player-movement.ts` et son test**

Repérer la branche `if (inputLen > 0.001)` (accélération) et la branche `else` (friction), puis le plafonnement final sur `maxSpeed`.

- [ ] **Step 2 : écrire les tests qui échouent**

À ajouter dans `src/sim/systems/player-movement.test.ts`, en réutilisant les helpers `world()` et `stepN()` déjà présents en tête de fichier :

```ts
  it('plafonne la vitesse à la moitié pour une entrée de magnitude 0,5', () => {
    const w = world()
    w.input.moveX = 0.5
    w.input.moveY = 0
    stepN(w, 600)
    const plein = world()
    plein.input.moveX = 1
    plein.input.moveY = 0
    stepN(plein, 600)
    expect(Math.abs(Velocity.x[w.playerEid]!)).toBeCloseTo(
      Math.abs(Velocity.x[plein.playerEid]!) * 0.5,
      1,
    )
  })

  it('atteint la même vitesse maximale au clavier qu’avant le changement', () => {
    const w = world()
    w.input.moveX = 1
    w.input.moveY = 0
    stepN(w, 600)
    expect(Math.abs(Velocity.x[w.playerEid]!)).toBeCloseTo(Movement.maxSpeed[w.playerEid]!, 1)
  })

  it('conserve l’inertie quand l’entrée retombe à zéro', () => {
    const w = world()
    w.input.moveX = 1
    stepN(w, 600)
    w.input.moveX = 0
    stepN(w, 1)
    // La friction fait décroître la vitesse, elle ne l'annule pas d'un coup.
    expect(Math.abs(Velocity.x[w.playerEid]!)).toBeGreaterThan(0)
  })
```

Ajouter `Movement` à l'import de `../components` en tête de fichier s'il n'y est pas déjà.

- [ ] **Step 3 : lancer les tests pour vérifier que le premier échoue**

Run: `npx vitest run src/sim/systems/player-movement.test.ts`
Expected: le test « plafonne la vitesse à la moitié » FAIL (aujourd'hui les deux vitesses saturent à `maxSpeed`, le rapport vaut 1 et non 0,5). Les deux autres PASSENT déjà — ce sont les garde-fous de non-régression.

- [ ] **Step 4 : écrire l'implémentation**

Remplacer le plafonnement final :

```ts
    // Le plafond suit la magnitude de l'entrée : une manette ou une
    // inclinaison à mi-course donne une vitesse à mi-course. Le clavier envoie
    // toujours 0 ou 1, son comportement est donc inchangé. Sans entrée, le
    // plafond reste entier — sinon relâcher les commandes annulerait la vitesse
    // au lieu de laisser la friction faire son travail.
    const cap = inputLen > 0.001 ? maxSpeed * Math.min(1, inputLen) : maxSpeed
    const speed = Math.hypot(vx, vy)
    if (speed > cap) {
      vx = (vx / speed) * cap
      vy = (vy / speed) * cap
    }
```

- [ ] **Step 5 : lancer toute la suite**

Run: `npm test`
Expected: tout passe, y compris `src/sim/determinism.test.ts` et `src/sim/purity.test.ts`. Si un test de déterminisme scripte des entrées fractionnaires, son résultat de référence change légitimement : relire le test, comprendre l'écart, et ne mettre à jour la valeur attendue **qu'après** avoir confirmé que le changement est bien celui voulu.

- [ ] **Step 6 : commit**

```bash
git add src/sim/systems/player-movement.ts src/sim/systems/player-movement.test.ts
git commit -m "feat(sim): scale the speed cap with the input magnitude"
```

---

### Task 4 : brancher les capteurs et composer les sources

**Files:**
- Modify: `src/app/tilt.ts` (ajout de `createTilt`)
- Modify: `src/app/game.ts`

**Interfaces:**
- Consumes: `tiltToInput` (tâche 2), `QuarterTurns` (tâche 1), `createKeyboard` (existant).
- Produces: `createTilt(): Tilt` avec

```ts
export interface Tilt {
  readonly available: boolean
  requestPermission(): Promise<boolean>
  recentre(): void
  setQuarterTurns(quarters: QuarterTurns): void
  writeInto(input: InputState): void
  destroy(): void
}
```

La tâche 5 (joystick) et la tâche 6 (rotation) s'y raccordent.

- [ ] **Step 1 : implémenter `createTilt`**

```ts
// à ajouter dans src/app/tilt.ts
import type { InputState } from '@/sim/input'

export interface Tilt {
  readonly available: boolean
  requestPermission(): Promise<boolean>
  /** Capture la pose courante comme neutre. */
  recentre(): void
  setQuarterTurns(quarters: QuarterTurns): void
  writeInto(input: InputState): void
  destroy(): void
}

interface PermissionCapableCtor {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export function createTilt(): Tilt {
  let neutralBeta: number | null = null
  let neutralGamma: number | null = null
  let beta = 0
  let gamma = 0
  let quarters: QuarterTurns = 0
  let received = false

  const onOrientation = (e: DeviceOrientationEvent): void => {
    if (e.beta === null || e.gamma === null) {
      return
    }
    received = true
    beta = e.beta
    gamma = e.gamma
    // Première mesure : elle définit la pose neutre si personne ne l'a fait.
    neutralBeta ??= beta
    neutralGamma ??= gamma
  }

  window.addEventListener('deviceorientation', onOrientation)

  return {
    get available(): boolean {
      return typeof DeviceOrientationEvent !== 'undefined' && received
    },

    async requestPermission(): Promise<boolean> {
      const ctor = DeviceOrientationEvent as unknown as PermissionCapableCtor
      if (typeof ctor.requestPermission !== 'function') {
        // Android et desktop : pas de permission à demander.
        return typeof DeviceOrientationEvent !== 'undefined'
      }
      try {
        return (await ctor.requestPermission()) === 'granted'
      } catch {
        return false
      }
    },

    recentre(): void {
      neutralBeta = beta
      neutralGamma = gamma
    },

    setQuarterTurns(next: QuarterTurns): void {
      quarters = next
    },

    writeInto(input: InputState): void {
      if (neutralBeta === null || neutralGamma === null) {
        input.moveX = 0
        input.moveY = 0
        return
      }
      const v = tiltToInput(beta - neutralBeta, gamma - neutralGamma, quarters)
      input.moveX = v.x
      input.moveY = v.y
    },

    destroy(): void {
      window.removeEventListener('deviceorientation', onOrientation)
    },
  }
}
```

- [ ] **Step 2 : composer les sources dans `game.ts`**

Relire `src/app/game.ts`, puis, à côté de `const keyboard = createKeyboard()` :

```ts
  const tilt = createTilt()
  // Tampon réutilisé à chaque pas : une source écrit dedans, on compare sa
  // magnitude, on garde la plus forte. Une source au repos ne doit jamais
  // annuler celle que le joueur utilise réellement.
  const scratch: InputState = { moveX: 0, moveY: 0 }

  function readInput(target: InputState): void {
    let bestX = 0
    let bestY = 0
    let best = 0
    for (const source of [keyboard, tilt]) {
      scratch.moveX = 0
      scratch.moveY = 0
      source.writeInto(scratch)
      const magnitude = Math.hypot(scratch.moveX, scratch.moveY)
      if (magnitude > best) {
        best = magnitude
        bestX = scratch.moveX
        bestY = scratch.moveY
      }
    }
    target.moveX = bestX
    target.moveY = bestY
  }
```

Dans `onStep`, remplacer `keyboard.writeInto(run.world.input)` par `readInput(run.world.input)`.

- [ ] **Step 3 : demander la permission au tap sur « Jouer » et recentrer**

Dans le callback `onPlay` du menu :

```ts
    async onPlay(): Promise<void> {
      // iOS exige un geste utilisateur pour accéder aux capteurs : le tap sur
      // « Jouer » le porte, plutôt qu'un écran d'autorisation supplémentaire.
      await tilt.requestPermission()
      // Pose neutre = celle du joueur au lancement, pas « à plat ».
      tilt.recentre()
      startRun()
      machine.send('START')
      menuScreen.hide()
    },
```

Vérifier la signature de `MenuActions.onPlay` dans `src/ui/screens/menu.ts` : la passer à `() => void | Promise<void>` si nécessaire, et ne pas attendre le retour côté menu.

- [ ] **Step 4 : vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout passe.

Vérification sur poste de travail : le clavier fonctionne exactement comme avant (aucun capteur, `tilt.writeInto` écrit des zéros et perd donc toujours la comparaison de magnitude).

**Ne pas déclarer l'inclinaison vérifiée à cette étape.** Elle ne peut l'être que sur appareil réel, en HTTPS.

- [ ] **Step 5 : commit**

```bash
git add src/app/tilt.ts src/app/game.ts src/ui/screens/menu.ts
git commit -m "feat(app): drive movement from device orientation"
```

---

### Task 5 : joystick virtuel flottant

**Files:**
- Create: `src/app/joystick.ts`
- Test: `src/app/joystick.test.ts`
- Modify: `src/app/game.ts`
- Modify: `src/ui/screens/settings.ts`

**Interfaces:**
- Consumes: `rotateVector`, `QuarterTurns` (tâche 1), `INPUT_QUANTUM` (tâche 2), `readInput` (tâche 4).
- Produces: `joystickVector(...)` pur et `createJoystick(target: HTMLElement): Joystick` avec la même forme que `Tilt` (`writeInto`, `setQuarterTurns`, `setEnabled`, `destroy`).

- [ ] **Step 1 : écrire le test qui échoue**

```ts
// src/app/joystick.test.ts
import { describe, expect, it } from 'vitest'

import { joystickVector } from './joystick'

const RADIUS = 60

describe('joystickVector', () => {
  it('rend un vecteur nul quand le doigt n’a pas bougé', () => {
    expect(joystickVector(100, 100, 100, 100, RADIUS, 0)).toEqual({ x: 0, y: 0 })
  })

  it('donne une magnitude proportionnelle à la distance', () => {
    const v = joystickVector(100, 100, 130, 100, RADIUS, 0)
    expect(v.x).toBeCloseTo(0.5, 2)
    expect(v.y).toBe(0)
  })

  it('sature au rayon de référence', () => {
    const v = joystickVector(100, 100, 400, 100, RADIUS, 0)
    expect(v.x).toBeCloseTo(1, 5)
  })

  it('conserve la direction en diagonale', () => {
    const v = joystickVector(0, 0, 100, 100, RADIUS, 0)
    expect(v.x).toBeCloseTo(v.y, 5)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5)
  })

  it('applique le quart de tour de l’affichage', () => {
    const v = joystickVector(0, 0, RADIUS, 0, RADIUS, 1)
    expect(v.x).toBe(0)
    expect(v.y).toBeCloseTo(1, 5)
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/app/joystick.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3 : écrire la fonction pure**

```ts
// src/app/joystick.ts
import type { InputState } from '@/sim/input'
import { type QuarterTurns, rotateVector } from './orientation'
import { INPUT_QUANTUM } from './tilt'

/** Distance en px à partir de laquelle la magnitude vaut 1. */
export const JOYSTICK_RADIUS = 60

const quantize = (v: number): number => Math.round(v / INPUT_QUANTUM) * INPUT_QUANTUM

/**
 * Vecteur de traîne d'un joystick flottant : l'origine est le point de pose du
 * doigt. Les coordonnées de pointeur arrivent en espace écran, `quarters` les
 * ramène dans le repère de l'arène quand l'affichage est pivoté.
 */
export function joystickVector(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
  radius: number,
  quarters: QuarterTurns,
): { x: number; y: number } {
  const v = rotateVector(currentX - originX, currentY - originY, quarters)
  const distance = Math.hypot(v.x, v.y)
  if (distance < 1e-6) {
    return { x: 0, y: 0 }
  }
  const magnitude = Math.min(1, distance / radius)
  return {
    x: quantize((v.x / distance) * magnitude),
    y: quantize((v.y / distance) * magnitude),
  }
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/app/joystick.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5 : brancher les événements de pointeur**

Toujours dans `src/app/joystick.ts` :

```ts
export interface Joystick {
  setEnabled(enabled: boolean): void
  setQuarterTurns(quarters: QuarterTurns): void
  writeInto(input: InputState): void
  destroy(): void
}

/**
 * Joystick flottant : le doigt se pose où il veut, ce point devient l'origine.
 * Dans un jeu d'esquive, viser une base dessinée dans un coin coûte trop cher.
 */
export function createJoystick(target: HTMLElement): Joystick {
  let enabled = false
  let quarters: QuarterTurns = 0
  let pointerId: number | null = null
  let originX = 0
  let originY = 0
  let currentX = 0
  let currentY = 0

  const onDown = (e: PointerEvent): void => {
    if (!enabled || pointerId !== null) {
      return
    }
    pointerId = e.pointerId
    originX = currentX = e.clientX
    originY = currentY = e.clientY
  }

  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) {
      return
    }
    currentX = e.clientX
    currentY = e.clientY
  }

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) {
      return
    }
    pointerId = null
  }

  target.addEventListener('pointerdown', onDown)
  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  target.addEventListener('pointercancel', onUp)

  return {
    setEnabled(next: boolean): void {
      enabled = next
      if (!next) {
        pointerId = null
      }
    },

    setQuarterTurns(next: QuarterTurns): void {
      quarters = next
    },

    writeInto(input: InputState): void {
      if (pointerId === null) {
        input.moveX = 0
        input.moveY = 0
        return
      }
      const v = joystickVector(originX, originY, currentX, currentY, JOYSTICK_RADIUS, quarters)
      input.moveX = v.x
      input.moveY = v.y
    },

    destroy(): void {
      target.removeEventListener('pointerdown', onDown)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    },
  }
}
```

- [ ] **Step 6 : câbler dans `game.ts`, avec repli automatique**

```ts
  const joystick = createJoystick(document.body)
  let tiltGranted = false

  // Repli : si l'inclinaison n'est pas disponible après la demande de
  // permission, c'est le joystick qui prend le relais. Le réglage explicite du
  // joueur (Réglages) le force dans tous les cas.
  function chooseControls(): void {
    joystick.setEnabled(storage.get('forceJoystick', false) || !tiltGranted)
  }
```

Dans `onPlay` (tâche 4), remplacer `await tilt.requestPermission()` par :

```ts
      tiltGranted = await tilt.requestPermission()
      chooseControls()
```

et ajouter `joystick` à la liste des sources de `readInput` (tâche 4) : `for (const source of [keyboard, tilt, joystick])`.

- [ ] **Step 7 : ajouter le choix des commandes et le recentrage dans les Réglages**

Relire `src/ui/screens/settings.ts` en entier — il a évolué (navigation au pointeur, boutons de volume). Deux lignes à ajouter **avant** « Retour », qui doit rester la dernière : le choix des commandes et le recentrage de l'inclinaison. `ROW_COUNT` passe donc de 4 à 6.

```ts
// src/ui/screens/settings.ts — nouvelles dépendances
export interface SettingsDeps {
  /** Branché sur `stage.setEffects` par `game.ts` (spec §6.8). */
  onReducedMotionChange(reduced: boolean): void
  /** `true` = joystick forcé, `false` = inclinaison si disponible. */
  onControlsChange(forceJoystick: boolean): void
  /** Redéfinit la pose neutre de l'inclinaison sur la pose courante. */
  onRecentreTilt(): void
}

// Langue, mouvement réduit, volume, commandes, recentrage, retour.
const ROW_COUNT = 6
```

```ts
  let forceJoystick = storage.get('forceJoystick', false)

  const toggleControls = (): void => {
    forceJoystick = !forceJoystick
    storage.set('forceJoystick', forceJoystick)
    deps.onControlsChange(forceJoystick)
    render()
  }
```

Dans `render()`, entre le volume et le retour :

```ts
        ${row(3, t('settings.controls'), forceJoystick ? t('settings.joystick') : t('settings.tilt'))}
        ${row(4, t('settings.recentre'), '')}
        ${row(5, t('settings.back'), '')}
```

Dans `activate(index)`, remplacer l'index de retour et ajouter les deux nouveaux cas :

```ts
    } else if (index === 3) {
      toggleControls()
    } else if (index === 4) {
      deps.onRecentreTilt()
    } else if (index === 5) {
      back()
    }
```

Faire de même dans la branche gauche/droite (`NAV_LEFT_CODES` / `NAV_RIGHT_CODES`) pour que la ligne 3 bascule aussi aux flèches, comme la langue.

Ajouter les quatre clés — `settings.controls`, `settings.tilt`, `settings.joystick`, `settings.recentre` — dans `src/i18n/locales/en.json` **et** `fr.json` : `src/i18n/parity.test.ts` échoue si une clé manque d'un côté.

Côté `game.ts`, brancher les deux callbacks :

```ts
    onControlsChange(force): void {
      joystick.setEnabled(force || !tiltGranted)
    },
    onRecentreTilt(): void {
      tilt.recentre()
    },
```

où `tiltGranted` est le booléen mémorisé au retour de `tilt.requestPermission()` dans `onPlay` (le déclarer à côté de `settingsOpen`, initialisé à `false`).

- [ ] **Step 8 : vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout passe, parité i18n comprise.

Vérification sur poste de travail : forcer le joystick dans les Réglages, puis jouer à la souris en glissant — le blob suit, et la magnitude dose la vitesse. C'est le seul chemin tactile testable sans téléphone.

- [ ] **Step 9 : commit**

```bash
git add src/app/joystick.ts src/app/joystick.test.ts src/app/game.ts src/ui/screens/settings.ts src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(app): add a floating virtual joystick fallback"
```

---

### Task 6 : rotation de l'affichage en portrait

**Files:**
- Create: `src/app/layout.ts`
- Test: `src/app/layout.test.ts`
- Modify: `src/app/game.ts`
- Modify: `index.html` (identifiant sur `#app` déjà présent, à vérifier)

**Interfaces:**
- Consumes: `computeViewport` (lot 1), `QuarterTurns` (tâche 1), `tilt.setQuarterTurns` (tâche 4), `joystick.setQuarterTurns` (tâche 5).
- Produces: `shouldRotate(windowWidth: number, windowHeight: number, coarsePointer: boolean): boolean`.

- [ ] **Step 1 : écrire le test qui échoue**

```ts
// src/app/layout.test.ts
import { describe, expect, it } from 'vitest'

import { shouldRotate } from './layout'

describe('shouldRotate', () => {
  it('pivote un écran tactile en portrait', () => {
    expect(shouldRotate(400, 800, true)).toBe(true)
  })

  it('ne pivote pas un écran tactile en paysage', () => {
    expect(shouldRotate(800, 400, true)).toBe(false)
  })

  it('ne pivote jamais un pointeur fin, même en fenêtre haute et étroite', () => {
    expect(shouldRotate(400, 800, false)).toBe(false)
  })

  it('ne pivote pas une fenêtre carrée', () => {
    expect(shouldRotate(600, 600, true)).toBe(false)
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/app/layout.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3 : écrire l'implémentation**

```ts
// src/app/layout.ts
/**
 * L'affichage pivote en portrait sur appareil tactile : l'arène reste la même
 * pour tous, le joueur tourne son téléphone même si la rotation système est
 * verrouillée. La condition de pointeur grossier évite qu'une fenêtre de bureau
 * étroite et haute se mette à pivoter.
 */
export function shouldRotate(
  windowWidth: number,
  windowHeight: number,
  coarsePointer: boolean,
): boolean {
  return coarsePointer && windowHeight > windowWidth
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/app/layout.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5 : appliquer la rotation dans `applyLayout`**

Remplacer `applyLayout` (créée au lot 1) par :

```ts
  const appEl = document.querySelector<HTMLElement>('#app')
  if (!appEl) {
    throw new Error('#app introuvable')
  }
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches

  function applyLayout(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    const rotated = shouldRotate(w, h, coarsePointer)

    // En portrait tactile, on pivote `#app` d'un quart de tour horaire. Il
    // contient le canvas ET le calque DOM `#ui` : menus et jeu tournent
    // ensemble, et le navigateur transforme lui-même les coordonnées de
    // pointeur — aucune correspondance à coder pour la navigation au doigt.
    const viewWidth = rotated ? h : w
    const viewHeight = rotated ? w : h

    if (rotated) {
      appEl.style.width = `${viewWidth}px`
      appEl.style.height = `${viewHeight}px`
      appEl.style.transformOrigin = 'top left'
      // La rotation seule laisserait la boîte à gauche de l'écran : on la
      // ramène de la largeur de la fenêtre.
      appEl.style.transform = `translateX(${w}px) rotate(90deg)`
    } else {
      appEl.style.width = ''
      appEl.style.height = ''
      appEl.style.transform = ''
      appEl.style.transformOrigin = ''
    }

    stage.resize(viewWidth, viewHeight)
    const viewport = computeViewport(viewWidth, viewHeight, ARENA.width, ARENA.height)
    stage.setViewport(viewport)
    hud.setViewport(viewport)

    // Les capteurs et le pointeur mesurent en repère écran : il faut défaire
    // la rotation de l'affichage pour retomber dans le repère de l'arène.
    const quarters: QuarterTurns = rotated ? 3 : 0
    tilt.setQuarterTurns(quarters)
    joystick.setQuarterTurns(quarters)
  }
```

`#app` porte aujourd'hui les classes `relative h-screen w-screen` : les styles inline ci-dessus les surchargent en portrait et sont remis à vide sinon.

- [ ] **Step 6 : vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout passe.

Vérification en émulation mobile (outils de développement Chrome, appareil iPhone ou Pixel en portrait, ce qui active `pointer: coarse`) :
- l'arène occupe l'écran pivotée d'un quart de tour, sans marge parasite ;
- le titre du menu et les entrées sont pivotés avec elle, et **restent tapables au bon endroit** ;
- passer en paysage dans l'émulateur remet tout d'aplomb.

Si le rendu sort de l'écran, le coupable est l'ordre des transformations : `translateX(...) rotate(90deg)` applique bien la translation **après** la rotation. Vérifier aussi que le canvas n'est pas flou — sa résolution doit suivre `viewWidth × viewHeight` et non les dimensions non pivotées.

**Le sens de rotation des entrées (`quarters = 3`) ne peut être confirmé que sur appareil réel :** incliner le téléphone vers la droite doit déplacer le blob vers la droite *telle qu'elle apparaît à l'écran pivoté*. Si les axes sont inversés, essayer `1` au lieu de `3` — les tests de la tâche 1 garantissent que les deux sont des rotations exactes, pas laquelle est la bonne.

- [ ] **Step 7 : commit**

```bash
git add src/app/layout.ts src/app/layout.test.ts src/app/game.ts
git commit -m "feat(app): rotate the display in touch portrait"
```

---

### Task 7 : pause au doigt

**Files:**
- Create: `src/ui/screens/touch-pause.ts`
- Modify: `src/app/game.ts`
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`

**Interfaces:**
- Consumes: la machine à états et `pauseScreen` de `game.ts`.
- Produces: `createTouchPause(root: HTMLElement, onPause: () => void): { setVisible(visible: boolean): void; destroy(): void }`.

- [ ] **Step 1 : créer la cible tactile**

```ts
// src/ui/screens/touch-pause.ts
import { t } from '@/i18n'

export interface TouchPause {
  setVisible(visible: boolean): void
  destroy(): void
}

/**
 * Sur téléphone il n'y a pas de touche `Échap` : une cible de pause en haut de
 * l'arène. Affichée seulement en pointeur grossier, et seulement en jeu.
 */
export function createTouchPause(root: HTMLElement, onPause: () => void): TouchPause {
  const el = document.createElement('button')
  el.type = 'button'
  el.className =
    'pointer-events-auto absolute left-1/2 top-2 hidden -translate-x-1/2 rounded border border-paper/30 px-4 py-2 text-xs tracking-[0.2em] text-paper opacity-60'
  el.textContent = t('pause.title')
  el.addEventListener('click', onPause)
  root.appendChild(el)

  return {
    setVisible(visible: boolean): void {
      el.classList.toggle('hidden', !visible)
    },
    destroy(): void {
      el.remove()
    },
  }
}
```

Vérifier que la clé `pause.title` existe dans les deux fichiers de locale ; si le libellé souhaité diffère, ajouter une clé dédiée **dans les deux** (`src/i18n/parity.test.ts` échoue sinon).

- [ ] **Step 2 : câbler dans `game.ts`**

À côté de `syncArenaVisibility` / `syncCursorVisibility`, sur le même modèle (appel par frame, court-circuit si l'état n'a pas changé) :

```ts
  const touchPause = createTouchPause(uiRoot, (): void => {
    if (machine.state === 'playing') {
      machine.send('PAUSE')
      pauseScreen.show()
    }
  })

  let touchPauseShown = false
  function syncTouchPause(): void {
    const visible = coarsePointer && machine.state === 'playing'
    if (visible === touchPauseShown) {
      return
    }
    touchPauseShown = visible
    touchPause.setVisible(visible)
  }
```

Appeler `syncTouchPause()` dans `onRender`, **avant** le court-circuit `if (!arenaShown) return`, comme `syncCursorVisibility`.

- [ ] **Step 3 : vérifier**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout passe.

En émulation mobile : le bouton n'apparaît qu'en jeu, il ouvre la pause, et il disparaît au menu comme sur les autres écrans. Sur poste de travail (pointeur fin), il ne doit jamais apparaître.

Attention : ce bouton est dans `#ui`, qui est `pointer-events-none` ; la classe `pointer-events-auto` sur le bouton est donc indispensable.

- [ ] **Step 4 : commit**

```bash
git add src/ui/screens/touch-pause.ts src/app/game.ts src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(ui): add a touch pause target"
```

---

## Vérification finale du lot

- [ ] `npm run typecheck && npm run lint && npm test` — tout vert.
- [ ] `npm run build` — la compilation de production passe.
- [ ] Poste de travail : clavier inchangé ; joystick forcé depuis les Réglages, jouable à la souris.
- [ ] Émulation mobile en portrait : affichage pivoté, menus tapables, bouton de pause présent, joystick opérationnel.
- [ ] **À faire par le propriétaire du projet, sur téléphone, sur l'URL HTTPS déployée :**
  - la demande d'autorisation de mouvement apparaît au tap sur « Jouer » (iOS) ;
  - incliner l'appareil déplace le blob dans le sens attendu, dans les deux orientations ;
  - la zone morte (3°) et l'angle de saturation (20°) sont confortables — ce sont des valeurs de départ, à ajuster dans `src/app/tilt.ts` ;
  - refuser l'autorisation fait bien basculer sur le joystick.

## Limites assumées

- Sans gyroscope et avec l'autorisation refusée, le joueur passe au joystick : il n'existe aucun troisième mode.
- Le gyroscope de certains appareils dérive. Le recentrage au début de chaque run limite l'exposition, et le recentrage manuel reste accessible depuis les Réglages.
- Le multi-touch, les gestes et le retour haptique sont hors périmètre.
