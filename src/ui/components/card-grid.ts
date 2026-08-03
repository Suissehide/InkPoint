/**
 * Géométrie commune aux grilles de cartes — améliorations, succès, tracés.
 *
 * Les pistes sont calées sur la taille de `renderCard` (largeur `9,5 × --ui`,
 * hauteur déduite de son `aspect-[5/7]`, soit `13,3 × --ui`), jamais laissées
 * libres :
 * — `auto-rows` : sans hauteur de rangée explicite, les rangées implicites se
 *   calculaient sur le seul contenu texte des cartes, plus court que la carte
 *   elle-même, et chaque rangée chevauchait la suivante ;
 * — `grid-cols` en `repeat(auto-fill, …)` plutôt que `grid-cols-4` : à quatre
 *   colonnes imposées, une fenêtre étroite réduit chaque piste sous la largeur
 *   de la carte, qui déborde alors sur sa voisine.
 * Le plafond de `42 × --ui` tient quatre cartes et leurs trois écarts sur une
 * ligne — sans lui, un grand écran en alignerait neuf, bord à bord. Le
 * conteneur est en `border-box` et porte lui-même `p-[calc(var(--ui)*0.4)]` :
 * la largeur de contenu réelle est donc `42 − 0,8 = 41,2 × --ui`, contre
 * `4 × 9,5 + 3 × 0,8 = 40,4 × --ui` requis pour quatre pistes — 0,8 unité de
 * marge, pas plus. Les 80vw gardent une marge de chaque côté quand l'écran est
 * plus étroit.
 *
 * Ces valeurs sont solidaires de `renderCard` : les changer sans le suivre
 * casse les trois grilles en silence.
 */
export const CARD_GRID_CLASS =
  'grid max-h-[70vh] max-w-[min(80vw,calc(var(--ui)*42))] auto-rows-[calc(var(--ui)*13.3)] grid-cols-[repeat(auto-fill,calc(var(--ui)*9.5))] content-start justify-center gap-[calc(var(--ui)*0.8)] overflow-y-auto p-[calc(var(--ui)*0.4)]'
