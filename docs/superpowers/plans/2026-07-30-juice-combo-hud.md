# Timer, combo lisible et juice au kill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le kill lisible et gratifiant — timer de run au HUD, combo visible et vivant, score dominé par les kills, effets d'impact modulés par le combo, distorsion de fond réduite.

**Architecture:** `src/app/juice.ts` reste le seul traducteur `world.events` → effets ressentis. Il calcule une intensité `0 → 1` dérivée du multiplicateur de combo et la passe à des modules de rendu dédiés (caméra, particules, flash, anneaux) plus au HUD. Rien dans `src/render/` ni `src/ui/` ne remonte vers `src/sim/`.

**Tech Stack:** TypeScript strict, Pixi.js 8 (`Graphics`), bitECS, Vitest (environnement `node`, **sans DOM**), Tailwind v4, Biome.

**Spec :** `docs/superpowers/specs/2026-07-30-juice-combo-hud-design.md`

## Global Constraints

- **`src/sim/` reste pur** : Biome interdit d'y importer `pixi.js`, `render/`, `ui/`, `app/`, et d'y toucher `window`, `document`, `performance`, `localStorage`.
- **Pas de `!` (non-null assertion) hors de `src/sim/`** : `noNonNullAssertion` n'est désactivé que pour `src/sim/**`. Avec `noUncheckedIndexedAccess: true`, tout accès indexé se vérifie explicitement (`if (!p) { continue }`) ou lève.
- **Vitest tourne en environnement `node`** : aucun test ne peut toucher au DOM ni instancier Pixi. Toute logique à tester doit être une fonction pure exportée.
- **Toute clé i18n ajoutée doit l'être dans `en.json` ET `fr.json`** — `src/i18n/parity.test.ts` échoue sinon.
- **Commentaires et messages de commit en français**, comme tout le dépôt. Convention de commit : `type(scope): sujet` (commitlint conventional).
- **Palette** : seules les couleurs de `src/render/ink.ts` (`INK.paper`, `INK.danger`, `INK.blast`, `INK.frost`) sont utilisées côté rendu. `INK.danger` est réservé aux ennemis.
- **Vérification avant chaque commit** : `npm run lint && npm run typecheck && npm test`.

---

### Task 1: Le score bascule vers les kills

**Files:**
- Modify: `src/sim/systems/score.ts`
- Test: `src/sim/systems/score.test.ts` (existant — assertions mises à jour)

**Interfaces:**
- Consumes: rien.
- Produces: `COMBO_WINDOW_MS: number` (exporté, consommé par la Task 3), `comboMultiplier(combo: number): number` (déjà exporté, comportement changé : palier tous les 4 kills).

- [ ] **Step 1: Mettre à jour les tests existants pour les nouvelles valeurs**

Dans `src/sim/systems/score.test.ts`, remplacer les quatre cas concernés (les autres restent tels quels) :

```ts
  it('donne 5 points par seconde de survie', () => {
    const w = setup()
    run(w, 1000)
    expect(w.score).toBeCloseTo(5, 0)
  })

  it('donne 40 points par kill au combo ×1', () => {
    const w = setup()
    w.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    scoreSystem(w)
    expect(w.score).toBeCloseTo(40, 0)
  })

  it('le multiplicateur passe à ×2 après 4 kills', () => {
    const w = setup()
    for (let i = 0; i < 4; i++) {
      w.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
      scoreSystem(w)
      w.events.length = 0
    }
    const before = w.score
    w.events.push({ type: 'enemyKilled', eid: 99, x: 0, y: 0 })
    scoreSystem(w)
    expect(w.score - before).toBeCloseTo(80, 0)
  })

  it('plafonne le multiplicateur à ×10', () => {
    const w = setup()
    for (let i = 0; i < 200; i++) {
      w.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
      scoreSystem(w)
      w.events.length = 0
    }
    const before = w.score
    w.events.push({ type: 'enemyKilled', eid: 999, x: 0, y: 0 })
    scoreSystem(w)
    expect(w.score - before).toBeCloseTo(400, 0)
  })
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/sim/systems/score.test.ts`
Expected: FAIL — 4 tests en échec (`expected 10 to be close to 5`, `25 → 40`, `50 → 80`, `250 → 400`).

- [ ] **Step 3: Changer les constantes de pondération**

Dans `src/sim/systems/score.ts`, remplacer le bloc de constantes et `comboMultiplier` :

```ts
import { FIXED_DT, type SimWorld } from '../world'

/**
 * Le score est d'abord une récompense de kill, pas une récompense de temps
 * passé : à ×3, un ennemi tué vaut 120 points, soit 24 secondes de survie.
 * Survivre est le fond du score, tuer est le geste qui paie (spec §3).
 */
const SURVIVAL_POINTS_PER_SEC = 5
const KILL_POINTS = 40
/** Exporté : le HUD dessine la barre de décroissance de cette fenêtre. */
export const COMBO_WINDOW_MS = 2500
const COMBO_KILLS_PER_STEP = 4
const COMBO_MAX_MULTIPLIER = 10

export function comboMultiplier(combo: number): number {
  return Math.min(COMBO_MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_KILLS_PER_STEP))
}
```

Le reste du fichier (`scoreSystem`) est inchangé — il lit déjà ces constantes.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/sim/systems/score.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Vérifier lint et types, puis commiter**

```bash
npm run lint && npm run typecheck && npm test
git add src/sim/systems/score.ts src/sim/systems/score.test.ts
git commit -m "feat(sim): faire du kill la source principale du score"
```

---

### Task 2: Timer de run dans le HUD

**Files:**
- Modify: `src/ui/screens/hud.ts`
- Modify: `src/i18n/locales/en.json`
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/app/game.ts:288-293` (l'appel `hud.update`)
- Test: `src/i18n/parity.test.ts` (existant, aucune modification — il doit passer)

**Interfaces:**
- Consumes: `formatDuration(ms: number): string` de `src/ui/format.ts` (existant).
- Produces: `HudState` gagne le champ `time: number` (temps de simulation en ms).

- [ ] **Step 1: Ajouter la clé i18n dans les deux locales**

Dans `src/i18n/locales/en.json`, après la ligne `"hud.combo": "COMBO ×{n}",` :

```json
  "hud.time": "TIME",
```

Dans `src/i18n/locales/fr.json`, après la ligne `"hud.combo": "COMBO ×{n}",` :

```json
  "hud.time": "TEMPS",
