import { t } from '@/i18n'
import type { UpgradeDef } from '@/sim/data/upgrades'
import { icon } from '../icons'
import { renderText } from '../numeral'

/**
 * Rareté sans couleur nouvelle : la commune est un trait simple atténué, la rare
 * un double trait doré, la mythique passe **en négatif** — fond clair, encre
 * sombre. C'est l'inversion qui se remarque avant même d'être lue (spec §3.5).
 */
const RARITY_CLASS: Record<UpgradeDef['rarity'], string> = {
  common: 'border border-paper/45 bg-transparent text-paper',
  rare: 'border-2 border-blast bg-transparent text-paper shadow-[0_0_18px_-4px_#ffd166] ring-1 ring-inset ring-blast/40',
  mythic: 'border-2 border-paper bg-paper text-ink animate-[boil_0.16s_steps(1,end)_infinite]',
}

/**
 * Déviation par rapport au code fourni par la brief : `name`/`desc`/la rareté
 * passent par `renderText` (`../numeral.ts`), pas par `t(...)` brut. Les
 * descriptions de cartes contiennent des pourcentages (« +12% ») et le
 * français des accents ; or `Ink Pen` a des glyphes vides pour les chiffres,
 * la ponctuation ASCII courante ET les voyelles accentuées (vérifié dans le
 * fichier de police) — sans ce repli, la moitié de chaque description serait
 * invisible. Voir le rapport de tâche.
 */
export function renderCard(card: UpgradeDef, selected: boolean): string {
  const iconKind = card.requires ?? 'blast'
  return `
    <div class="flex w-52 flex-col items-center gap-3 rounded px-4 py-6 text-center transition-transform ${RARITY_CLASS[card.rarity]} ${selected ? 'scale-105' : 'scale-95 opacity-70'}">
      <span>${icon(iconKind, 34)}</span>
      <h3 class="font-display text-base leading-tight">${renderText(t(`upgrade.${card.id}.name`))}</h3>
      <p class="text-xs leading-snug opacity-75">${renderText(t(`upgrade.${card.id}.desc`))}</p>
      <span class="mt-1 text-[10px] tracking-[0.2em] opacity-60">${renderText(t(`rarity.${card.rarity}`))}</span>
    </div>
  `
}
