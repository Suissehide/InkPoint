/** Déviation maximale d'un sommet du cadre, en pixels. */
const JITTER_PX = 2.5

/**
 * Déviation d'un sommet du cadre, dérivée de l'identifiant de la carte et
 * jamais d'un tirage : `render()` est rappelé à chaque déplacement dans le
 * menu, et un cadre retiré au hasard scintillerait à chaque changement de
 * sélection.
 */
export function frameJitter(id: string, index: number): number {
  let h = index * 2654435761
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0
  }
  return ((h % 1000) / 999) * 2 * JITTER_PX - JITTER_PX
}

/**
 * Quadrilatère légèrement irrégulier : un trait de plume, pas un filet.
 * Partagé par les trois familles de cartes — améliorations, succès, tracés :
 * recopié, il divergerait au premier ajustement de `JITTER_PX`.
 */
export function inkFrame(id: string, inset: number, seedOffset: number): string {
  const j = (n: number): number => frameJitter(id, n + seedOffset)
  const w = 100
  const h = 140
  const pts = [
    [inset + j(0), inset + j(1)],
    [w - inset + j(2), inset + j(3)],
    [w - inset + j(4), h - inset + j(5)],
    [inset + j(6), h - inset + j(7)],
  ]
  return `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`
}
