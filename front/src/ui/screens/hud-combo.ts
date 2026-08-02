import { COMBO_MAX_MULTIPLIER, COMBO_WINDOW_MS, comboMultiplier } from '@sim/systems/score'

import { t } from '@/i18n'
import { INK } from '@/render/ink'
import { renderNumber } from '../numeral'

/** Composantes 0-255 d'une couleur 0xRRGGBB de la palette. */
function components(color: number): readonly [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff]
}

/** Bornes de la teinte, dérivées de la palette : toute divergence est un bug. */
const TINT_FROM = components(INK.paper)
const TINT_TO = components(INK.blast)

/** Couleur du multiplicateur : papier à ×1, jaune blast à ×10 — dit où en est la série sans lire le chiffre. Pure et exportée : seule partie de ce module testable sans DOM. */
export function comboTint(multiplier: number): string {
  const t = Math.min(1, Math.max(0, (multiplier - 1) / (COMBO_MAX_MULTIPLIER - 1)))
  const mix = (from: number, to: number): number => Math.round(from + (to - from) * t)
  return `rgb(${mix(TINT_FROM[0], TINT_TO[0])} ${mix(TINT_FROM[1], TINT_TO[1])} ${mix(TINT_FROM[2], TINT_TO[2])})`
}

export interface ComboView {
  readonly element: HTMLElement
  update(combo: number, comboTimer: number): void
}

/** Seul bloc du HUD à porter un état d'animation : compare la frame courante à la précédente (palier franchi, chute), là où le reste n'est qu'un rendu direct de `HudState`. */
/** Nombre de copies fantômes tirées derrière le chiffre à chaque palier. */
const ECHO_COUNT = 3

export function createComboView(): ComboView {
  const el = document.createElement('div')
  el.className = 'transition-opacity duration-200'
  el.style.opacity = '0'
  el.innerHTML = `
    <div class="text-[10px] tracking-[0.25em] opacity-40" data-combo-label></div>
    <div class="relative">
      ${Array.from(
        { length: ECHO_COUNT },
        (_, i) =>
          `<div class="absolute inset-x-0 top-0 text-4xl leading-none opacity-0" data-combo-echo style="--echo:${i}"></div>`,
      ).join('')}
      <div class="relative text-4xl leading-none" data-combo-value></div>
    </div>
    <div class="mx-auto mt-2 h-[3px] w-20 rounded bg-paper/15">
      <div class="h-full rounded bg-paper/70" data-combo-bar style="width:0%"></div>
    </div>
  `

  const labelEl = el.querySelector<HTMLElement>('[data-combo-label]')
  const valueEl = el.querySelector<HTMLElement>('[data-combo-value]')
  const barEl = el.querySelector<HTMLElement>('[data-combo-bar]')
  const echoEls = [...el.querySelectorAll<HTMLElement>('[data-combo-echo]')]
  if (!labelEl || !valueEl || !barEl || echoEls.length !== ECHO_COUNT) {
    throw new Error('hud-combo : balisage incomplet')
  }

  let lastMultiplier = 0

  return {
    element: el,

    update(combo: number, comboTimer: number): void {
      // Réécrit à chaque frame, comme les libellés du HUD : suit un changement
      // de langue sans rechargement, là où le chiffre ne bouge qu'au palier.
      labelEl.textContent = t('hud.combo')

      const multiplier = combo > 0 ? comboMultiplier(combo) : 0

      if (multiplier !== lastMultiplier) {
        if (multiplier > 0) {
          const label = renderNumber(`×${multiplier}`)
          const tint = comboTint(multiplier)
          labelEl.style.color = tint
          valueEl.innerHTML = label
          valueEl.style.color = tint
          for (const echo of echoEls) {
            echo.innerHTML = label
            echo.style.color = tint
          }
        }
        if (multiplier > lastMultiplier) {
          // Retrait/lecture forcée/ajout : une animation CSS déjà posée ne se
          // relance pas seule ; `offsetWidth` force le recalcul entre les deux.
          valueEl.classList.remove('combo-pop')
          for (const echo of echoEls) {
            echo.classList.remove('combo-echo')
          }
          void valueEl.offsetWidth
          valueEl.classList.add('combo-pop')
          for (const echo of echoEls) {
            echo.classList.add('combo-echo')
          }
        }
        lastMultiplier = multiplier
      }

      el.style.opacity = combo > 0 ? '1' : '0'
      const ratio = combo > 0 ? Math.min(1, Math.max(0, comboTimer / COMBO_WINDOW_MS)) : 0
      barEl.style.width = `${ratio * 100}%`
    },
  }
}
