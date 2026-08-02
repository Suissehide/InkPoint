import { storage } from '@/app/storage'

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Le réglage explicite du joueur l'emporte ; sinon on respecte la préférence
 * système. Désactive boil, secousse, particules et le pouls de la vignette —
 * pas le hitstop ni le ralenti de mort, qui ne déplacent rien à l'écran
 * (voir `src/app/juice.ts`).
 */
export function resolveReducedMotion(): boolean {
  const stored = storage.get<boolean | null>('reducedMotion', null)
  return stored ?? prefersReducedMotion()
}
