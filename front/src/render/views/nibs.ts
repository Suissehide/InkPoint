/**
 * Les silhouettes de la pointe du joueur. Une seule source, deux
 * consommateurs : `drawNib` la trace dans Pixi, `nibPath` la rend en SVG pour
 * les vitrines du menu. Deux copies du même contour divergeraient au premier
 * ajustement — et le joueur verrait un tracé au menu, un autre en jeu.
 *
 * Repère identique pour toutes : origine au centre de la hitbox, pointe vers
 * +x. Un tracé ne change ni la portée, ni la vitesse, ni la hitbox — celle-ci
 * vit dans `Collider.radius`, côté simulation, qu'aucun tracé ne touche.
 */
export type SkinId = 'quill' | 'ball' | 'brush' | 'blot' | 'dropper' | 'pencil' | 'seal'

export const SKIN_IDS: readonly SkinId[] = [
  'quill',
  'ball',
  'brush',
  'blot',
  'dropper',
  'pencil',
  'seal',
]

type Poly = readonly (readonly [number, number])[]

/**
 * Disque approché par un polygone régulier. Tout est polygonal ici, cercles
 * compris : le filtre `boil` fait trembler le trait à 8 fps, un seize-côtés y
 * est indiscernable d'un vrai cercle, et une seconde primitive obligerait
 * `drawNib` et `nibPath` à savoir la dessiner chacun de son côté.
 */
function circle(radius: number, sides: number): Poly {
  return Array.from({ length: sides }, (_, i): readonly [number, number] => {
    const a = (i / sides) * Math.PI * 2
    return [
      Math.round(Math.cos(a) * radius * 100) / 100,
      Math.round(Math.sin(a) * radius * 100) / 100,
    ]
  })
}

export const NIBS: Record<SkinId, Poly> = {
  /** La plume d'origine, au sommet près : le défaut ne bouge pas. */
  quill: [
    [13, 0],
    [-8, 9],
    [-4, 0],
    [-8, -9],
  ],
  /** La bille : pas d'orientation lisible, et c'est le propos — elle roule. */
  ball: circle(10, 16),
  /** Le pinceau : touffe large, pointe molle. */
  brush: [
    [12, 0],
    [2, 7],
    [-8, 9],
    [-6, 0],
    [-8, -9],
    [2, -7],
  ],
  /** La tache : aucune direction lisible, contour volontairement irrégulier. */
  blot: [
    [11, 2],
    [6, 8],
    [-2, 10],
    [-9, 6],
    [-11, -1],
    [-6, -8],
    [1, -10],
    [8, -7],
  ],
  /** Le compte-gouttes : pointe fine, corps rond. */
  dropper: [
    [13, 0],
    [4, 5],
    [-2, 9],
    [-8, 6],
    [-10, 0],
    [-8, -6],
    [-2, -9],
    [4, -5],
  ],
  /** Le crayon : fût hexagonal, pointe taillée. */
  pencil: [
    [13, 0],
    [6, 5],
    [-9, 5],
    [-11, 2],
    [-11, -2],
    [-9, -5],
    [6, -5],
  ],
  /** Le sceau : losange épais, la seule silhouette à deux axes de symétrie. */
  seal: [
    [12, 0],
    [0, 10],
    [-12, 0],
    [0, -10],
  ],
}

/** Rayon de la plume, dérivé d'elle et jamais recopié : c'est l'étalon des autres. */
export const NIB_MAX_RADIUS = Math.max(...NIBS.quill.map(([x, y]) => Math.hypot(x, y)))

/** Attribut `d` d'un `<path>` SVG, pour les vitrines du menu. */
export function nibPath(skin: SkinId): string {
  const pts = NIBS[skin]
  return `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`
}
