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
  // Le creux d'une carte fermée se pose sur le TRAIT et sur les couleurs de
  // texte, jamais sur un ancêtre : une `opacity` de conteneur se multiplie par
  // celles des enfants, et la condition — l'invitation à rejouer, spec §9.2 —
  // tombait à 0,34 (0,45 × 0,75) et l'étiquette VERROUILLÉ à 0,20. Sur une
  // première visite, 23 cartes sur 24 sont dans cet état.
  const stroke = unlocked ? 'stroke-paper/55' : 'stroke-paper/25'
  const title = unlocked ? '' : 'text-paper/70'
  const condition = unlocked ? 'opacity-75' : 'text-paper/60'
  // `1em` sur le SVG, la taille posée sur le conteneur : sans ancêtre en
  // `text-[calc(var(--ui)*…)]`, `em` se résout contre la taille de police par
  // défaut du navigateur et le pictogramme ne suit plus la rampe `--ui`
  // (voir `card.ts`, qui applique le même schéma).
  const glyph = def.skin
    ? `<span class="text-[calc(var(--ui)*1.85)] ${unlocked ? '' : 'text-paper/55'}"><svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true"><path d="${nibPath(def.skin)}" fill="currentColor" /></svg></span>`
    : ''
  const reward = def.skin
    ? `<span class="ui-2xs tracking-[0.15em] ${unlocked ? 'opacity-60' : 'text-paper/50'}">${t('achievements.reward', { skin: t(`skin.${def.skin}.name`) })}</span>`
    : ''
  const state = unlocked
    ? `<span class="ui-2xs tracking-[0.2em] opacity-60">${t(`family.${def.family}`)}</span>`
    : `<span class="ui-2xs tracking-[0.2em] text-paper/55">${t('achievements.locked')}</span>`

  return `
    <div class="relative aspect-[5/7] w-[calc(var(--ui)*9.5)] overflow-hidden rounded text-paper">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
        <path d="${frame}" fill="none" class="${stroke}" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="flex h-full flex-col items-center justify-center gap-[calc(var(--ui)*0.4)] px-[calc(var(--ui)*0.8)] text-center">
        ${glyph}
        <h3 class="ui-sm leading-tight ${title}">${t(`achievement.${def.id}.name`)}</h3>
        <p class="ui-xs leading-snug ${condition}">${t(`achievement.${def.id}.desc`)}</p>
        ${reward}
        ${state}
      </div>
    </div>
  `
}
