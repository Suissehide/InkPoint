import type { PowerUpKind } from '@sim/data/powerups'

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
  // Trois barbes divergentes : la volée se lit à sa multiplicité, pas au
  // dessin d'une plume unique qu'on confondrait avec la Ruée.
  volley:
    '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 34l16-16"/><path d="M14 44l20-20"/><path d="M24 46l16-16"/></g><path d="M40 12l6 6-6 6-6-6z" fill="currentColor"/>',
  // Une goutte pleine et sa trajectoire brisée : ce qui distingue la Bavure
  // des autres zones, c'est qu'elle voyage et qu'elle rebondit.
  splatter:
    '<circle cx="20" cy="22" r="7" fill="currentColor"/><path d="M26 27l12 10-8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>',
  // Deux cercles pleins, et surtout pas d'anneau segmenté : un cercle découpé
  // en tirets se compte, et un arc autour d'un cercle veut dire « temps
  // restant » partout ailleurs dans le jeu (jauge de pastille, arc de grâce).
  // Le Halo n'a ni charges ni durée — il absorbe un contact et se brise.
  halo: '<circle cx="28" cy="28" r="18" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".4"/><circle cx="28" cy="28" r="12" fill="none" stroke="currentColor" stroke-width="2.6"/>',
}

/**
 * `size` accepte un nombre (pixels, comme avant) ou une chaîne CSS : les
 * cartes passent `'1em'` pour que le pictogramme suive la taille de police du
 * bloc qui le contient, et donc la rampe `--ui`.
 */
export const icon = (kind: PowerUpKind, size: number | string = 24): string =>
  `<svg viewBox="0 0 56 56" width="${size}" height="${size}" aria-hidden="true">${POWERUP_ICONS[kind]}</svg>`
