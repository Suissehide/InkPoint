import { POWERUP_BY_ID, type PowerUpKind } from '../data/powerups'
import type { UpgradeDef } from '../data/upgrades'
import type { SimWorld } from '../world'
import type { RunStats } from './stats'

/**
 * L'historique d'une run dont dépend le tirage des cartes : exactement les trois
 * champs que `DrawState` réclame en plus de la vague.
 *
 * Vit dans `sim/` et non dans `front/src/app/` parce qu'il alimente un calcul
 * **déterministe** — même raison que le hitstop à l'étape 1. Sans cela, le rejeu
 * sans tête devrait importer le front pour reproduire l'offre de cartes, et
 * l'image Docker du back devrait embarquer l'arbre du front.
 *
 * Délibérément séparé de `RunStats` : celui-ci traverse `stepWorld` à chaque pas
 * et les systèmes le lisent, alors qu'aucun système ne lit `ownedIds`. Les
 * fusionner mettrait du poids mort dans le chemin chaud et brouillerait ce que
 * chacun des deux types signifie.
 */
export interface RunProgress {
  /** Ids des cartes prises, doublons compris — la pondération du tirage s'en sert. */
  ownedIds: string[]
  mythicTaken: boolean
  seenPowerups: Set<PowerUpKind>
}

export function createRunProgress(): RunProgress {
  return { ownedIds: [], mythicTaken: false, seenPowerups: new Set() }
}

/**
 * Absorbe les événements du pas qui vient de s'écouler. À appeler **après**
 * `stepWorld`, qui purge `world.events` en entrant : le tableau contient alors
 * les événements de ce pas-là.
 */
export function absorbEvents(progress: RunProgress, world: SimWorld): void {
  for (const event of world.events) {
    if (event.type === 'powerupPicked') {
      const kind = POWERUP_BY_ID[event.kind]
      // `POWERUP_BY_ID` est un tableau creux : un identifiant hors plage rend
      // `undefined`, et l'insérer dans le `Set` empoisonnerait le tirage.
      if (kind) {
        progress.seenPowerups.add(kind)
      }
    }
  }
}

/**
 * Applique une carte choisie. Les effets vont dans `stats`, que les systèmes
 * lisent ; l'historique va dans `progress`, que le prochain tirage lit.
 */
export function takeUpgrade(card: UpgradeDef, stats: RunStats, progress: RunProgress): void {
  card.apply(stats)
  progress.ownedIds.push(card.id)
  if (card.rarity === 'mythic') {
    progress.mythicTaken = true
  }
}
