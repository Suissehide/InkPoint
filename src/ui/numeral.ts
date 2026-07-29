/**
 * Largeur de boîte fixe pour chaque chiffre, en em, sous la police d'interface
 * (Kalam, graisse 700). Kalam n'expose aucune fonctionnalité OpenType
 * tabulaire (`tnum` absent de sa table GSUB, vérifié directement dans le
 * fichier de police — seule `liga` y est présente), donc
 * `font-variant-numeric: tabular-nums` n'y change rien : ses chasses de
 * chiffres vont de 302 unités (« 1 ») à 590 (« 8 ») sur une chasse d'em de
 * 1000. 0.6em (arrondi au-dessus du plus large) est donc imposé à chaque
 * chiffre : sans lui, un nombre qui défile à chaque image (score, vague)
 * tressauterait horizontalement.
 */
const DIGIT_BOX_EM = 0.6

/**
 * Enrobe chaque chiffre d'une chaîne dans une boîte à largeur fixe. Réservé
 * aux affichages qui se redessinent en continu pendant que le joueur regarde
 * l'écran (score, vague, combo du HUD) : ailleurs (titres, cartes, écrans de
 * menu), un nombre ne change qu'au moment où l'écran entier se redessine, il
 * n'y a rien à stabiliser.
 *
 * Contrairement à l'ancienne police d'interface (`Ink Pen`), Kalam dessine
 * correctement tout ce qu'un texte français peut contenir — lettres,
 * chiffres, accents, ponctuation, « × » — donc plus aucun caractère n'a
 * besoin d'être détourné vers une autre police ici : seule la largeur des
 * chiffres reste à corriger.
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
