import { storage } from '@/app/storage'
import { getLocale, type Locale, onLocaleChange, setLocale, t } from '@/i18n'
import { resolveReducedMotion } from '../a11y'
import {
  createMenuNav,
  NAV_DOWN_CODES,
  NAV_LEFT_CODES,
  NAV_RIGHT_CODES,
  NAV_UP_CODES,
  renderNavMarker,
} from '../menu-nav'

export interface SettingsDeps {
  /** Branché sur `stage.setEffects` par `game.ts` (spec §6.8). */
  onReducedMotionChange(reduced: boolean): void
}

export interface SettingsScreen {
  show(onBack: () => void): void
  hide(): void
  handleKey(code: string): boolean
}

const VOLUME_STEP = 10
// Langue, mouvement réduit, volume des effets, retour.
const ROW_COUNT = 4

/**
 * Aucun moteur audio n'existe encore dans ce dépôt (v1 n'en construit pas un) :
 * le volume des effets est persisté mais ne pilote rien de sonore pour
 * l'instant. C'est délibéré — la valeur est prête pour le jour où un moteur
 * sera branché, plutôt qu'un contrôle qui prétendrait faire quelque chose.
 */
export function createSettingsScreen(root: HTMLElement, deps: SettingsDeps): SettingsScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-6 bg-ink-deep text-paper'
  root.appendChild(el)

  const nav = createMenuNav(ROW_COUNT)
  // Même résolution que `game.ts` (réglage explicite > préférence système) :
  // sinon cet écran afficherait « Off » alors que le mouvement réduit est en
  // fait actif via `prefers-reduced-motion`.
  let reducedMotion = resolveReducedMotion()
  let sfxVolume = storage.get('sfxVolume', 100)
  // Remplacé par `show()` avant qu'aucune touche ne puisse le déclencher.
  let back: () => void = () => {
    /* no-op tant que `show()` n'a pas fourni de vrai callback */
  }

  const languageLabel = (locale: Locale): string =>
    locale === 'fr' ? t('settings.languageFrench') : t('settings.languageEnglish')

  // `font-display` (Fh Ink) est réservé au titre « INK POINT » (voir
  // `menu.ts`) : cet écran, libellés et valeurs, reste en `font-ui` (Kalam),
  // qui dessine directement accents, ponctuation et chiffres — plus besoin du
  // détour par `renderText`.
  const row = (index: number, label: string, value: string): string => {
    const active = index === nav.index
    return `
      <div class="flex w-72 items-center justify-between text-sm tracking-[0.1em] ${active ? 'opacity-100' : 'opacity-50'}">
        <span class="flex items-center gap-2">${renderNavMarker(active)}<span>${label}</span></span>
        <span>${value}</span>
      </div>
    `
  }

  const render = (): void => {
    el.innerHTML = `
      <h2 class="text-2xl tracking-wide">${t('settings.title')}</h2>
      <div class="flex flex-col gap-4">
        ${row(0, t('settings.language'), languageLabel(getLocale()))}
        ${row(1, t('settings.reducedMotion'), reducedMotion ? t('settings.on') : t('settings.off'))}
        ${row(2, t('settings.sfxVolume'), `${sfxVolume}%`)}
        ${row(3, t('settings.back'), '')}
      </div>
      <div class="text-[11px] tracking-[0.18em] opacity-35">${t('settings.hint')}</div>
    `
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  const toggleLanguage = (): void => {
    const next: Locale = getLocale() === 'en' ? 'fr' : 'en'
    setLocale(next)
    storage.set('locale', next)
    // `onLocaleChange` (ci-dessus) redessine déjà cet écran : pas de second
    // `render()` ici, il serait redondant.
  }

  const toggleReducedMotion = (): void => {
    reducedMotion = !reducedMotion
    storage.set('reducedMotion', reducedMotion)
    deps.onReducedMotionChange(reducedMotion)
    render()
  }

  const adjustVolume = (delta: number): void => {
    sfxVolume = Math.min(100, Math.max(0, sfxVolume + delta))
    storage.set('sfxVolume', sfxVolume)
    render()
  }

  return {
    show(onBack): void {
      back = onBack
      reducedMotion = resolveReducedMotion()
      sfxVolume = storage.get('sfxVolume', 100)
      nav.reset()
      el.classList.remove('hidden')
      el.classList.add('flex')
      render()
    },

    hide(): void {
      el.classList.add('hidden')
      el.classList.remove('flex')
    },

    handleKey(code: string): boolean {
      if (el.classList.contains('hidden')) {
        return false
      }
      if (code === 'Escape') {
        back()
        return true
      }
      if (NAV_UP_CODES.includes(code)) {
        nav.move(-1)
        render()
        return true
      }
      if (NAV_DOWN_CODES.includes(code)) {
        nav.move(1)
        render()
        return true
      }
      if (NAV_LEFT_CODES.includes(code) || NAV_RIGHT_CODES.includes(code)) {
        const dir = NAV_LEFT_CODES.includes(code) ? -1 : 1
        if (nav.index === 0) {
          toggleLanguage()
        } else if (nav.index === 2) {
          adjustVolume(dir * VOLUME_STEP)
        }
        return true
      }
      if (code === 'Space' || code === 'Enter') {
        if (nav.index === 0) {
          toggleLanguage()
        } else if (nav.index === 1) {
          toggleReducedMotion()
        } else if (nav.index === 3) {
          back()
        }
        return true
      }
      return false
    },
  }
}
