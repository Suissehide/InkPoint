import { ACHIEVEMENT_BY_SKIN } from '@/app/achievements/catalog'
import { t } from '@/i18n'
import { nibPath, type SkinId } from '@/render/views/nibs'
import { inkFrame } from './ink-frame'

export interface NibTileState {
  unlocked: boolean
  equipped: boolean
  selected: boolean
}

/**
 * La silhouette est rendue par `nibPath`, la même liste de sommets que Pixi
 * trace en jeu : la vitrine ne peut pas montrer autre chose que ce qu'on
 * jouera.
 */
export function renderNibTile(skin: SkinId, state: NibTileState): string {
  const source = ACHIEVEMENT_BY_SKIN[skin]
  const footer = state.equipped
    ? `<span class="ui-2xs tracking-[0.2em] opacity-70">${t('skins.equipped')}</span>`
    : state.unlocked
      ? ''
      : `<span class="ui-2xs tracking-[0.15em] opacity-55">${source ? t(`achievement.${source.id}.name`) : ''}</span>`

  return `
    <div class="relative aspect-[5/7] w-[calc(var(--ui)*9.5)] overflow-hidden rounded text-paper transition-transform ${state.selected ? 'scale-105' : 'scale-95'} ${state.unlocked ? '' : 'opacity-40'}">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
        <path d="${inkFrame(skin, 4, 0)}" fill="none" class="${state.selected ? 'stroke-paper/75' : 'stroke-paper/40'}" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="flex h-full flex-col items-center justify-center gap-[calc(var(--ui)*0.5)] px-[calc(var(--ui)*0.6)] text-center">
        <span class="text-[calc(var(--ui)*3)]"><svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true"><path d="${nibPath(skin)}" fill="currentColor" /></svg></span>
        <h3 class="ui-sm leading-tight">${t(`skin.${skin}.name`)}</h3>
        ${footer}
      </div>
    </div>
  `
}
