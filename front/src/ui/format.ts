/** Espace fine insécable : les chiffres du HUD sont tabulaires, le score ne
 *  doit pas changer de largeur en défilant. */
const THIN_SPACE = ' '

export function formatScore(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE)
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
