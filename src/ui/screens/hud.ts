import { t } from '@/i18n'
import { WAVE_DURATION_MS } from '@/sim/data/difficulty'
import type { PowerUpKind } from '@/sim/data/powerups'
import { comboMultiplier } from '@/sim/systems/score'
import { formatScore } from '../format'
import { icon } from '../icons'

export interface HudState {
  score: number
  wave: number
  combo: number
  /** Temps écoulé dans la vague en cours, en ms (spec : vague de 40 s). */
  waveElapsed: number
  inventory: (PowerUpKind | null)[]
}

export interface Hud {
  update(state: HudState): void
  destroy(): void
}

/**
 * HUD flottant dans l'image : libellés en petites capitales espacées AU-DESSUS
 * des chiffres, opacité basse et `pointer-events-none` pour ne jamais
 * concurrencer la lecture du danger (spec §4.1). Chiffres tabulaires forcés
 * en `font-mono` (voir plus bas) : le score ne tressaute pas en défilant.
 *
 * `font-mono` sur les chiffres est volontaire, pas cosmétique — deux défauts
 * cumulés l'imposent :
 *  1. La police d'interface « Ink Pen » (`public/fonts/ink-pen.woff2`) n'a
 *     **aucun tracé** pour les glyphes 0-8 (contours vides, vérifié
 *     directement dans le fichier de police) et un « 9 » mal positionné — un
 *     défaut de la police source, déjà présent dans l'OTF d'origine du
 *     prototype 2021, pas une régression de la conversion WOFF2. Sans repli,
 *     le score et la vague seraient invisibles à l'écran.
 *  2. Le repli `Georgia` (deuxième police de `--font-ui`) a des chiffres à
 *     chasse variable dans ce navigateur et ignore `font-variant-numeric:
 *     tabular-nums` (vérifié : largeurs de 10 à 15px selon le chiffre) — il
 *     aurait fait exactement le tressautement que la spec interdit. Les
 *     polices `monospace` le garantissent par construction.
 * Les libellés (texte pur, jamais de chiffre) restent en `font-ui` (Ink Pen).
 */
export function createHud(root: HTMLElement): Hud {
  const el = document.createElement('div')
  el.className = 'pointer-events-none absolute inset-0 select-none text-paper'
  el.innerHTML = `
    <div class="absolute left-6 top-5">
      <div class="text-[10px] tracking-[0.25em] opacity-40" data-label-score></div>
      <div class="text-2xl font-mono opacity-90" data-score>0</div>
    </div>
    <div class="absolute right-6 top-5 text-right">
      <div class="text-[10px] tracking-[0.25em] opacity-40" data-label-wave></div>
      <div class="text-2xl font-mono opacity-90" data-wave>1</div>
    </div>
    <div class="absolute bottom-6 left-6 flex gap-3" data-slots></div>
    <div class="absolute bottom-7 left-1/2 h-[3px] w-32 -translate-x-1/2 rounded bg-paper/15">
      <div class="h-full rounded bg-paper/55 transition-[width] duration-100" data-progress style="width:0%"></div>
    </div>
    <div class="absolute bottom-6 right-6 font-mono text-sm opacity-0 transition-opacity" data-combo></div>
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
  const slotsEl = q('[data-slots]')
  const progressEl = q('[data-progress]')
  const comboEl = q('[data-combo]')

  return {
    update(state: HudState): void {
      // Réécrits à chaque frame : si la langue change (Réglages), le HUD suit
      // sans rechargement, comme le reste de l'interface (spec §5).
      labelScore.textContent = t('hud.score')
      labelWave.textContent = t('hud.wave')
      scoreEl.textContent = formatScore(state.score)
      waveEl.textContent = String(state.wave)

      const progress = Math.min(1, Math.max(0, state.waveElapsed / WAVE_DURATION_MS))
      progressEl.style.width = `${progress * 100}%`

      const multiplier = comboMultiplier(state.combo)
      comboEl.textContent = t('hud.combo', { n: multiplier })
      comboEl.style.opacity = state.combo > 0 ? '0.75' : '0'

      slotsEl.innerHTML = state.inventory
        .map((kind) =>
          kind
            ? `<span class="opacity-85" title="${t(`powerup.${kind}.name`)}">${icon(kind)}</span>`
            : '<span class="inline-block h-6 w-6 rounded-full border border-paper/20"></span>',
        )
        .join('')
    },

    destroy(): void {
      el.remove()
    },
  }
}
