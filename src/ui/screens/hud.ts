import { t } from '@/i18n'
import { WAVE_DURATION_MS } from '@/sim/data/difficulty'
import { comboMultiplier } from '@/sim/systems/score'
import { formatScore } from '../format'
import { renderNumber } from '../numeral'

export interface HudState {
  score: number
  wave: number
  combo: number
  /** Temps écoulé dans la vague en cours, en ms (spec : vague de 40 s). */
  waveElapsed: number
}

export interface Hud {
  update(state: HudState): void
  destroy(): void
}

/**
 * HUD flottant dans l'image : libellés en petites capitales espacées AU-DESSUS
 * des chiffres, opacité basse et `pointer-events-none` pour ne jamais
 * concurrencer la lecture du danger (spec §4.1).
 *
 * Les chiffres passent par `renderNumber` (`../numeral.ts`), pas par un
 * simple `textContent` : la police d'interface (Kalam) dessine tous ses
 * chiffres correctement, mais n'a aucune fonctionnalité OpenType tabulaire,
 * donc `tabular-nums` n'y ferait rien — sans largeur imposée par chiffre, le
 * score et la vague tressauteraient horizontalement en défilant. Les
 * libellés (texte pur, jamais de chiffre) passent tels quels.
 */
export function createHud(root: HTMLElement): Hud {
  const el = document.createElement('div')
  el.className = 'pointer-events-none absolute inset-0 select-none text-paper'
  el.innerHTML = `
    <div class="absolute left-6 top-5">
      <div class="text-[10px] tracking-[0.25em] opacity-40" data-label-score></div>
      <div class="text-2xl opacity-90" data-score>0</div>
    </div>
    <div class="absolute right-6 top-5 text-right">
      <div class="text-[10px] tracking-[0.25em] opacity-40" data-label-wave></div>
      <div class="text-2xl opacity-90" data-wave>1</div>
    </div>
    <div class="absolute bottom-7 left-1/2 h-[3px] w-32 -translate-x-1/2 rounded bg-paper/15">
      <div class="h-full rounded bg-paper/55 transition-[width] duration-100" data-progress style="width:0%"></div>
    </div>
    <div class="absolute bottom-6 right-6 text-sm opacity-0 transition-opacity" data-combo></div>
  `
  root.appendChild(el)

  const q = <T extends HTMLElement>(sel: string): T => {
    const found = el.querySelector<T>(sel)
    if (!found) {
      throw new Error(`Élément HUD manquant : ${sel}`)
    }
    return found
  }

  const labelScore = q('[data-label-score]')
  const labelWave = q('[data-label-wave]')
  const scoreEl = q('[data-score]')
  const waveEl = q('[data-wave]')
  const progressEl = q('[data-progress]')
  const comboEl = q('[data-combo]')

  return {
    update(state: HudState): void {
      // Réécrits à chaque frame : si la langue change (Réglages), le HUD suit
      // sans rechargement, comme le reste de l'interface (spec §5).
      labelScore.textContent = t('hud.score')
      labelWave.textContent = t('hud.wave')
      scoreEl.innerHTML = renderNumber(formatScore(state.score))
      waveEl.innerHTML = renderNumber(String(state.wave))

      const progress = Math.min(1, Math.max(0, state.waveElapsed / WAVE_DURATION_MS))
      progressEl.style.width = `${progress * 100}%`

      const multiplier = comboMultiplier(state.combo)
      comboEl.innerHTML = renderNumber(t('hud.combo', { n: multiplier }))
      comboEl.style.opacity = state.combo > 0 ? '0.75' : '0'
    },

    destroy(): void {
      el.remove()
    },
  }
}
