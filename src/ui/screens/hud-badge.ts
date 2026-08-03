import type { AchievementDef } from '@/app/achievements/catalog'
import { t } from '@/i18n'
import { nibPath } from '@/render/views/nibs'

/** Durée d'affichage d'un succès, en ms d'horloge réelle. */
export const BADGE_MS = 2500

export interface BadgeQueue {
  /** Le succès à montrer maintenant, `null` quand rien n'est affiché. */
  readonly current: AchievementDef | null
  /** Met un succès en file. Deux succès du même pas défilent l'un après l'autre. */
  push(def: AchievementDef): void
  /** `dtMs` en temps réel : le bandeau ne doit pas geler avec un hitstop. */
  update(dtMs: number): void
  clear(): void
}

/**
 * La logique du bandeau, sans DOM — d'où testable sous `environment: 'node'`
 * (`vitest.config.ts`, jsdom absent des dépendances). `createBadgeView`
 * l'enrobe pour refléter `current` dans l'élément ; c'est cette file qui
 * décide quoi montrer et pendant combien de temps.
 */
export function createBadgeQueue(): BadgeQueue {
  const queue: AchievementDef[] = []
  let current: AchievementDef | null = null
  let remaining = 0

  return {
    get current(): AchievementDef | null {
      return current
    },

    push(def: AchievementDef): void {
      queue.push(def)
    },

    update(dtMs: number): void {
      if (current) {
        remaining -= dtMs
        if (remaining > 0) {
          return
        }
      }
      const next = queue.shift() ?? null
      current = next
      remaining = next ? BADGE_MS : 0
    },

    clear(): void {
      queue.length = 0
      current = null
      remaining = 0
    },
  }
}

export interface BadgeView {
  readonly element: HTMLElement
  /** Met un succès en file. Deux succès du même pas défilent l'un après l'autre. */
  push(def: AchievementDef): void
  /** `dtMs` en temps réel : le bandeau ne doit pas geler avec un hitstop. */
  update(dtMs: number): void
  clear(): void
}

/**
 * Le bandeau des succès, en haut de l'arène. Il suit les règles du HUD :
 * `pointer-events-none`, opacité contenue, et une transition que
 * `.reduced-motion` coupe (`main.css`). Dans un jeu où une demi-seconde
 * d'attention coûte la partie, un bandeau qui bouge trop est un piège.
 */
export function createBadgeView(): BadgeView {
  const element = document.createElement('div')
  element.className =
    'pointer-events-none absolute left-1/2 top-4 hidden -translate-x-1/2 items-center gap-[0.6em] rounded border border-paper/25 bg-ink-deep/70 px-[1em] py-[0.35em] text-paper opacity-90 transition-opacity'

  const queue = createBadgeQueue()
  // `null` tant que rien n'a jamais été affiché : évite un aller-retour au
  // DOM à chaque frame quand le bandeau est simplement vide en continu.
  let shown: AchievementDef | null = null

  const render = (def: AchievementDef): void => {
    // `1em` sur le SVG, la taille posée sur le `<span>` : sans ancêtre en
    // `text-[calc(var(--ui)*…)]`, `em` se résout contre la taille de police
    // par défaut du navigateur et le pictogramme ne suit plus la rampe
    // `--ui` (même schéma que `card.ts` et `achievement-card.ts`).
    const glyph = def.skin
      ? `<span class="text-[calc(var(--ui)*1.4)]"><svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg></span>`
      : `<span class="text-[calc(var(--ui)*1.4)]"><svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true"><circle cx="0" cy="0" r="7" fill="currentColor" /></svg></span>`
    element.innerHTML = `${glyph}<span class="ui-xs tracking-[0.15em]">${t(`achievement.${def.id}.name`)}</span>`
    element.classList.remove('hidden')
    element.classList.add('flex')
  }

  return {
    element,

    push(def: AchievementDef): void {
      queue.push(def)
    },

    update(dtMs: number): void {
      queue.update(dtMs)
      if (queue.current === shown) {
        return
      }
      shown = queue.current
      if (shown) {
        render(shown)
      } else {
        element.classList.add('hidden')
        element.classList.remove('flex')
        element.innerHTML = ''
      }
    },

    clear(): void {
      queue.clear()
      shown = null
      element.classList.add('hidden')
      element.classList.remove('flex')
      element.innerHTML = ''
    },
  }
}
