import { playCardChosen } from '@/audio/ui'
import { onLocaleChange, t } from '@/i18n'
import type { UpgradeDef } from '@/sim/data/upgrades'
import { renderCard } from '../components/card'
import { bindHoverNav, bindItemActivation, createMenuNav, type MenuNav } from '../menu-nav'

export interface UpgradeScreen {
  show(cards: UpgradeDef[], wave: number, onChoose: (card: UpgradeDef) => void): void
  hide(): void
  handleKey(code: string): boolean
}

export function createUpgradeScreen(root: HTMLElement): UpgradeScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*1.3)] bg-ink-deep/85 text-paper backdrop-blur-sm'
  root.appendChild(el)

  let cards: UpgradeDef[] = []
  let nav = createMenuNav(3)
  // Remplacé par `show()` avant qu'aucune touche ne puisse le déclencher.
  let choose: (card: UpgradeDef) => void = () => {
    /* no-op tant que `show()` n'a pas fourni de vrai callback */
  }
  let currentWave = 1

  const activate = (index: number): void => {
    const card = cards[index]
    if (card) {
      // Avant `choose` : celui-ci referme l'écran, et la confirmation doit
      // accompagner la carte qu'on vient de prendre, pas la suivre.
      playCardChosen(card.rarity)
      choose(card)
    }
  }

  const render = (wave: number): void => {
    el.innerHTML = `
      <div class="text-center">
        <div class="ui-2xs tracking-[0.3em] opacity-45">${t('upgrade.waveCleared', { n: wave })}</div>
        <h2 class="ui-2xl mt-[0.4em] tracking-wide">${t('upgrade.title')}</h2>
      </div>
      <div class="flex items-center gap-[calc(var(--ui)*1.1)]">${cards.map((c, i) => `<div data-nav-index="${i}" class="cursor-pointer">${renderCard(c, i === nav.index)}</div>`).join('')}</div>
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('upgrade.hint')}</div>
    `
    // Rappelé avec le `nav` courant (recréé à chaque `show()`, le nombre de
    // cartes pouvant varier) — `innerHTML` détruit les nœuds précédents et
    // leurs écouteurs, voir `bindItemActivation`.
    bindItemActivation(el, nav, activate)
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render(currentWave)
    }
  })

  // `bindHoverNav` est branché une seule fois, sur un relais qui retransmet
  // vers le `nav` courant — sinon il resterait accroché au tout premier
  // (3 cartes par défaut) et ignorerait les recréations de `show()`.
  const navRelay: MenuNav = {
    get index() {
      return nav.index
    },
    move(delta): void {
      nav.move(delta)
    },
    set(index): void {
      nav.set(index)
    },
    reset(): void {
      nav.reset()
    },
  }
  bindHoverNav(el, navRelay, () => render(currentWave))

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
        activate(nav.index)
        return true
      }
      return false
    },
  }
}
