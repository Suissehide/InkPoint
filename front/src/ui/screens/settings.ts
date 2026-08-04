import { type MovementInput, resolveMovementInput } from '@/app/input-source'
import { readNickname, writeNickname } from '@/app/nickname'
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
  /** Branché sur le choix de source d'entrée de `game.ts`. */
  onMovementInputChange(next: MovementInput): void
  /** Branché sur `audio.setVolume` par `game.ts` (spec §9.3). */
  onSfxVolumeChange(volume: number): void
  /** Décide de la paire proposée : joystick ↔ clavier au doigt, souris ↔ clavier ailleurs. */
  coarsePointer: boolean
  /**
   * Consultés/écrits pour le champ pseudo, injectables comme dans
   * `gameover.ts` (même raison : `vi.mock` n'est pas intercepté sous le
   * lanceur navigateur de ce dépôt — voir la docstring de `GameOverDeps`).
   * `game.ts` n'a rien à fournir de spécial ici : les valeurs par défaut,
   * posées plus bas, suffisent.
   */
  readNickname?: () => string | null
  writeNickname?: (raw: string) => string | null
}

export interface SettingsScreen {
  show(onBack: () => void): void
  hide(): void
  handleKey(code: string): boolean
}

const VOLUME_STEP = 10
// Langue, déplacement, mouvement réduit, volume des effets, pseudo, retour.
const ROW_COUNT = 6

