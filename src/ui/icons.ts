import type { PowerUpKind } from '@/sim/data/powerups'

/**
 * Icônes tracées à la main, en `currentColor`, lisibles à 24 px dans le HUD.
 * Volontairement en tracés simples : elles doivent survivre au traitement d'encre.
 */
export const POWERUP_ICONS: Record<PowerUpKind, string> = {
  blast:
    '<circle cx="28" cy="28" r="17" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="28" cy="28" r="7" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".55"/>',
  freeze:
    '<g stroke="currentColor" fill="none" stroke-width="2.2"><path d="M28 10v36M13 19l30 18M43 19L13 37"/><path d="M28 17l-5 5M28 17l5 5M28 39l-5-5M28 39l5-5"/></g>',
  bramble:
    '<path d="M10 40Q20 18 30 30T48 16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
  blotter:
    '<path d="M28 28m0-16a16 16 0 1 1-11 4.7" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="28" cy="28" r="2.5" fill="currentColor"/>',
  dash: '<path d="M30 12l14 16-14 16" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 28h30" stroke="currentColor" stroke-width="2.4" opacity=".35" stroke-linecap="round"/>',
  halo: '<circle cx="28" cy="28" r="18" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".4" stroke-dasharray="4 3"/><circle cx="28" cy="28" r="12" fill="none" stroke="currentColor" stroke-width="2.6"/>',
}

export const icon = (kind: PowerUpKind, size = 24): string =>
  `<svg viewBox="0 0 56 56" width="${size}" height="${size}" aria-hidden="true">${POWERUP_ICONS[kind]}</svg>`
