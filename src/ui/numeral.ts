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

/**
 * Généralisation de `renderNumber` à tout texte affiché en `font-ui` (Ink Pen),
 * pas seulement aux nombres. En creusant le défaut de police documenté
 * ci-dessus pour la Task 20 (écrans), il s'est avéré bien plus large que les
 * chiffres et le « : » : vérifiée directement dans le fichier de police,
 * `Ink Pen` a des glyphes présents mais **sans aucun tracé** pour à peu près
 * toute sa ponctuation ASCII (`. , ' - + % { }`, etc.) et pour les voyelles
 * françaises accentuées (`é è à ç ê î ô û ù ï ü` et leurs majuscules) — soit
 * la quasi-totalité des caractères d'un texte français, et une bonne part de
 * la ponctuation anglaise. Un « e » nu passe très bien ; un « é » ou une
 * virgule, eux, disparaissent purement et simplement.
 *
 * Une lettre latine simple (a-z, A-Z) ou une espace traverse telle quelle ;
 * tout le reste part vers `Fh Ink`, exactement comme `renderNumber` le fait
 * déjà pour les chiffres : `Fh Ink` dessine lui-même la ponctuation ASCII
 * courante et le « : », et pour ce qu'il ne connaît pas non plus (accents,
 * guillemets, tiret cadratin…) sa pile de police retombe sur `Georgia` —
 * exactement le même repli que celui de `font-ui`, donc sans coût visuel
 * pour les caractères qui s'en sortaient déjà par ce chemin.
 *
 * À utiliser pour tout texte traduit affiché dans les écrans (menus, cartes,
 * fin de partie, réglages) : descriptions de cartes (« +12% »), texte
 * français accentué, rappels de touches. Sans ça, une bonne partie du texte
 * du jeu serait simplement invisible dès qu'il quitte l'anglais sans accent
 * ni ponctuation.
 */
export function renderText(text: string): string {
  let out = ''
  for (const ch of text) {
    if (/[A-Za-z\s]/.test(ch)) {
      out += ch
    } else if (/\d/.test(ch)) {
      out += `<span class="font-display inline-block text-center" style="width:${DIGIT_BOX_EM}em">${ch}</span>`
    } else {
      out += `<span class="font-display">${ch}</span>`
    }
  }
  return out
}
