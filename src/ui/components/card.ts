import { t } from '@/i18n'
import type { UpgradeDef } from '@/sim/data/upgrades'
import { icon } from '../icons'

/** Rareté distinguée sans couleur nouvelle : la mythique passe en négatif (fond clair, encre sombre), seule inversion du lot — elle se remarque avant même d'être lue. */
const RARITY_CLASS: Record<UpgradeDef['rarity'], string> = {
  common: 'border border-paper/45 bg-transparent text-paper',
  rare: 'border-2 border-blast bg-transparent text-paper shadow-[0_0_18px_-4px_#ffd166] ring-1 ring-inset ring-blast/40',
  mythic: 'border-2 border-paper bg-paper text-ink animate-[boil_0.16s_steps(1,end)_infinite]',
}

export function renderCard(card: UpgradeDef, selected: boolean): string {
  const iconKind = card.requires ?? 'blast'
  return `
    <div class="flex w-52 flex-col items-center gap-3 rounded px-4 py-6 text-center transition-transform ${RARITY_CLASS[card.rarity]} ${selected ? 'scale-105' : 'scale-95 opacity-70'}">
      <span>${icon(iconKind, 34)}</span>
      <h3 class="text-base leading-tight">${t(`upgrade.${card.id}.name`)}</h3>
      <p class="text-xs leading-snug opacity-75">${t(`upgrade.${card.id}.desc`)}</p>
      <span class="mt-1 text-[10px] tracking-[0.2em] opacity-60">${t(`rarity.${card.rarity}`)}</span>
    </div>
  `
}
