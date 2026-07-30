import { t } from '@/i18n'
import { WAVE_DURATION_MS } from '@/sim/data/difficulty'
import { formatDuration, formatScore } from '../format'
import { renderNumber } from '../numeral'
import { createComboView } from './hud-combo'

export interface HudState {
  score: number
  wave: number
  combo: number
  /** Temps restant dans la fenêtre de combo, en ms (voir `COMBO_WINDOW_MS`). */
  comboTimer: number
  /** Temps écoulé dans la vague en cours, en ms (spec : vague de 40 s). */
  waveElapsed: number
  /**
   * Durée de la run, en temps de simulation (`world.time`) : elle gèle pendant
   * un hitstop et ralentit pendant le ralenti de mort. C'est voulu — le HUD
   * affiche exactement la durée que l'écran de mort annoncera (spec §4.1).
   */
  time: number
}

export interface Hud {
  update(state: HudState): void
  /** Masqué hors d'une run, en même temps que le canvas. */
  setVisible(visible: boolean): void
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
    <div class="absolute left-6 top-5" data-score-block>
      <div class="text-[10px] tracking-[0.25em] opacity-40" data-label-score></div>
      <div class="text-2xl opacity-90" data-score>0</div>
    </div>
    <div class="absolute left-1/2 top-5 -translate-x-1/2 text-center">
      <div class="text-[10px] tracking-[0.25em] opacity-40" data-label-time></div>
      <div class="text-2xl opacity-90" data-time>0:00</div>
    </div>
    <div class="absolute right-6 top-5 text-right">
      <div class="text-[10px] tracking-[0.25em] opacity-40" data-label-wave></div>
      <div class="text-2xl opacity-90" data-wave>1</div>
    </div>
    <div class="absolute bottom-7 left-1/2 h-[3px] w-32 -translate-x-1/2 rounded bg-paper/15">
      <div class="h-full rounded bg-paper/55 transition-[width] duration-100" data-progress style="width:0%"></div>
    </div>
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
  const labelTime = q('[data-label-time]')
  const timeEl = q('[data-time]')
  const progressEl = q('[data-progress]')

  const scoreBlock = q('[data-score-block]')
  const combo = createComboView()
  scoreBlock.appendChild(combo.element)

  return {
    update(state: HudState): void {
      // Réécrits à chaque frame : si la langue change (Réglages), le HUD suit
      // sans rechargement, comme le reste de l'interface (spec §5).
      labelScore.textContent = t('hud.score')
      labelWave.textContent = t('hud.wave')
      scoreEl.innerHTML = renderNumber(formatScore(state.score))
      waveEl.innerHTML = renderNumber(String(state.wave))
      labelTime.textContent = t('hud.time')
      timeEl.innerHTML = renderNumber(formatDuration(state.time))

      const progress = Math.min(1, Math.max(0, state.waveElapsed / WAVE_DURATION_MS))
      progressEl.style.width = `${progress * 100}%`

      combo.update(state.combo, state.comboTimer)
    },

    setVisible(visible: boolean): void {
      el.classList.toggle('hidden', !visible)
    },

    destroy(): void {
      el.remove()
    },
  }
}
