import type { UpgradeDef } from '../data/upgrades'
import { createRng } from '../rng'
import { drawUpgrades } from './draw'
import type { RunProgress } from './progress'

/**
 * L'offre de cartes montrée à la fin d'une vague : `createRng(seed + wave)` puis
 * `drawUpgrades`, et rien d'autre.
 *
 * Point d'entrée **unique** de `front/src/app/game.ts` et de `sim/replay/run.ts` —
 * avant cette extraction, les deux recopiaient la même dérivation de graine et le
 * même appel. Une copie qui aurait dérivé (un sel ajouté au rng, un champ ajouté à
 * `DrawState` d'un seul côté) aurait fait rejeter en silence tout score honnête :
 * le serveur aurait tiré une offre différente de celle vue par le joueur, sans
 * qu'aucun test ne puisse le voir puisque les deux chemins restaient corrects
 * chacun pris isolément. Un seul appelant supprime la possibilité même de diverger.
 *
 * Ne consomme jamais `world.rng` : le tirage des cartes doit rester indépendant du
 * flux déterministe de la simulation (spec §3.5) — c'est pour ça que `seed + wave`
 * est dérivé ici plutôt que passé un `Rng` déjà avancé.
 */
export function offerUpgrades(seed: number, wave: number, progress: RunProgress): UpgradeDef[] {
  return drawUpgrades(createRng(seed + wave), {
    wave,
    ownedIds: progress.ownedIds,
    mythicTaken: progress.mythicTaken,
    seenPowerups: progress.seenPowerups,
  })
}
