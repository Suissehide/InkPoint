import type { AchievementDef } from '@/app/achievements/catalog'
import { t } from '@/i18n'
import { nibPath } from '@/render/views/nibs'
import { inkFrame } from './ink-frame'

/**
 * Composant frère de `renderCard`, pas une extension : celle-ci est typée
 * `UpgradeDef` et sa lecture de rareté n'a pas d'équivalent ici. Les deux
 * partagent la géométrie (`card-grid.ts`) et le cadre (`ink-frame.ts`), pas la
 * structure.
 *
 * Un succès verrouillé garde son titre et sa condition, en creux : rien n'est
 * caché, la condition est ce qui donne envie d'y retourner.
 */
export function renderAchievementCard(def: AchievementDef, unlocked: boolean): string {
  const frame = inkFrame(def.id, 4, 0)
  const stroke = unlocked ? 'stroke-paper/55' : 'stroke-paper/25'
  const glyph = def.skin
    ? `<svg viewBox="-16 -16 32 32" width="1.85em" height="1.85em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg>`
    : ''
  const reward = def.skin
    ? `<span class="ui-2xs tracking-[0.15em] opacity-60">${t('achievements.reward', { skin: t(`skin.${def.skin}.name`) })}</span>`
    : ''
  const state = unlocked
    ? `<span class="ui-2xs tracking-[0.2em] opacity-60">${t(`family.${def.family}`)}</span>`
    : `<span class="ui-2xs tracking-[0.2em] opacity-45">${t('achievements.locked')}</span>`

  return `
    <div class="relative aspect-[5/7] w-[calc(var(--ui)*9.5)] overflow-hidden rounded text-paper ${unlocked ? '' : 'opacity-45'}">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
        <path d="${frame}" fill="none" class="${stroke}" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="flex h-full flex-col items-center justify-center gap-[calc(var(--ui)*0.4)] px-[calc(var(--ui)*0.8)] text-center">
        ${glyph}
        <h3 class="ui-sm leading-tight">${t(`achievement.${def.id}.name`)}</h3>
        <p class="ui-xs leading-snug opacity-75">${t(`achievement.${def.id}.desc`)}</p>
        ${reward}
        ${state}
      </div>
    </div>
  `
}
