export interface CountdownScreen {
  show(): void
  /** Repose le chiffre ; ne relance l'animation que quand il change réellement. */
  update(digit: number): void
  hide(): void
}

/**
 * Le décompte de reprise. Deux partis pris qui le distinguent des autres
 * écrans :
 *
 * — **Ni voile sombre ni `backdrop-blur`**, contrairement à `pause.ts` et
 *   `upgrade.ts`. L'arène gelée doit rester parfaitement lisible pendant qu'on
 *   se rassemble : c'est tout l'intérêt de la mesure, pas l'attente.
 * — **`pointer-events-none`** : l'écran n'intercepte rien, `app/game.ts` garde
 *   la main sur le clavier (Échap remet en pause).
 *
 * Aucun i18n : un chiffre est un chiffre.
 */
export function createCountdownScreen(root: HTMLElement): CountdownScreen {
  const el = document.createElement('div')
  el.className =
    'pointer-events-none absolute inset-0 hidden items-center justify-center text-paper'

  const digitEl = document.createElement('div')
  digitEl.className = 'ui-huge leading-none opacity-80'
  el.appendChild(digitEl)
  root.appendChild(el)

  // -1 et non 0 : 0 est le chiffre « plus rien à afficher », qui doit lui aussi
  // pouvoir être posé une fois.
  let shown = -1

  return {
    show(): void {
      shown = -1
      el.classList.remove('hidden')
      el.classList.add('flex')
    },

    update(digit: number): void {
      if (digit === shown) {
        return
      }
      shown = digit
      digitEl.textContent = digit > 0 ? String(digit) : ''
      // Retrait / lecture forcée / ajout : une animation CSS déjà posée ne se
      // relance pas seule (même patron que `hud.punch`).
      digitEl.classList.remove('countdown-pop')
      void digitEl.offsetWidth
      digitEl.classList.add('countdown-pop')
    },

    hide(): void {
      el.classList.add('hidden')
      el.classList.remove('flex')
    },
  }
}
