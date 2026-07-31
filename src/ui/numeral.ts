/**
 * Chasse fixe par chiffre, en em, sous la police d'interface (Kalam, graisse
 * 700) : elle n'expose aucune fonctionnalité OpenType tabulaire (`tnum`
 * absent), donc `font-variant-numeric: tabular-nums` ne fait rien — sans
 * cette largeur imposée, un nombre qui défile tressauterait horizontalement.
 */
const DIGIT_BOX_EM = 0.6

/**
 * Réservé aux affichages qui se redessinent en continu (score, vague, combo
 * du HUD) : ailleurs, un nombre ne change qu'au redessin complet de l'écran,
 * rien à stabiliser.
 */
export function renderNumber(text: string): string {
  let out = ''
  for (const ch of text) {
    if (/\d/.test(ch)) {
      out += `<span class="inline-block text-center" style="width:${DIGIT_BOX_EM}em">${ch}</span>`
    } else {
      out += ch
    }
  }
  return out
}
