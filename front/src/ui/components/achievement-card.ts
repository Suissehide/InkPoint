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
 * Ne rend QUE des succès acquis : la vitrine n'affiche pas ce qui reste à
 * trouver, seulement le compteur (`menu.ts`). Ce composant n'a donc pas d'état
 * « verrouillé » — un succès qu'on n'a pas gagné n'a pas de carte du tout.
 */
export function renderAchievementCard(def: AchievementDef): string {
  // `1em` sur le SVG, la taille posée sur le conteneur : sans ancêtre en
  // `text-[calc(var(--ui)*…)]`, `em` se résout contre la taille de police par
  // défaut du navigateur et le pictogramme ne suit plus la rampe `--ui`
  // (voir `card.ts`, qui applique le même schéma).
  const glyph = def.skin
    ? `<span class="text-[calc(var(--ui)*1.85)]"><svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg></span>`
    : ''
  const reward = def.skin
    ? `<span class="ui-2xs tracking-[0.15em] opacity-60">${t('achievements.reward', { skin: t(`skin.${def.skin}.name`) })}</span>`
    : ''

  return `
    <div class="relative aspect-[5/7] w-[calc(var(--ui)*9.5)] overflow-hidden rounded text-paper">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
        <path d="${inkFrame(def.id, 4, 0)}" fill="none" class="stroke-paper/55" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="flex h-full flex-col items-center justify-center gap-[calc(var(--ui)*0.4)] px-[calc(var(--ui)*0.8)] text-center">
        ${glyph}
        <h3 class="ui-sm leading-tight">${t(`achievement.${def.id}.name`)}</h3>
        <p class="ui-xs leading-snug opacity-75">${t(`achievement.${def.id}.desc`)}</p>
        ${reward}
        <span class="ui-2xs tracking-[0.2em] opacity-60">${t(`family.${def.family}`)}</span>
      </div>
    </div>
  `
}