```

- [ ] **Step 2: Lancer le test de parité pour vérifier qu'il passe**

Run: `npx vitest run src/i18n/parity.test.ts`
Expected: PASS — 2 tests. (Il échouerait si la clé n'était ajoutée que d'un côté : c'est exactement ce que ce test garde.)

- [ ] **Step 3: Ajouter le champ `time` à `HudState`**

Dans `src/ui/screens/hud.ts`, remplacer l'interface :

```ts
export interface HudState {
  score: number
  wave: number
  combo: number
  /** Temps écoulé dans la vague en cours, en ms (spec : vague de 40 s). */
  waveElapsed: number
  /**
   * Durée de la run, en temps de simulation (`world.time`) : elle gèle pendant
   * un hitstop et ralentit pendant le ralenti de mort. C'est voulu — le HUD
   * affiche exactement la durée que l'écran de mort annoncera (spec §4.1).
   */
  time: number
}
```

- [ ] **Step 4: Ajouter le bloc timer au balisage et son import**

Dans `src/ui/screens/hud.ts`, ajouter `formatDuration` à l'import existant :

```ts
import { formatDuration, formatScore } from '../format'
```

Puis, dans le `el.innerHTML`, insérer ce bloc entre le bloc score (`left-6 top-5`) et le bloc vague (`right-6 top-5`) :

```html
    <div class="absolute left-1/2 top-5 -translate-x-1/2 text-center">
      <div class="text-[10px] tracking-[0.25em] opacity-40" data-label-time></div>
      <div class="text-2xl opacity-90" data-time>0:00</div>
    </div>
```

Ajouter les deux références après `const waveEl = q('[data-wave]')` :

```ts
  const labelTime = q('[data-label-time]')
  const timeEl = q('[data-time]')
```

Et dans `update()`, après la ligne `waveEl.innerHTML = ...` :

```ts
      labelTime.textContent = t('hud.time')
      timeEl.innerHTML = renderNumber(formatDuration(state.time))
```

- [ ] **Step 5: Passer `world.time` depuis la boucle de rendu**

Dans `src/app/game.ts`, dans `onRender`, remplacer l'appel `hud.update` :

```ts
      hud.update({
        score: run.world.score,
        wave: run.world.wave,
        combo: run.world.combo,
        waveElapsed: run.world.waveElapsed,
        time: run.world.time,
      })
```

- [ ] **Step 6: Vérifier types, lint et tests, puis commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — le typecheck échouerait si `time` manquait à l'appel de `game.ts`.

```bash
git add src/ui/screens/hud.ts src/app/game.ts src/i18n/locales/en.json src/i18n/locales/fr.json
git commit -m "feat(ui): afficher la durée de la run dans le HUD"
```

---

### Task 3: Combo visible et vivant

**Files:**
- Create: `src/ui/screens/hud-combo.ts`
- Create: `src/ui/screens/hud-combo.test.ts`
- Modify: `src/ui/screens/hud.ts`
- Modify: `src/styles/main.css`
- Modify: `src/app/game.ts` (l'appel `hud.update`)

**Interfaces:**
- Consumes: `COMBO_WINDOW_MS`, `comboMultiplier` de `src/sim/systems/score.ts` (Task 1) ; `renderNumber` de `src/ui/numeral.ts`.
- Produces:
  - `comboTint(multiplier: number): string` — couleur CSS `rgb(r g b)`, pure, exportée pour test.
  - `createComboView(): ComboView` avec `readonly element: HTMLElement` et `update(combo: number, comboTimer: number): void`.
  - `HudState` gagne `comboTimer: number`.

- [ ] **Step 1: Écrire le test de la teinte**

Créer `src/ui/screens/hud-combo.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { comboTint } from './hud-combo'

