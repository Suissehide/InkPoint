/**
 * Intentions du joueur, normalisées. La simulation ne connaît aucune touche.
 * Pas de champ pour les power-ups : ils se déclenchent au ramassage, pas sur
 * une entrée (spec §3.4) — voir pickupSystem.
 */
export interface InputState {
  /** -1 (gauche) à 1 (droite) */
  moveX: number
  /** -1 (haut) à 1 (bas) */
  moveY: number
  /**
   * Plafond de vitesse, en fraction de `Movement.maxSpeed`. Vaut 1 partout
   * sauf pour le joystick et l'inclinaison, seules sources analogiques.
   *
   * Champ distinct de la magnitude de `moveX`/`moveY`, et c'est délibéré :
   * la souris (`app/mouse.ts`) renvoie une intensité plancher de 0,01 en
   * croisière pour garder la commande, donc un plafond déduit de la magnitude
   * figerait le point sur place.
   */
  speedCap: number
}

/**
 * Pas de quantification des entrées — prérequis du rejeu à l'identique
 * (spec §3.5) et du netcode v3, et ce qui rend l'enregistrement d'un replay
 * sans perte : `1/128` valant `2⁻⁷`, `k · 2⁻⁷` est exactement représentable
 * en f64.
 */
export const QUANTUM = 1 / 128

/** Arrondit une composante d'entrée au pas de quantification. */
export function quantize(value: number): number {
  return Math.round(value / QUANTUM) * QUANTUM
}

/**
 * Les champs d'`InputState`, dans l'ordre où un replay les enregistre.
 *
 * Cette liste existe pour que le format de replay suive `InputState`
 * automatiquement : le garde-fou de type ci-dessous transforme un champ oublié
 * en erreur de compilation, au lieu de laisser rejouer une partie avec une
 * entrée manquante, silencieusement.
 */
export const INPUT_FIELDS = [
  'moveX',
  'moveY',
  'speedCap',
] as const satisfies readonly (keyof InputState)[]

/**
 * Garde-fou : un champ ajouté à `InputState` et absent d'`INPUT_FIELDS` casse la
 * compilation, en **nommant** le champ manquant. Vérifié : ajouter `speedCap` à
 * `InputState` seul produit
 * `error TS2322: Type 'true' is not assignable to type '"speedCap"'`.
 */
type MissingInputField = Exclude<keyof InputState, (typeof INPUT_FIELDS)[number]>
const _noMissingInputField: MissingInputField extends never ? true : MissingInputField = true
void _noMissingInputField

/**
 * Ramène chaque champ d'`input` sur la grille `QUANTUM`, en place.
 *
 * `InputSource.writeInto` (front/src/app/input-source.ts) documente cette
 * grille comme un contrat, mais rien ne l'imposait : `mouse.ts` la respecte
 * par construction (`aimInput` quantifie ses quatre retours) et `keyboard.ts`
 * n'écrit que des entiers, qui la respectent par accident, mais une source
 * analogique future (le manche virtuel que `run.ts` et ce module nomment déjà
 * en commentaire) n'a aucune garantie de le faire. `game.ts` appelle cette
 * fonction une seule fois, entre `writeInto` et `recorder.step` : la
 * simulation avance alors exactement sur ce que le replay enregistre, quelle
 * que soit la source — sans ce garde, `recorder.step`
 * (`round(v / QUANTUM)`) n'est une conversion exacte que si `writeInto` a
 * déjà quantifié, et une source qui ne le ferait pas ferait diverger le jeu
 * (qui avance sur la valeur brute) et le rejeu (qui avance sur sa version
 * arrondie) dès le premier pas.
 */
export function quantizeInput(input: InputState): void {
  for (const field of INPUT_FIELDS) {
    input[field] = Math.round(input[field] / QUANTUM) * QUANTUM
  }
}
