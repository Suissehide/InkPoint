import { storage } from '@/app/storage'
import { SKIN_IDS, type SkinId } from '@/render/views/nibs'
import { ACHIEVEMENT_BY_SKIN, ACHIEVEMENTS } from './catalog'

const KEY_UNLOCKED = 'achievements'
const KEY_SKIN = 'skin'
/** Le tracé d'origine : gratuit, et le repli de tous les cas douteux. */
const DEFAULT_SKIN: SkinId = 'quill'

const KNOWN_IDS = new Set(ACHIEVEMENTS.map((a) => a.id))

/**
 * Les succès acquis, filtrés par le catalogue courant : renommer ou retirer un
 * succès ne doit pas faire ressortir un identifiant mort d'une vieille
 * sauvegarde, ni casser l'écran de vitrine qui itère dessus.
 */
export function readUnlocked(): Set<string> {
  const raw = storage.get<unknown>(KEY_UNLOCKED, [])
  if (!Array.isArray(raw)) {
    return new Set()
  }
  return new Set(raw.filter((id): id is string => typeof id === 'string' && KNOWN_IDS.has(id)))
}

/** Écrit immédiatement : un onglet fermé en pleine partie ne doit rien coûter. */
export function unlock(id: string): void {
  const unlocked = readUnlocked()
  if (unlocked.has(id)) {
    return
  }
  unlocked.add(id)
  storage.set(KEY_UNLOCKED, [...unlocked])
}

/** La plume d'abord, puis les tracés gagnés, dans l'ordre de `SKIN_IDS`. */
export function unlockedSkins(unlocked: ReadonlySet<string>): SkinId[] {
  return SKIN_IDS.filter((skin) => {
    const source = ACHIEVEMENT_BY_SKIN[skin]
    return source === undefined || unlocked.has(source.id)
  })
}

/**
 * Le tracé équipé, validé contre ce que le joueur a réellement gagné : les
 * deux clés vivent séparément dans `localStorage`, et effacer l'une sans
 * l'autre laisserait sinon une silhouette non méritée.
 */
export function readSkin(unlocked: ReadonlySet<string>): SkinId {
  const raw = storage.get<unknown>(KEY_SKIN, DEFAULT_SKIN)
  const available = unlockedSkins(unlocked)
  const found = available.find((skin) => skin === raw)
  return found ?? DEFAULT_SKIN
}

export function equipSkin(skin: SkinId): void {
  storage.set(KEY_SKIN, skin)
}
