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
  // Tout en tailles Tailwind fixes (`text-sm`, `px-3 py-1 gap-2`), comme
  // `hud.ts` et `hud-combo.ts` et pour la même raison : le HUD est déjà mis à
  // l'échelle par le `transform` de `hud.setViewport`, et la rampe `--ui`
  // (`main.css`) suit elle aussi la hauteur de fenêtre — un `ui-xs` ici serait
  // agrandi deux fois et le bandeau dériverait par rapport aux chiffres du HUD
  // d'une résolution à l'autre. Les `em` nus sont exclus pour la raison
  // symétrique : sans taille de police propre au conteneur, ils se résolvaient
  // contre les 16px du navigateur pendant que le texte, lui, suivait la rampe.
  //
  // `top-40` (160px) et non `top-4` : le bloc centré vague/temps (`hud.ts`,
  // `top-5` + libellé 10px + valeur `text-2xl`, ≈67px de bas) et le bloc
  // combo sous lui (`hud-combo.ts`, `top-20` + libellé + valeur `text-4xl` +
  // barre, ≈142px de bas au repos, un peu plus le temps d'un `combo-pop` qui
  // grossit la valeur à ×1.45) sont tous deux centrés à la même abscisse.
  // La marge se lit sur le BORD HAUT du bandeau : sa hauteur propre (≈30px
  // désormais : glyphe `text-xl` + `py-1` + bordure) ne rentre pas dans le
  // calcul, seul ce qui le surplombe compte. `top-4` superposait le bandeau au
  // bloc temps ; `top-40` passe sous le combo avec une marge qui absorbe le
  // `combo-pop`.
  element.className =
    'pointer-events-none absolute left-1/2 top-40 hidden -translate-x-1/2 items-center gap-2 rounded border border-paper/25 bg-ink-deep/70 px-3 py-1 text-sm text-paper opacity-90 transition-opacity'

  const queue = createBadgeQueue()
  // `null` tant que rien n'a jamais été affiché : évite un aller-retour au
  // DOM à chaque frame quand le bandeau est simplement vide en continu.
  let shown: AchievementDef | null = null

  const render = (def: AchievementDef): void => {
    // `1em` sur le SVG, la taille posée sur le `<span>` qui le porte : c'est ce
    // `text-xl` (20px) qui donne au pictogramme sa taille, et non la police
    // héritée. Contrairement aux vitrines (`card.ts`, `achievement-card.ts`),
    // le span porte une taille FIXE — voir le commentaire de `className`.
    const mark = def.skin
      ? `<path d="${nibPath(def.skin)}" fill="currentColor" />`
      : `<circle cx="0" cy="0" r="7" fill="currentColor" />`
    const glyph = `<span class="text-xl"><svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true">${mark}</svg></span>`
    element.innerHTML = `${glyph}<span class="tracking-[0.15em]">${t(`achievement.${def.id}.name`)}</span>`
    // L'apparition en fondu promise par la spec §9.4. `hidden`↔`flex` change
    // `display`, qui ne se transitionne pas : il faut donc poser `opacity: 0`
    // dans le même geste, forcer le recalcul de style (`offsetWidth`, même
    // idiome que le redémarrage d'animation de `hud.ts`), puis rendre la main
    // à `opacity-90` — la transition part alors de zéro au lieu d'être
    // court-circuitée. Sous `.reduced-motion` (`main.css`), la durée tombe à
    // 0,001 ms : le bandeau apparaît sec, jamais invisible.
    element.style.opacity = '0'
    element.classList.remove('hidden')
    element.classList.add('flex')
    void element.offsetWidth
    element.style.opacity = ''
  }

  // Partagé par `update()` (file épuisée) et `clear()` (partie suivante) :
  // même séquence de retrait, un seul endroit à faire évoluer.
  const hide = (): void => {
    element.classList.add('hidden')
    element.classList.remove('flex')
    element.innerHTML = ''
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
        hide()
      }
    },

    clear(): void {
      queue.clear()
      shown = null
      hide()
    },
  }
}