/** Le volume des effets pilote `src/audio/engine.ts` (`AudioEngine.setVolume`) via `onSfxVolumeChange` : les boutons +/- ci-dessous agissent immédiatement sur le mixage, pas seulement sur la valeur persistée. */
export function createSettingsScreen(root: HTMLElement, deps: SettingsDeps): SettingsScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-auto absolute inset-0 hidden flex-col items-center justify-center gap-[calc(var(--ui)*1.3)] bg-ink-deep text-paper'
  root.appendChild(el)

  // Valeurs par défaut : `game.ts` n'a rien à fournir, seuls les tests
  // remplacent ces deux entrées (voir la docstring de `SettingsDeps`).
  const doReadNickname = deps.readNickname ?? readNickname
  const doWriteNickname = deps.writeNickname ?? writeNickname

  const nav = createMenuNav(ROW_COUNT)
  // Même résolution que `game.ts` : sinon cet écran afficherait « Off » alors
  // que le mouvement réduit est actif via `prefers-reduced-motion`.
  let reducedMotion = resolveReducedMotion()
  let movementInput = resolveMovementInput(deps.coarsePointer)
  let sfxVolume = storage.get('sfxVolume', 100)
  // Remplacé par `show()` avant qu'aucune touche ne puisse le déclencher.
  let back: () => void = () => {
    /* no-op tant que `show()` n'a pas fourni de vrai callback */
  }

  const languageLabel = (locale: Locale): string =>
    locale === 'fr' ? t('settings.languageFrench') : t('settings.languageEnglish')

  const movementLabel = (input: MovementInput): string => {
    if (input === 'joystick') {
      return t('settings.movementJoystick')
    }
    return input === 'mouse' ? t('settings.movementMouse') : t('settings.movementKeyboard')
  }

  const row = (index: number, label: string, value: string, controls = ''): string => {
    const active = index === nav.index
    return `
      <div data-nav-index="${index}" class="ui-sm flex w-[calc(var(--ui)*17)] cursor-pointer items-center justify-between tracking-[0.1em] ${active ? 'opacity-100' : 'opacity-50'}">
        <span class="flex items-center gap-[0.4em]">${renderNavMarker(active)}<span>${label}</span></span>
        <span class="flex items-center gap-[0.6em]">${controls}<span>${value}</span></span>
      </div>
    `
  }

  // Seul réglage à deux directions (+/-) au clic : deux boutons dédiés plutôt
  // qu'un clic générique sur la ligne, qui ne dirait pas dans quel sens.
  const volumeControls = `
    <button type="button" data-volume-delta="${-VOLUME_STEP}" class="cursor-pointer rounded border border-paper/40 px-2 leading-tight opacity-80 hover:opacity-100">−</button>
    <button type="button" data-volume-delta="${VOLUME_STEP}" class="cursor-pointer rounded border border-paper/40 px-2 leading-tight opacity-80 hover:opacity-100">+</button>
  `

  /**
   * Seule rangée à texte libre : contrairement à `row()`, la valeur n'est
   * jamais posée dans le gabarit (le pseudo mémorisé n'est pas assaini
   * contre le balisage, comme au classement — `leaderboard.ts` — donc jamais
   * interpolé dans une chaîne HTML). `render()` pose `input.value` par la
   * propriété DOM juste après, jamais par l'attribut `value="…"` du gabarit.
   */
  const nicknameRow = (): string => {
    const active = 4 === nav.index
    return `
      <div data-nav-index="4" class="ui-sm flex w-[calc(var(--ui)*17)] cursor-pointer items-center justify-between tracking-[0.1em] ${active ? 'opacity-100' : 'opacity-50'}">
        <span class="flex items-center gap-[0.4em]">${renderNavMarker(active)}<span>${t('settings.nickname')}</span></span>
        <input
          data-nickname-input
          type="text"
          maxlength="20"
          placeholder="${t('settings.nicknamePlaceholder')}"
          class="ui-xs w-[calc(var(--ui)*7)] rounded border border-paper/40 bg-paper/10 px-[0.5em] py-[0.2em] text-right text-paper placeholder:text-paper/40 focus:outline-none focus:border-paper/70"
        />
      </div>
    `
  }

  const toggleLanguage = (): void => {
    const next: Locale = getLocale() === 'en' ? 'fr' : 'en'
    setLocale(next)
    storage.set('locale', next)
    // `onLocaleChange` (ci-dessous) redessine déjà cet écran.
  }

  const toggleReducedMotion = (): void => {
    reducedMotion = !reducedMotion
    storage.set('reducedMotion', reducedMotion)
    deps.onReducedMotionChange(reducedMotion)
    render()
  }

  // Le basculement reste binaire ; seule la paire change avec l'appareil. Sur
  // téléphone, proposer « Souris » n'aurait aucun sens, et le clavier reste
  // utile pour une tablette avec clavier branché.
  const toggleMovementInput = (): void => {
    const pointerDevice: MovementInput = deps.coarsePointer ? 'joystick' : 'mouse'
    movementInput = movementInput === 'keyboard' ? pointerDevice : 'keyboard'
    storage.set('movementInput', movementInput)
    deps.onMovementInputChange(movementInput)
    render()
  }

  const adjustVolume = (delta: number): void => {
    sfxVolume = Math.min(100, Math.max(0, sfxVolume + delta))
    storage.set('sfxVolume', sfxVolume)
    deps.onSfxVolumeChange(sfxVolume)
    render()
  }

  /**
   * Écrit la forme normalisée (ou revient au pseudo mémorisé si le champ ne
   * survit pas à la normalisation) — jamais l'inverse.
   *
   * `writeNickname` ne vide jamais le stockage sur un résultat vide (voir sa
   * docstring) : un pseudo déjà mémorisé reste donc actif même si le champ
   * est vidé ici. Laisser le champ vide mentirait alors sur ce qui sera
   * utilisé à la prochaine publication — il est donc ramené au pseudo
   * réellement actif plutôt que de rester vide sans rien dire. Il n'existe
   * pas de fonction d'effacement à consommer (spec, tâche) : le champ ne
   * peut donc pas promettre ce que ce module ne peut pas tenir.
   */
  const commitNickname = (): void => {
    const input = el.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (!input) {
      return
    }
    const result = doWriteNickname(input.value)
    input.value = result ?? doReadNickname() ?? ''
  }

  /** Partagée entre `Espace`/`Entrée` (`nav.index`) et le clic (`bindItemActivation`). */
  const activate = (index: number): void => {
    if (index === 0) {
      toggleLanguage()
    } else if (index === 1) {
      toggleMovementInput()
    } else if (index === 2) {
      toggleReducedMotion()
    } else if (index === 4) {
      // Le clavier n'a pas d'autre moyen d'entrer le champ : la sélection ne
      // fait que le survoler (comme les autres rangées), taper y exige le
      // focus réel.
      el.querySelector<HTMLInputElement>('[data-nickname-input]')?.focus()
    } else if (index === 5) {
      back()
    }
    // La ligne 3 (volume) n'a pas d'activation générique, voir `volumeControls`.
  }

  const render = (): void => {
    el.innerHTML = `
      <h2 class="ui-2xl tracking-wide">${t('settings.title')}</h2>
      <div class="flex flex-col gap-[calc(var(--ui)*0.8)]">
        ${row(0, t('settings.language'), languageLabel(getLocale()))}
        ${row(1, t('settings.movement'), movementLabel(movementInput))}
        ${row(2, t('settings.reducedMotion'), reducedMotion ? t('settings.on') : t('settings.off'))}
        ${row(3, t('settings.sfxVolume'), `${sfxVolume}%`, volumeControls)}
        ${nicknameRow()}
        ${row(5, t('settings.back'), '')}
      </div>
      <div class="ui-xs w-[calc(var(--ui)*17)] tracking-[0.1em] opacity-45">${t('settings.nicknameNote')}</div>
      <div class="ui-xs tracking-[0.18em] opacity-35">${t('settings.hint')}</div>
    `
    // `innerHTML` détruit les nœuds précédents (et leurs écouteurs), voir `bindItemActivation`.
    bindItemActivation(el, nav, activate)
    // Boutons +/- posés directement, jamais délégués — même raison que `bindItemActivation`.
    for (const button of el.querySelectorAll<HTMLElement>('[data-volume-delta]')) {
      const delta = Number(button.dataset.volumeDelta)
      if (Number.isNaN(delta)) {
        continue
      }
      button.addEventListener('click', () => adjustVolume(delta))
    }
    // Jamais posée via l'attribut `value="…"` du gabarit ci-dessus, voir la
    // docstring de `nicknameRow` — même raison que `textContent` au
    // classement (`leaderboard.ts`) : le pseudo n'est assaini contre aucun
    // balisage.
    const nicknameInput = el.querySelector<HTMLInputElement>('[data-nickname-input]')
    if (nicknameInput) {
      nicknameInput.value = doReadNickname() ?? ''
      nicknameInput.addEventListener('keydown', (e: KeyboardEvent): void => {
        // Empêche le routage clavier global (`game.ts`) de lire cette frappe :
        // sans ça, `Échap` sortirait des Réglages et les flèches
        // déplaceraient la sélection des rangées PENDANT la saisie — même
        // raison que le champ pseudo de `gameover.ts`.
        e.stopPropagation()
        if (e.code === 'Enter') {
          commitNickname()
          nicknameInput.blur()
        } else if (e.code === 'Escape') {
          // Annule la saisie en cours, sans sortir des Réglages : un premier
          // Échap quitte le champ, un second (qui atteint alors le routage
          // global, le focus n'y étant plus) quitte l'écran.
          nicknameInput.value = doReadNickname() ?? ''
          nicknameInput.blur()
        }
      })
      // Au clic ailleurs ou à la tabulation : le champ commet aussi en
      // perdant le focus, pas seulement à `Entrée` — un joueur qui clique le
      // bouton volume juste après avoir tapé ne doit pas perdre sa saisie.
      nicknameInput.addEventListener('blur', () => commitNickname())
    }
  }

  onLocaleChange(() => {
    if (!el.classList.contains('hidden')) {
      render()
    }
  })

  bindHoverNav(el, nav, render)

  return {
    show(onBack): void {
      back = onBack
      reducedMotion = resolveReducedMotion()
      movementInput = resolveMovementInput(deps.coarsePointer)
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
        } else if (nav.index === 1) {
          toggleMovementInput()
        } else if (nav.index === 3) {
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
