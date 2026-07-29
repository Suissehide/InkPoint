import { onLocaleChange, t } from '@/i18n'
import type { UpgradeDef } from '@/sim/data/upgrades'
import { renderCard } from '../components/card'
import { createMenuNav } from '../menu-nav'

export interface UpgradeScreen {
  show(cards: UpgradeDef[], wave: number, onChoose: (card: UpgradeDef) => void): void
  hide(): void
  handleKey(code: string): boolean
}

export function createUpgradeScreen(root: HTMLElement): UpgradeScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-6 bg-ink-deep/85 text-paper backdrop-blur-sm'
  root.appendChild(el)

  let cards: UpgradeDef[] = []
  let nav = createMenuNav(3)
  // Remplacé par `show()` avant qu'aucune touche ne puisse le déclencher.
  let choose: (card: UpgradeDef) => void = () => {
    /* no-op tant que `show()` n'a pas fourni de vrai callback */
  }
  let currentWave = 1

  // `font-display` (Fh Ink) est réservé au titre « INK POINT » (voir
  // `menu.ts`) : ce titre d'écran, le décompte de vague et le rappel de
  // touches restent en `font-ui` (Kalam), qui dessine directement chiffres,
  // accents et ponctuation. Déviation par rapport au code fourni par la
  // brief, documentée dans le rapport de tâche.
  const render = (wave: number): void => {
    el.innerHTML = `
      <div class="text-center">
        <div class="text-[10px] tracking-[0.3em] opacity-45">${t('upgrade.waveCleared', { n: wave })}</div>
        <h2 class="mt-2 text-2xl tracking-wide">${t('upgrade.title')}</h2>
      </div>
      <div class="flex items-center gap-5">${cards.map((c, i) => renderCard(c, i === nav.index)).join('')}</div>
      <div class="text-[11px] tracking-[0.18em] opacity-35">${t('upgrade.hint')}</div>
    `
  }

  // Chaque écran se réabonne pour se redessiner immédiatement au changement de
  // langue, sans rechargement (spec §5 ; voir aussi `settings.ts`).
  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render(currentWave)
    }
  })

  return {
    show(next, wave, onChoose): void {
      cards = next
      currentWave = wave
      choose = onChoose
      nav = createMenuNav(cards.length)
      el.classList.remove('hidden')
      el.classList.add('flex')
      render(currentWave)
    },

    hide(): void {
      el.classList.add('hidden')
      el.classList.remove('flex')
    },

    handleKey(code: string): boolean {
      if (el.classList.contains('hidden')) {
        return false
      }
      if (code === 'ArrowLeft') {
        nav.move(-1)
        render(currentWave)
        return true
      }
      if (code === 'ArrowRight') {
        nav.move(1)
        render(currentWave)
        return true
      }
      if (code === 'Space' || code === 'Enter') {
        const card = cards[nav.index]
        if (card) {
          choose(card)
        }
        return true
      }
      return false
    },
  }
}
