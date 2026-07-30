import { INK } from '@/render/ink'
import { COMBO_MAX_MULTIPLIER, COMBO_WINDOW_MS, comboMultiplier } from '@/sim/systems/score'
import { renderNumber } from '../numeral'

/** Composantes 0-255 d'une couleur 0xRRGGBB de la palette. */
function components(color: number): readonly [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]
}

/** Bornes de la teinte, dérivées de la palette : toute divergence est un bug. */
const TINT_FROM = components(INK.paper)
const TINT_TO = components(INK.blast)

/**
 * Couleur du multiplicateur : papier à ×1, jaune blast à ×10. La progression
 * de la couleur dit à elle seule où en est la série, sans avoir à lire le
 * chiffre (spec §4.2). Pure et exportée : c'est la seule partie testable de ce
 * module — le reste manipule le DOM, absent de l'environnement Vitest.
 */
export function comboTint(multiplier: number): string {
  const t = Math.min(1, Math.max(0, (multiplier - 1) / (COMBO_MAX_MULTIPLIER - 1)))
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
