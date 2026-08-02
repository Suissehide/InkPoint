import { t } from '@/i18n'
import type { UpgradeDef } from '@/sim/data/upgrades'
import { icon } from '../icons'

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

/** Quadrilatère légèrement irrégulier : un trait de plume, pas un filet. */
function inkFrame(id: string, inset: number, seedOffset: number): string {
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

/**
 * La rareté se lit au nombre de traits : un cadre pour la commune, deux pour
 * la rare, un cartouche plein (inversion papier/encre) pour la mythique.
 * Aucune couleur nouvelle — la rare abandonne sa lueur ambrée diffuse, qui se
 * lisait mal, au profit d'un second trait franc de la même couleur.
 */
const RARITY: Record<UpgradeDef['rarity'], { stroke: string; traits: number; body: string }> = {
  common: { stroke: 'stroke-paper/55', traits: 1, body: 'text-paper' },
  rare: { stroke: 'stroke-blast', traits: 2, body: 'text-paper' },
  mythic: { stroke: 'stroke-ink', traits: 2, body: 'bg-paper text-ink' },
}

export function renderCard(card: UpgradeDef, selected: boolean): string {
  const iconKind = card.requires ?? 'blast'
  const r = RARITY[card.rarity]
  // `1em` et non une taille en pixels : le pictogramme suit la taille de police
  // du bloc qui le porte, donc la rampe `--ui` (main.css).
  const glyph = icon(iconKind, '1em')
  const frames = [inkFrame(card.id, 4, 0)]
  if (r.traits > 1) {
    frames.push(inkFrame(card.id, 9, 11))
  }
  return `
    <div class="relative aspect-[5/7] w-[calc(var(--ui)*9.5)] overflow-hidden rounded ${r.body} transition-transform ${selected ? 'scale-105' : 'scale-95 opacity-70'}">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
        ${frames.map((d, i) => `<path d="${d}" fill="none" class="${r.stroke}" stroke-width="${i === 0 ? 1.2 : 0.8}" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`).join('')}
      </svg>
      <div class="absolute left-[0.5em] top-[0.5em] text-[calc(var(--ui)*0.85)] opacity-80">${glyph}</div>
      <div class="absolute bottom-[0.5em] right-[0.5em] rotate-180 text-[calc(var(--ui)*0.85)] opacity-80">${glyph}</div>
      <div class="flex h-full flex-col items-center justify-center gap-[0.5em] px-[1em] text-center">
        <span class="text-[calc(var(--ui)*1.85)]">${glyph}</span>
        <h3 class="ui-sm leading-tight">${t(`upgrade.${card.id}.name`)}</h3>
        <p class="ui-xs leading-snug opacity-75">${t(`upgrade.${card.id}.desc`)}</p>
        <span class="ui-2xs mt-[0.3em] tracking-[0.2em] opacity-60">${t(`rarity.${card.rarity}`)}</span>
      </div>
    </div>
  `
}
