/**
 * Largeur de boîte fixe pour chaque chiffre, en em. `Fh Ink` n'expose aucune
 * fonctionnalité OpenType (`GSUB` absent du fichier de police), donc
 * `font-variant-numeric: tabular-nums` n'y fait strictement rien ; ses
 * chasses de chiffres vont de 462 unités (« 1 ») à 640 (« 9 ») sur une chasse
 * d'em de 1000 — vérifié directement dans le fichier de police. 0.64em (la
 * chasse du « 9 », le plus large) devient donc la largeur commune imposée à
 * chaque chiffre : sans elle, un score qui défile tressauterait
 * horizontalement à chaque frame.
 */
const DIGIT_BOX_EM = 0.64

/**
 * Enrobe chaque chiffre d'une chaîne dans une boîte `Fh Ink` à largeur fixe,
 * et bascule aussi le « : » vers `Fh Ink` (sans boîte : son tracé ne change
 * jamais d'une frame à l'autre, seule sa visibilité est en jeu). Tout le
 * reste (espace fine, « × », lettres) traverse tel quel et hérite de la
 * police ambiante (`font-ui` / Ink Pen).
 *
 * Nécessaire car la police d'interface `Ink Pen` a deux glyphes cassés,
 * vérifiés directement dans le fichier de police (`public/fonts/ink-pen.woff2`) :
 * les chiffres 0-8 ont des contours vides (seul le « 9 » est dessiné, et mal
 * positionné), et « : » est vide lui aussi (même défaut, même chasse de 10
 * unités que les chiffres cassés). `Fh Ink` dessine ses dix chiffres et son
 * « : » correctement — c'est la police des titres (`--font-display`), pas
 * celle de l'interface, mais elle reste dans l'esthétique encre du jeu,
 * contrairement à une police système générique.
 *
 * Utilisé partout où un nombre (ou une durée `m:ss`) s'affiche : le HUD
 * (score, vague, combo), et les écrans à venir (fin de partie, réglages).
 */
export function renderNumber(text: string): string {
  let out = ''
  for (const ch of text) {
    if (/\d/.test(ch)) {
      out += `<span class="font-display inline-block text-center" style="width:${DIGIT_BOX_EM}em">${ch}</span>`
    } else if (ch === ':') {
      out += '<span class="font-display">:</span>'
    } else {
      out += ch
    }
  }
  return out
}