describe('comboTint', () => {
  it('rend la couleur du papier au multiplicateur ×1', () => {
    expect(comboTint(1)).toBe('rgb(234 228 214)')
  })

  it('rend la couleur blast au multiplicateur maximal ×10', () => {
    expect(comboTint(10)).toBe('rgb(255 209 102)')
  })

  it('interpole entre les deux aux multiplicateurs intermédiaires', () => {
    expect(comboTint(5)).not.toBe(comboTint(1))
    expect(comboTint(5)).not.toBe(comboTint(10))
  })

  it('borne les valeurs hors plage au lieu de les extrapoler', () => {
    expect(comboTint(0)).toBe(comboTint(1))
    expect(comboTint(99)).toBe(comboTint(10))
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/ui/screens/hud-combo.test.ts`
Expected: FAIL — `Failed to resolve import "./hud-combo"`.

- [ ] **Step 3: Écrire le module du combo**

Créer `src/ui/screens/hud-combo.ts` :

```ts
import { COMBO_WINDOW_MS, comboMultiplier } from '@/sim/systems/score'
import { renderNumber } from '../numeral'

/** Miroir de `COMBO_MAX_MULTIPLIER` (src/sim/systems/score.ts) : borne de la teinte. */
const MAX_MULTIPLIER = 10

/** Bornes de la teinte : INK.paper → INK.blast, en composantes 0-255. */
const TINT_FROM = [0xea, 0xe4, 0xd6] as const
const TINT_TO = [0xff, 0xd1, 0x66] as const

/**
 * Couleur du multiplicateur : papier à ×1, jaune blast à ×10. La progression
 * de la couleur dit à elle seule où en est la série, sans avoir à lire le
 * chiffre (spec §4.2). Pure et exportée : c'est la seule partie testable de ce
 * module — le reste manipule le DOM, absent de l'environnement Vitest.
 */
export function comboTint(multiplier: number): string {
  const t = Math.min(1, Math.max(0, (multiplier - 1) / (MAX_MULTIPLIER - 1)))
  const mix = (from: number, to: number): number => Math.round(from + (to - from) * t)
  return `rgb(${mix(TINT_FROM[0], TINT_TO[0])} ${mix(TINT_FROM[1], TINT_TO[1])} ${mix(TINT_FROM[2], TINT_TO[2])})`
}

export interface ComboView {
  readonly element: HTMLElement
  update(combo: number, comboTimer: number): void
}

/**
 * Multiplicateur de combo, sa barre de fenêtre et le pop de palier. Extrait de
 * `hud.ts` parce que c'est le seul bloc du HUD à porter un état d'animation
 * (palier franchi, chute) : il compare la frame courante à la précédente,
 * là où le reste du HUD n'est qu'un rendu direct de `HudState`.
 */
export function createComboView(): ComboView {
  const el = document.createElement('div')
  el.className = 'mt-2 transition-opacity duration-200'
  el.style.opacity = '0'
  el.innerHTML = `
    <div class="inline-block text-3xl leading-none" data-combo-value></div>
    <div class="mt-1 h-[3px] w-16 rounded bg-paper/15">
      <div class="h-full rounded bg-paper/70" data-combo-bar style="width:0%"></div>
    </div>
  `

  const valueEl = el.querySelector<HTMLElement>('[data-combo-value]')
  const barEl = el.querySelector<HTMLElement>('[data-combo-bar]')
  if (!valueEl || !barEl) {
    throw new Error('hud-combo : balisage incomplet')
  }

  let lastMultiplier = 0

  return {
    element: el,

    update(combo: number, comboTimer: number): void {
      const multiplier = combo > 0 ? comboMultiplier(combo) : 0

      if (multiplier !== lastMultiplier) {
        if (multiplier > 0) {
          valueEl.innerHTML = renderNumber(`×${multiplier}`)
          valueEl.style.color = comboTint(multiplier)
        }
        if (multiplier > lastMultiplier) {
          // Retrait/lecture forcée/ajout : une animation CSS ne se relance pas
          // toute seule si la classe est déjà posée. La lecture d'`offsetWidth`
          // force le navigateur à recalculer le style entre les deux.
          valueEl.classList.remove('combo-pop')
          void valueEl.offsetWidth
          valueEl.classList.add('combo-pop')
        }
        lastMultiplier = multiplier
      }

      el.style.opacity = combo > 0 ? '1' : '0'
      const ratio = combo > 0 ? Math.min(1, Math.max(0, comboTimer / COMBO_WINDOW_MS)) : 0
      barEl.style.width = `${ratio * 100}%`
    },
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/ui/screens/hud-combo.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Ajouter la keyframe du pop**

Dans `src/styles/main.css`, ajouter à la fin du fichier :

```css
/* Pop du multiplicateur de combo à chaque palier franchi (relancé par
   `hud-combo.ts`). Coupé par les deux gardes de mouvement réduit ci-dessus,
   qui ramènent toute animation à 0,001 ms. */
@keyframes combo-pop {
  0% {
    transform: scale(1.45);
  }
  100% {
    transform: scale(1);
  }
}

.combo-pop {
  animation: combo-pop 180ms ease-out;
}
```

- [ ] **Step 6: Monter le combo dans le HUD et retirer l'ancien affichage**

Dans `src/ui/screens/hud.ts` :

Ajouter l'import :

```ts
import { createComboView } from './hud-combo'
```

Retirer l'import devenu inutile de `comboMultiplier` (`import { comboMultiplier } from '@/sim/systems/score'`) — Biome `noUnusedImports` échouerait sinon.

Ajouter le champ à `HudState`, après `combo` :

```ts
  /** Temps restant dans la fenêtre de combo, en ms (voir `COMBO_WINDOW_MS`). */
  comboTimer: number
```

Dans le `el.innerHTML`, remplacer le bloc score par une version qui accueille le combo :

```html
    <div class="absolute left-6 top-5" data-score-block>
      <div class="text-[10px] tracking-[0.25em] opacity-40" data-label-score></div>
      <div class="text-2xl opacity-90" data-score>0</div>
    </div>
```

…et **supprimer entièrement** la dernière ligne du balisage, l'ancien combo en bas à droite :

```html
    <div class="absolute bottom-6 right-6 text-sm opacity-0 transition-opacity" data-combo></div>
```

Remplacer la référence `const comboEl = q('[data-combo]')` par le montage de la vue :

```ts
  const scoreBlock = q('[data-score-block]')
  const combo = createComboView()
  scoreBlock.appendChild(combo.element)
```

Dans `update()`, remplacer les trois dernières lignes (`const multiplier = ...`, `comboEl.innerHTML = ...`, `comboEl.style.opacity = ...`) par :

```ts
      combo.update(state.combo, state.comboTimer)
```

- [ ] **Step 7: Passer `comboTimer` depuis la boucle de rendu**

Dans `src/app/game.ts`, dans `onRender`, ajouter le champ à l'appel `hud.update` :

```ts
        comboTimer: run.world.comboTimer,
```

- [ ] **Step 8: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/ui/screens/hud-combo.ts src/ui/screens/hud-combo.test.ts src/ui/screens/hud.ts src/styles/main.css src/app/game.ts
git commit -m "feat(ui): rendre le combo visible avec sa fenêtre et son pop de palier"
```

---

### Task 4: Particules dirigées, éclats étirés, éviction du pool

**Files:**
- Modify: `src/render/particles.ts`
- Create: `src/render/particles.test.ts`
- Modify: `src/app/juice.ts` (les quatre sites d'appel `emitBurst`)

`src/app/juice.test.ts` n'a pas besoin d'être touché : son double de `Particles` est un `vi.fn()`, assignable à la nouvelle signature.

**Interfaces:**
- Consumes: rien.
- Produces:
  - `burstAngle(dir: number, spread: number, r: number): number` — pure, exportée pour test.
  - `BurstOptions { color: number; count: number; dir?: number; spread?: number; speed?: number; sizeScale?: number; streak?: boolean }`.
  - `Particles.emitBurst(x: number, y: number, opts: BurstOptions): void` — **signature changée**, les appelants passent désormais un objet.

- [ ] **Step 1: Écrire le test de l'angle de cône**

Créer `src/render/particles.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { burstAngle } from './particles'

describe('burstAngle', () => {
  it('vise exactement la direction au centre du tirage', () => {
    expect(burstAngle(1.2, Math.PI / 2, 0.5)).toBeCloseTo(1.2, 10)
  })

  it('reste dans le cône dir ± spread/2 aux bornes du tirage', () => {
    const spread = Math.PI / 2
    expect(burstAngle(0, spread, 0)).toBeCloseTo(-spread / 2, 10)
    expect(burstAngle(0, spread, 1)).toBeCloseTo(spread / 2, 10)
  })

  it('couvre le cercle entier quand le cône vaut 2π', () => {
    const full = Math.PI * 2
    expect(burstAngle(0, full, 1) - burstAngle(0, full, 0)).toBeCloseTo(full, 10)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/render/particles.test.ts`
Expected: FAIL — `burstAngle is not a function` / erreur d'import.

- [ ] **Step 3: Réécrire `particles.ts`**

Remplacer intégralement `src/render/particles.ts` :

```ts
import { type Container, Graphics } from 'pixi.js'

interface Particle {
  gfx: Graphics
  vx: number
  vy: number
  life: number
  maxLife: number
}

export interface BurstOptions {
  color: number
  count: number
  /** Direction centrale du cône, en radians. Ignorée si `spread` vaut 2π. */
  dir?: number
  /** Ouverture totale du cône, en radians. Par défaut le cercle entier. */
  spread?: number
  /** Vitesse de référence en px/s ; chaque particule la module de ×0,35 à ×1,65. */
  speed?: number
  sizeScale?: number
  /** Éclats étirés le long de leur vélocité plutôt que ronds. */
  streak?: boolean
}

export interface Particles {
  emitBurst(x: number, y: number, opts: BurstOptions): void
  update(dtMs: number): void
  destroy(): void
}

/**
 * Le pool était à 400 avec un abandon silencieux des nouvelles émissions une
 * fois plein : le retour visuel disparaissait exactement pendant les gros
 * combos, c'est-à-dire au moment où il compte le plus. On évince désormais la
 * plus ancienne particule (spec §5.2).
 */
const POOL_LIMIT = 700
const DEFAULT_SPEED = 115

/** Angle d'une particule dans le cône `dir ± spread/2`, pour un tirage `r` dans [0, 1[. */
export function burstAngle(dir: number, spread: number, r: number): number {
  return dir + (r - 0.5) * spread
}

/** Éclaboussures d'encre. */
export function createParticles(container: Container): Particles {
  const active: Particle[] = []

  return {
    emitBurst(x, y, opts): void {
      const dir = opts.dir ?? 0
      const spread = opts.spread ?? Math.PI * 2
      const baseSpeed = opts.speed ?? DEFAULT_SPEED
      const sizeScale = opts.sizeScale ?? 1

      for (let i = 0; i < opts.count; i++) {
        if (active.length >= POOL_LIMIT) {
          const oldest = active.shift()
          oldest?.gfx.destroy()
        }

        const angle = burstAngle(dir, spread, Math.random())
        const speed = baseSpeed * (0.35 + Math.random() * 1.3)
        const size = (1.4 + Math.random() * 2.4) * sizeScale

        const gfx = new Graphics()
        if (opts.streak) {
          // Rectangle centré puis tourné dans le sens de la vélocité : la forme
          // d'une goutte projetée, pas d'un point qui flotte.
          gfx.rect(-size * 2.6, -size * 0.42, size * 5.2, size * 0.84).fill({ color: opts.color })
          gfx.rotation = angle
        } else {
          gfx.circle(0, 0, size).fill({ color: opts.color })
        }
        gfx.x = x
        gfx.y = y
        container.addChild(gfx)

        const maxLife = 280 + Math.random() * 420
        active.push({
          gfx,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: maxLife,
          maxLife,
        })
      }
    },

    update(dtMs): void {
      const dt = dtMs / 1000
      for (let i = active.length - 1; i >= 0; i--) {
        const p = active[i]
        if (!p) {
          continue
        }
        p.life -= dtMs
        if (p.life <= 0) {
          p.gfx.destroy()
          active.splice(i, 1)
          continue
        }
        p.gfx.x += p.vx * dt
        p.gfx.y += p.vy * dt
        p.vx *= 0.94
        p.vy *= 0.94
        p.gfx.alpha = p.life / p.maxLife
      }
    },

    destroy(): void {
      for (const p of active) {
        p.gfx.destroy()
      }
      active.length = 0
    },
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/render/particles.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Adapter les appelants à la nouvelle signature**

Dans `src/app/juice.ts`, remplacer les quatre appels positionnels par leur forme objet. Ce sont des remplacements mécaniques — la Task 7 ré-écrira celui du kill :

```ts
        fx.particles.emitBurst(event.x, event.y, { color: INK.danger, count: 7 })
```
```ts
          fx.particles.emitBurst(event.x, event.y, { color: INK.blast, count: 12 })
```
```ts
          fx.particles.emitBurst(event.x, event.y, { color: INK.paper, count: 24 })
```
```ts
          fx.particles.emitBurst(event.x, event.y, { color: INK.paper, count: 40 })
```

- [ ] **Step 6: Vérifier types, lint et tests, puis commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — le typecheck est ce qui garantit qu'aucun site d'appel n'a été oublié.

```bash
git add src/render/particles.ts src/render/particles.test.ts src/app/juice.ts
git commit -m "feat(render): projeter les particules en cône et évincer le pool plein"
```

---

### Task 5: Secousse directionnelle en trauma²

**Files:**
- Modify: `src/render/camera.ts`
- Modify: `src/render/camera.test.ts` (existant — cas ajoutés)

**Interfaces:**
- Consumes: rien.
- Produces:
  - `MAX_AMPLITUDE: number` (exporté).
  - `traumaAmplitude(amplitude: number): number` — pure, exportée pour test.
  - `kickFor(amount: number, dirX: number, dirY: number): { x: number; y: number }` — pure, exportée pour test.
  - `Camera.shake(amount: number, dirX?: number, dirY?: number): void` — **paramètres optionnels ajoutés**, les appels existants restent valides.

- [ ] **Step 1: Écrire les tests des deux fonctions pures**

Ajouter à `src/render/camera.test.ts` — remplacer la ligne d'import puis ajouter les deux blocs `describe` à la fin du fichier :

```ts
import { createCamera, kickFor, MAX_AMPLITUDE, traumaAmplitude } from './camera'
```

```ts
describe('traumaAmplitude', () => {
  it('ne déplace rien au repos', () => {
    expect(traumaAmplitude(0)).toBe(0)
  })

  it('laisse le plafond intact', () => {
    expect(traumaAmplitude(MAX_AMPLITUDE)).toBeCloseTo(MAX_AMPLITUDE, 10)
  })

  it('écrase les petites secousses plus que les grosses', () => {
    // Le carré est ce qui rend la retombée nerveuse : à mi-amplitude, on ne
    // ressent qu'un quart du déplacement, pas la moitié.
    expect(traumaAmplitude(MAX_AMPLITUDE / 2)).toBeCloseTo(MAX_AMPLITUDE / 4, 10)
  })

  it('reste monotone croissante', () => {
    expect(traumaAmplitude(10)).toBeGreaterThan(traumaAmplitude(5))
  })
})

describe('kickFor', () => {
  it('ne pousse nulle part sans direction', () => {
    expect(kickFor(20, 0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('pousse dans la direction donnée, proportionnellement à la secousse', () => {
    const kick = kickFor(20, 1, 0)
    expect(kick.x).toBeGreaterThan(0)
    expect(kick.y).toBe(0)
    expect(kickFor(10, 1, 0).x).toBeLessThan(kick.x)
  })

  it('normalise la direction : seule son orientation compte', () => {
    expect(kickFor(20, 3, 0)).toEqual(kickFor(20, 1, 0))
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/render/camera.test.ts`
Expected: FAIL — `traumaAmplitude`/`kickFor`/`MAX_AMPLITUDE` non exportés.

- [ ] **Step 3: Réécrire `camera.ts`**

Remplacer intégralement `src/render/camera.ts` :

```ts
// Fraction de l'amplitude qui subsiste après une seconde pleine. 0.06 (valeur
// initialement envisagée) ne redescend sous 0.5 qu'après ~1.3 s pour une
// secousse de 20 — trop lent pour « décroît vite, sinon la secousse devient
// une nausée » (spec §3.8). 0.01 (1 % restant après 1 s) tient la promesse.
const DECAY_PER_SEC = 0.01
export const MAX_AMPLITUDE = 26
/** Part de l'amplitude convertie en poussée directionnelle initiale. */
const KICK_RATIO = 0.5

export interface Camera {
  /**
   * `dirX`/`dirY` : direction de la poussée initiale (normalisée en interne).
   * Omis, la secousse reste purement aléatoire comme avant.
   */
  shake(amount: number, dirX?: number, dirY?: number): void
  update(dtMs: number): { x: number; y: number }
}

/**
 * Amplitude ressentie = carré de l'amplitude interne, renormalisé sur le
 * plafond. Une secousse à mi-course ne déplace qu'au quart : la retombée est
 * nerveuse au lieu de traîner, à niveau de secousse déclenché égal (spec §5.5).
 */
export function traumaAmplitude(amplitude: number): number {
  return (amplitude / MAX_AMPLITUDE) ** 2 * MAX_AMPLITUDE
}

/** Poussée initiale d'une secousse dirigée. Direction nulle = aucune poussée. */
export function kickFor(amount: number, dirX: number, dirY: number): { x: number; y: number } {
  const length = Math.hypot(dirX, dirY)
  if (length === 0) {
    return { x: 0, y: 0 }
  }
  return { x: (dirX / length) * amount * KICK_RATIO, y: (dirY / length) * amount * KICK_RATIO }
}

/**
 * Secousse d'écran. Purement cosmétique : `src/render/` n'écrit jamais dans
 * la simulation, donc rien ici ne peut influencer le déterminisme du jeu.
 * `Math.random()` est donc autorisé (contrairement à `src/sim/`).
 */
export function createCamera(): Camera {
  let amplitude = 0
  let kickX = 0
  let kickY = 0

  return {
    shake(amount: number, dirX = 0, dirY = 0): void {
      amplitude = Math.min(MAX_AMPLITUDE, amplitude + amount)
      const kick = kickFor(amplitude, dirX, dirY)
      // Remplace au lieu de cumuler : deux kills opposés dans la même frame
      // s'annuleraient sinon, alors que chacun devrait pousser l'image.
      if (kick.x !== 0 || kick.y !== 0) {
        kickX = kick.x
        kickY = kick.y
      }
    },

    update(dtMs: number): { x: number; y: number } {
      if (amplitude <= 0.01 && Math.hypot(kickX, kickY) <= 0.01) {
        amplitude = 0
        kickX = 0
        kickY = 0
        return { x: 0, y: 0 }
      }
      // Décroissance exponentielle : le retour au calme doit être rapide,
      // sinon la secousse devient une nausée.
      const decay = DECAY_PER_SEC ** (dtMs / 1000)
      amplitude *= decay
      const offsetX = kickX
      const offsetY = kickY
      kickX *= decay
      kickY *= decay

      const felt = traumaAmplitude(amplitude)
      const angle = Math.random() * Math.PI * 2
      return { x: Math.cos(angle) * felt + offsetX, y: Math.sin(angle) * felt + offsetY }
    },
  }
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/render/camera.test.ts`
Expected: PASS — 11 tests. Les 4 cas existants passent inchangés : `traumaAmplitude(26) === 26` laisse le plafond intact, et la décroissance reste sous 0,5 après ~1,1 s.

- [ ] **Step 5: Vérifier et commiter**

```bash
npm run lint && npm run typecheck && npm test
git add src/render/camera.ts src/render/camera.test.ts
git commit -m "feat(render): pousser la secousse dans le sens de l'impact"
```

---

### Task 6: Flash plein écran et anneaux d'onde de choc

**Files:**
- Create: `src/render/fx/flash.ts`
- Create: `src/render/fx/shockwave.ts`
- Create: `src/render/fx/shockwave.test.ts`
- Modify: `src/render/stage.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `createFlash(container: Container, width: number, height: number): Flash` avec `flash(color: number, alpha: number, durationMs?: number): void`, `resize(width: number, height: number): void`, `update(dtMs: number): void`, `destroy(): void`.
  - `createShockwaves(container: Container): Shockwaves` avec `emit(x: number, y: number, opts: { color: number; radius: number; durationMs?: number; thickness?: number }): void`, `update(dtMs: number): void`, `destroy(): void`.
  - `ringRadius(progress: number, maxRadius: number): number` — pure, exportée pour test.
  - `Stage` gagne `readonly flash: Flash` et `readonly shockwaves: Shockwaves`.

- [ ] **Step 1: Écrire le test du rayon d'anneau**

Créer `src/render/fx/shockwave.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { ringRadius } from './shockwave'

describe('ringRadius', () => {
  it('part du point d’impact', () => {
    expect(ringRadius(0, 100)).toBeCloseTo(0, 10)
  })

  it('atteint exactement le rayon maximal en fin de vie', () => {
    expect(ringRadius(1, 100)).toBeCloseTo(100, 10)
  })

  it('freine en fin de course : plus de la moitié du chemin à mi-temps', () => {
    expect(ringRadius(0.5, 100)).toBeGreaterThan(50)
  })

  it('reste monotone croissante', () => {
    expect(ringRadius(0.7, 100)).toBeGreaterThan(ringRadius(0.3, 100))
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/render/fx/shockwave.test.ts`
Expected: FAIL — `Failed to resolve import "./shockwave"`.

- [ ] **Step 3: Écrire `shockwave.ts`**

Créer `src/render/fx/shockwave.ts` :

```ts
import { type Container, Graphics } from 'pixi.js'

interface Ring {
  gfx: Graphics
  color: number
  maxRadius: number
  thickness: number
  life: number
  maxLife: number
}

export interface ShockwaveOptions {
  color: number
  radius: number
  durationMs?: number
  thickness?: number
}

export interface Shockwaves {
  emit(x: number, y: number, opts: ShockwaveOptions): void
  update(dtMs: number): void
  destroy(): void
}

const DEFAULT_DURATION_MS = 300
const DEFAULT_THICKNESS = 3
/** Borne dure : un gros combo peut demander plusieurs anneaux par frame. */
const RING_LIMIT = 24

/**
 * Rayon d'un anneau à `progress` (0 → 1). Courbe ease-out cubique : l'onde
 * part vite puis freine, comme une onde de choc réelle qui perd son énergie.
 */
export function ringRadius(progress: number, maxRadius: number): number {
  return maxRadius * (1 - (1 - progress) ** 3)
}

/** Anneaux d'onde de choc. Même couche que les particules, au-dessus des entités. */
export function createShockwaves(container: Container): Shockwaves {
  const rings: Ring[] = []

  return {
    emit(x, y, opts): void {
      if (rings.length >= RING_LIMIT) {
        const oldest = rings.shift()
        oldest?.gfx.destroy()
      }
      const gfx = new Graphics()
      gfx.x = x
      gfx.y = y
      container.addChild(gfx)
      const maxLife = opts.durationMs ?? DEFAULT_DURATION_MS
      rings.push({
        gfx,
        color: opts.color,
        maxRadius: opts.radius,
        thickness: opts.thickness ?? DEFAULT_THICKNESS,
        life: maxLife,
        maxLife,
      })
    },

    update(dtMs): void {
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]
        if (!ring) {
          continue
        }
        ring.life -= dtMs
        if (ring.life <= 0) {
          ring.gfx.destroy()
          rings.splice(i, 1)
          continue
        }
        const progress = 1 - ring.life / ring.maxLife
        const radius = ringRadius(progress, ring.maxRadius)
        // L'anneau s'affine et s'efface en même temps qu'il s'étend : sans les
        // deux, il finit en gros cercle net qui reste plaqué sur l'image.
        ring.gfx.clear()
        ring.gfx.circle(0, 0, radius).stroke({
          color: ring.color,
          width: Math.max(0.5, ring.thickness * (1 - progress)),
          alpha: 1 - progress,
        })
      }
    },

    destroy(): void {
      for (const ring of rings) {
        ring.gfx.destroy()
      }
      rings.length = 0
    },
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/render/fx/shockwave.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Écrire `flash.ts`**

Créer `src/render/fx/flash.ts` :

```ts
import { type Container, Graphics } from 'pixi.js'

export interface Flash {
  /** `alpha` est le pic ; il retombe linéairement à 0 sur `durationMs`. */
  flash(color: number, alpha: number, durationMs?: number): void
  resize(width: number, height: number): void
  update(dtMs: number): void
  destroy(): void
}

const DEFAULT_DURATION_MS = 120

/**
 * Voile plein écran qui flashe et retombe. En `Graphics` plutôt qu'en shader :
 * il continue de fonctionner filtres coupés, et n'ajoute aucun uniforme à la
 * vignette, dont l'intensité est déjà pilotée par la proximité du danger
 * (spec §5.3).
 */
export function createFlash(container: Container, width: number, height: number): Flash {
  const gfx = new Graphics()
  gfx.alpha = 0
  container.addChild(gfx)

  let w = width
  let h = height
  let peak = 0
  let remaining = 0
  let total = DEFAULT_DURATION_MS

  return {
    flash(color, alpha, durationMs = DEFAULT_DURATION_MS): void {
      gfx.clear()
      gfx.rect(0, 0, w, h).fill({ color })
      // Le pic ne descend jamais en cours de retombée : un second flash plus
      // faible pendant qu'un fort s'efface ne doit pas assombrir l'image.
      peak = Math.max(gfx.alpha, alpha)
      total = durationMs
      remaining = durationMs
      gfx.alpha = peak
    },

    resize(width, height): void {
      w = width
      h = height
    },

    update(dtMs): void {
      if (remaining <= 0) {
        return
      }
      remaining -= dtMs
      gfx.alpha = remaining <= 0 ? 0 : peak * (remaining / total)
    },

    destroy(): void {
      gfx.destroy()
    },
  }
}
```

- [ ] **Step 6: Monter les deux modules dans la scène**

Dans `src/render/stage.ts` :

Ajouter les imports (après `import { createParticles, type Particles } from './particles'`) :

```ts
import { createFlash, type Flash } from './fx/flash'
import { createShockwaves, type Shockwaves } from './fx/shockwave'
```

Ajouter à l'interface `Stage`, après la ligne `readonly particles: Particles` :

```ts
  /** Voile plein écran — piloté depuis `src/app/juice.ts`. */
  readonly flash: Flash
  /** Anneaux d'onde de choc — pilotés depuis `src/app/juice.ts`. */
  readonly shockwaves: Shockwaves
```

Après `const particles = createParticles(particlesLayer)`, ajouter :

```ts
  const shockwaves = createShockwaves(particlesLayer)
  // Au-dessus des particules et des anneaux : le voile couvre toute l'image.
  const flashLayer = new Container()
  app.stage.addChild(flashLayer)
  const flash = createFlash(flashLayer, window.innerWidth, window.innerHeight)
```

Dans l'objet retourné, après `particles,` (à côté de `camera,`) :

```ts
    flash,
    shockwaves,
```

Dans `sync()`, après `particles.update(frameDtMs)` :

```ts
      shockwaves.update(frameDtMs)
      flash.update(frameDtMs)
```

Dans `resize()` :

```ts
    resize(width: number, height: number): void {
      app.renderer.resize(width, height)
      flash.resize(width, height)
    },
```

Dans `destroy()`, avant `app.destroy(...)` :

```ts
      shockwaves.destroy()
      flash.destroy()
```

- [ ] **Step 7: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/render/fx/flash.ts src/render/fx/shockwave.ts src/render/fx/shockwave.test.ts src/render/stage.ts
git commit -m "feat(render): ajouter le voile plein écran et les anneaux d'onde de choc"
```

---

### Task 7: L'intensité de combo pilote le ressenti

**Files:**
- Modify: `src/app/juice.ts`
- Modify: `src/app/juice.test.ts`
- Modify: `src/ui/screens/hud.ts`
- Modify: `src/styles/main.css`
- Modify: `src/app/game.ts`

**Interfaces:**
- Consumes: `Particles.emitBurst` avec `BurstOptions` (Task 4), `Camera.shake(amount, dirX?, dirY?)` (Task 5), `Flash`/`Shockwaves` (Task 6), `comboMultiplier` (Task 1).
- Produces:
  - `comboIntensity(multiplier: number): number` — pure, exportée pour test.
  - `applyJuice(world, state, fx)` où `fx` est désormais `{ camera: Camera; particles: Particles; flash: Flash; shockwaves: Shockwaves; punch(strength: number): void; motionEnabled: boolean }`.
  - `Hud.punch(strength: number): void`.

- [ ] **Step 1: Écrire les tests de l'intensité et de son effet**

Dans `src/app/juice.test.ts`, remplacer l'import et le double `fakeFx` :

```ts
import { describe, expect, it, vi } from 'vitest'

import type { Camera } from '@/render/camera'
import type { Flash } from '@/render/fx/flash'
import type { Shockwaves } from '@/render/fx/shockwave'
import type { Particles } from '@/render/particles'
import { createWorld } from '@/sim/world'
import {
  applyJuice,
  COMBO_FLASH_MIN_MULTIPLIER,
  comboIntensity,
  createJuiceState,
  DEATH_SLOWMO_MS,
  HITSTOP_MS,
} from './juice'

function fakeFx(motionEnabled: boolean): {
  camera: Camera
  particles: Particles
  flash: Flash
  shockwaves: Shockwaves
  punch: (strength: number) => void
  motionEnabled: boolean
} {
  const camera: Camera = { shake: vi.fn(), update: vi.fn(() => ({ x: 0, y: 0 })) }
  const particles: Particles = { emitBurst: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const flash: Flash = { flash: vi.fn(), resize: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  const shockwaves: Shockwaves = { emit: vi.fn(), update: vi.fn(), destroy: vi.fn() }
  return { camera, particles, flash, shockwaves, punch: vi.fn(), motionEnabled }
}
```

Puis ajouter ces deux blocs `describe` à la fin du fichier :

```ts
describe('comboIntensity', () => {
  it('vaut 0 au multiplicateur ×1', () => {
    expect(comboIntensity(1)).toBe(0)
  })

  it('vaut 1 au multiplicateur maximal ×10', () => {
    expect(comboIntensity(10)).toBe(1)
  })

  it('croît avec le multiplicateur', () => {
    expect(comboIntensity(5)).toBeGreaterThan(comboIntensity(2))
  })

  it('borne les valeurs hors plage', () => {
    expect(comboIntensity(0)).toBe(0)
    expect(comboIntensity(50)).toBe(1)
  })
})

describe('applyJuice — le combo module le ressenti', () => {
  const killWith = (combo: number) => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    world.combo = combo
    const state = createJuiceState()
    const fx = fakeFx(true)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })
    applyJuice(world, state, fx)
    return fx
  }

  it('émet plus de particules à haut combo qu’à bas combo', () => {
    // `world.combo` est déjà à jour quand `applyJuice` tourne : `scoreSystem`
    // passe en dernier dans `stepWorld`, avant l'appel depuis `game.ts`.
    const low = killWith(0)
    const high = killWith(40)
    const countOf = (fx: ReturnType<typeof fakeFx>): number => {
      const call = vi.mocked(fx.particles.emitBurst).mock.calls[0]
      if (!call) {
        throw new Error('aucune émission de particules')
      }
      return call[2].count
    }
    expect(countOf(high)).toBeGreaterThan(countOf(low))
  })

  it('ne déclenche flash ni anneau sous le seuil de combo', () => {
    const fx = killWith(0)
    expect(fx.flash.flash).not.toHaveBeenCalled()
    expect(fx.shockwaves.emit).not.toHaveBeenCalled()
  })

  it('déclenche flash et anneau à partir du seuil de combo', () => {
    // 4 kills par palier : combo 8 → multiplicateur ×3.
    const fx = killWith(4 * (COMBO_FLASH_MIN_MULTIPLIER - 1))
    expect(fx.flash.flash).toHaveBeenCalled()
    expect(fx.shockwaves.emit).toHaveBeenCalled()
  })

  it('secoue le HUD sur un kill, sauf en mouvement réduit', () => {
    expect(killWith(0).punch).toHaveBeenCalled()

    const world = createWorld({ seed: 1, width: 800, height: 600 })
    const fx = fakeFx(false)
    world.events.push({ type: 'enemyKilled', eid: 1, x: 10, y: 20 })
    applyJuice(world, createJuiceState(), fx)
    expect(fx.punch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run src/app/juice.test.ts`
Expected: FAIL — `comboIntensity`/`COMBO_FLASH_MIN_MULTIPLIER` non exportés.

- [ ] **Step 3: Câbler l'intensité dans `juice.ts`**

Dans `src/app/juice.ts`, remplacer les imports du haut :

```ts
import type { Camera } from '@/render/camera'
import type { Flash } from '@/render/fx/flash'
import type { Shockwaves } from '@/render/fx/shockwave'
import { INK } from '@/render/ink'
import type { Particles } from '@/render/particles'
import { Position } from '@/sim/components'
import { comboMultiplier } from '@/sim/systems/score'
import type { SimWorld } from '@/sim/world'
```

Ajouter après la constante `HITSTOP_CADENCE_MS` :

```ts
/** Miroir de `COMBO_MAX_MULTIPLIER` (src/sim/systems/score.ts). */
const COMBO_MAX_MULTIPLIER = 10
/**
 * Seuil à partir duquel un kill mérite un flash et un anneau. En dessous, le
 * joueur tue en continu : ces effets deviendraient un bruit permanent au lieu
 * d'une récompense (spec §5.1).
 */
export const COMBO_FLASH_MIN_MULTIPLIER = 3
const KILL_PARTICLES_MIN = 10
const KILL_PARTICLES_MAX = 22
/** Ouverture du cône d'éclats projetés à l'opposé du joueur. */
const KILL_CONE = Math.PI * 0.8

/** Position du combo sur 0 → 1 : le seul chiffre qui module tous les effets de kill. */
export function comboIntensity(multiplier: number): number {
  return Math.min(1, Math.max(0, (multiplier - 1) / (COMBO_MAX_MULTIPLIER - 1)))
}

/**
 * Direction joueur → point d'impact, normalisée. `{0, 0}` si le joueur n'existe
 * pas (mort, entre deux runs) : l'appelant retombe alors sur une émission en
 * cercle complet.
 */
function killDirection(world: SimWorld, x: number, y: number): { x: number; y: number } {
  const p = world.playerEid
  if (p < 0) {
    return { x: 0, y: 0 }
  }
  const px = Position.x[p]
  const py = Position.y[p]
  if (px === undefined || py === undefined) {
    return { x: 0, y: 0 }
  }
  const dx = x - px
  const dy = y - py
  const length = Math.hypot(dx, dy)
  return length === 0 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length }
}
```

Remplacer la signature de `applyJuice` et le corps de la boucle. Le commentaire de doc existant reste, avec ce paragraphe ajouté à la fin :

```ts
/**
 * … (doc existante conservée)
 *
 * L'intensité de combo (`comboIntensity`) module tout ce que ce module
 * déclenche sur un kill : nombre d'éclats, force de la secousse, présence du
 * flash et de l'anneau. `world.combo` est déjà à jour ici — `scoreSystem`
 * passe en dernier dans `stepWorld`, avant que `game.ts` n'appelle `applyJuice`.
 */
export function applyJuice(
  world: SimWorld,
  state: JuiceState,
  fx: {
    camera: Camera
    particles: Particles
    flash: Flash
    shockwaves: Shockwaves
    /** Tremblement du HUD, `strength` dans [0, 1]. */
    punch(strength: number): void
    motionEnabled: boolean
  },
): void {
  let kills = 0
  const multiplier = comboMultiplier(world.combo)
  const intensity = comboIntensity(multiplier)

  for (const event of world.events) {
    switch (event.type) {
      case 'enemyKilled': {
        kills++
        if (fx.motionEnabled) {
          const dir = killDirection(world, event.x, event.y)
          const directed = dir.x !== 0 || dir.y !== 0
          fx.particles.emitBurst(event.x, event.y, {
            color: INK.danger,
            count: Math.round(
              KILL_PARTICLES_MIN + (KILL_PARTICLES_MAX - KILL_PARTICLES_MIN) * intensity,
            ),
            dir: directed ? Math.atan2(dir.y, dir.x) : 0,
            spread: directed ? KILL_CONE : Math.PI * 2,
            speed: 130 + 90 * intensity,
            sizeScale: 1 + 0.5 * intensity,
            streak: true,
          })
          if (multiplier >= COMBO_FLASH_MIN_MULTIPLIER) {
            fx.flash.flash(INK.paper, 0.05 * intensity)
            fx.shockwaves.emit(event.x, event.y, {
              color: INK.danger,
              radius: 70 + 60 * intensity,
            })
          }
        }
        break
      }
      case 'powerupUsed':
        if (fx.motionEnabled) {
          fx.camera.shake(6)
          fx.particles.emitBurst(event.x, event.y, { color: INK.blast, count: 12 })
          fx.flash.flash(INK.blast, 0.06)
          fx.shockwaves.emit(event.x, event.y, { color: INK.blast, radius: 160 })
        }
        break
      case 'haloBroken':
        if (fx.motionEnabled) {
          fx.camera.shake(14)
          fx.particles.emitBurst(event.x, event.y, { color: INK.paper, count: 24 })
          fx.flash.flash(INK.paper, 0.12)
          fx.shockwaves.emit(event.x, event.y, { color: INK.paper, radius: 200, thickness: 5 })
        }
        break
      case 'playerDied':
        // Hors du garde `motionEnabled` : le ralenti de mort RALENTIT le
        // mouvement, il ne le crée pas. Le mode « mouvement réduit » cible
        // le confort vestibulaire (secousse, particules qui bougent à
        // l'écran) — un ralenti n'en déclenche pas, et le couper coûterait
        // du ressenti sans bénéfice pour qui que ce soit.
        state.deathSlowmoRemaining = DEATH_SLOWMO_MS
        if (fx.motionEnabled) {
          fx.camera.shake(24)
          fx.particles.emitBurst(event.x, event.y, { color: INK.paper, count: 40 })
          fx.flash.flash(INK.paper, 0.22, 260)
          fx.shockwaves.emit(event.x, event.y, {
            color: INK.paper,
            radius: 320,
            durationMs: 500,
            thickness: 6,
          })
        }
        break
      default:
        break
    }
  }
```

Puis remplacer le bloc `if (kills > 0)` final — **le commentaire existant sur le hitstop et sa cadence est conservé mot pour mot**, seules les deux dernières lignes changent :

```ts
  if (kills > 0) {
    // … (commentaire existant sur le hitstop et `HITSTOP_CADENCE_MS`, inchangé)
    if (state.hitstopCooldownRemaining <= 0) {
      state.hitstopRemaining = HITSTOP_MS
      state.hitstopCooldownRemaining = HITSTOP_CADENCE_MS
    }
    if (fx.motionEnabled) {
      // L'intensité de combo double la secousse au multiplicateur maximal.
      fx.camera.shake(Math.min(18, 2 + kills * 1.5) * (1 + intensity))
      fx.punch(0.4 + 0.6 * intensity)
    }
  }
}
```

- [ ] **Step 4: Ajouter `punch` au HUD**

Dans `src/ui/screens/hud.ts`, ajouter à l'interface `Hud`, après `update` :

```ts
  /** Tremblement du bloc score/combo à l'impact. `strength` dans [0, 1]. */
  punch(strength: number): void
```

Et dans l'objet retourné, après `update()` :

```ts
    punch(strength: number): void {
      // Retrait/lecture forcée/ajout : une animation CSS déjà posée ne se
      // relance pas seule. La variable pilote l'amplitude depuis le CSS.
      scoreBlock.style.setProperty('--punch', `${strength}`)
      scoreBlock.classList.remove('hud-punch')
      void scoreBlock.offsetWidth
      scoreBlock.classList.add('hud-punch')
    },
```

- [ ] **Step 5: Ajouter la keyframe du tremblement**

Dans `src/styles/main.css`, ajouter à la fin :

```css
/* Tremblement du bloc score/combo à l'impact (relancé par `hud.punch`).
   `--punch` (0 → 1) module l'amplitude : un kill à haut combo secoue plus.
   Coupé par les deux gardes de mouvement réduit ci-dessus. */
@keyframes hud-punch {
  0% {
    transform: translate(calc(var(--punch, 1) * 3px), calc(var(--punch, 1) * -2px));
  }
  100% {
    transform: translate(0, 0);
  }
}

.hud-punch {
  animation: hud-punch 140ms ease-out;
}
```

- [ ] **Step 6: Brancher les nouveaux effets depuis `game.ts`**

Dans `src/app/game.ts`, dans `onStep`, remplacer l'appel `applyJuice` :

```ts
        applyJuice(run.world, juice, {
          camera: stage.camera,
          particles: stage.particles,
          flash: stage.flash,
          shockwaves: stage.shockwaves,
          punch: (strength: number): void => hud.punch(strength),
          motionEnabled: !reducedMotion,
        })
```

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS — dont les 3 tests existants de `juice.test.ts` (portée du mouvement réduit) et les 8 nouveaux.

- [ ] **Step 8: Commiter**

```bash
git add src/app/juice.ts src/app/juice.test.ts src/ui/screens/hud.ts src/styles/main.css src/app/game.ts
git commit -m "feat(app): faire monter le ressenti du kill avec le combo"
```

---

### Task 8: Baisser la distorsion permanente

**Files:**
- Modify: `src/render/filters/boil.ts`
- Modify: `src/render/filters/grain.ts`
- Modify: `src/render/stage.ts`

**Interfaces:**
- Consumes: rien.
- Produces: rien de nouveau — seules des valeurs changent.

- [ ] **Step 1: Baisser l'amplitude du boil**

Dans `src/render/filters/boil.ts`, remplacer la valeur de `uAmount` :

```ts
        // 0,0022 concurrençait les effets d'impact (éclats, anneaux, flash) :
        // l'image de fond ne doit plus bouger autant qu'un kill (spec §6). Le
        // frémissement reste perceptible — c'est l'identité visuelle du jeu.
        uAmount: { value: 0.0013, type: 'f32' },
```

- [ ] **Step 2: Baisser le grain**

Dans `src/render/filters/grain.ts`, remplacer la valeur de `uAmount` :

```ts
        // Même raison que le boil (spec §6) : un fond plus calme laisse les
        // effets ponctuels ressortir.
        uAmount: { value: 0.032, type: 'f32' },
```

- [ ] **Step 3: Plafonner la vignette de danger**

Dans `src/render/stage.ts`, ajouter la constante après les `defineQuery` du haut :

```ts
/**
 * Plafond de la teinte de danger. À 1,0 la vignette noyait l'arène en rouge
 * dès qu'un ennemi frôlait le joueur, exactement quand il a le plus besoin de
 * lire l'écran (spec §6).
 */
const DANGER_VIGNETTE_MAX = 0.75
```

Puis remplacer `setDangerProximity` :

```ts
  function setDangerProximity(v: number): void {
    vignette.setIntensity(Math.min(DANGER_VIGNETTE_MAX, Math.max(0, v)))
  }
```

Et mettre à jour le commentaire de l'interface `Stage` :

```ts
  /** 0 = pas de danger, 1 = danger maximal (teinte plafonnée à `DANGER_VIGNETTE_MAX`). */
  setDangerProximity(v: number): void
```

- [ ] **Step 4: Vérifier et commiter**

Run: `npm run lint && npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/render/filters/boil.ts src/render/filters/grain.ts src/render/stage.ts
git commit -m "feat(render): calmer boil, grain et vignette pour laisser place aux impacts"
```

---

## Vérification manuelle finale

Après la Task 8, lancer `npm run dev` et vérifier dans le navigateur (spec §9) :

1. Le timer monte en haut-centre et **gèle visiblement** pendant un hitstop.
2. Tuer 4 ennemis dans la fenêtre fait passer le multiplicateur à ×2 avec un pop ; la barre se recharge à chaque kill et se vide en 2,5 s.
3. À partir de ×3, un kill produit flash, anneau, éclats dirigés à l'opposé du joueur et une secousse nettement plus forte qu'à ×1.
4. Le score de fin de run est dominé par les kills, pas par la durée.
5. Mouvement réduit activé dans les Réglages : secousse, particules, anneaux, flash et tremblement du HUD disparaissent ; timer, score et combo restent lisibles.
