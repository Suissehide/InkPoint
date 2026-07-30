import { storage } from '@/app/storage'
import { getLocale, type Locale, onLocaleChange, setLocale, t } from '@/i18n'
import { resolveReducedMotion } from '../a11y'
import {
  bindHoverNav,
  bindItemActivation,
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
  const row = (index: number, label: string, value: string, controls = ''): string => {
    const active = index === nav.index
    return `
      <div data-nav-index="${index}" class="flex w-72 cursor-pointer items-center justify-between text-sm tracking-[0.1em] ${active ? 'opacity-100' : 'opacity-50'}">
        <span class="flex items-center gap-2">${renderNavMarker(active)}<span>${label}</span></span>
        <span class="flex items-center gap-3">${controls}<span>${value}</span></span>
      </div>
    `
  }

  // Le volume est le seul réglage à deux directions (+/-) au clic : la ligne
  // sélectionne au survol comme les autres (spec : une seule sélection), mais
  // son activation n'a pas de sens sans savoir dans quel sens — d'où ces deux
  // boutons dédiés plutôt qu'un clic générique sur la ligne (voir `el`
  // ci-dessous, écouteur `data-volume-delta`).
  const volumeControls = `
    <button type="button" data-volume-delta="${-VOLUME_STEP}" class="cursor-pointer rounded border border-paper/40 px-2 leading-tight opacity-80 hover:opacity-100">−</button>
    <button type="button" data-volume-delta="${VOLUME_STEP}" class="cursor-pointer rounded border border-paper/40 px-2 leading-tight opacity-80 hover:opacity-100">+</button>
  `

  const toggleLanguage = (): void => {
    const next: Locale = getLocale() === 'en' ? 'fr' : 'en'
    setLocale(next)
    storage.set('locale', next)
    // `onLocaleChange` (ci-dessous) redessine déjà cet écran : pas de second
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

  /**
   * Partagée entre `Espace`/`Entrée` (sur `nav.index`) et le clic souris
   * (sur la ligne cliquée directement, voir `bindItemActivation`).
   */
  const activate = (index: number): void => {
    if (index === 0) {
      toggleLanguage()
    } else if (index === 1) {
      toggleReducedMotion()
    } else if (index === 3) {
      back()
    }
    // La ligne 2 (volume) n'a pas d'activation générique : voir `volumeControls`
    // et les écouteurs posés directement sur ses boutons ci-dessous.
  }

  const render = (): void => {
    el.innerHTML = `
      <h2 class="text-2xl tracking-wide">${t('settings.title')}</h2>
      <div class="flex flex-col gap-4">
        ${row(0, t('settings.language'), languageLabel(getLocale()))}
        ${row(1, t('settings.reducedMotion'), reducedMotion ? t('settings.on') : t('settings.off'))}
        ${row(2, t('settings.sfxVolume'), `${sfxVolume}%`, volumeControls)}
        ${row(3, t('settings.back'), '')}
      </div>
      <div class="text-[11px] tracking-[0.18em] opacity-35">${t('settings.hint')}</div>
    `
    // Reposés à chaque redessin : `innerHTML` détruit les nœuds précédents
    // (et leurs écouteurs) — voir `bindItemActivation`.
    bindItemActivation(el, nav, activate)
    // Boutons +/- du volume : chacun posé directement sur SON bouton, pas
    // délégué — même raison que `bindItemActivation` (voir menu-nav.ts).
    for (const button of el.querySelectorAll<HTMLElement>('[data-volume-delta]')) {
      const delta = Number(button.dataset.volumeDelta)
      if (Number.isNaN(delta)) {
        continue
      }
      button.addEventListener('click', () => adjustVolume(delta))
    }
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  // Le survol déplace la sélection partagée ; le clic s'active depuis
  // `render()` ci-dessus, jamais depuis ici (voir `bindItemActivation`).
  bindHoverNav(el, nav, render)

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
        activate(nav.index)
        return true
      }
      return false
    },
  }
}
