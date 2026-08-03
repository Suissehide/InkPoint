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
}

/**
 * Pas de quantification des entrées — prérequis du netcode v3, et ce qui rend
 * l'enregistrement d'un replay sans perte : `1/128` valant `2⁻⁷`, `k · 2⁻⁷` est
 * exactement représentable en f64.
 */
export const QUANTUM = 1 / 128

/**
 * Les champs d'`InputState`, dans l'ordre où un replay les enregistre.
 *
 * Cette liste existe pour que le format de replay suive `InputState`
 * automatiquement. Un chantier voisin (manche virtuel et inclinaison en paysage)
 * ajoute un champ `speedCap` : sans cette liste, il faudrait se souvenir d'aller
 * étendre le format, et l'oublier ferait rejouer une partie mobile avec un
 * plafond de vitesse manquant — silencieusement.
 */
export const INPUT_FIELDS = ['moveX', 'moveY'] as const satisfies readonly (keyof InputState)[]

/**
 * Garde-fou : un champ ajouté à `InputState` et absent d'`INPUT_FIELDS` casse la
 * compilation, en **nommant** le champ manquant. Vérifié : ajouter `speedCap` à
 * `InputState` seul produit
 * `error TS2322: Type 'true' is not assignable to type '"speedCap"'`.
 */
type MissingInputField = Exclude<keyof InputState, (typeof INPUT_FIELDS)[number]>
const _noMissingInputField: MissingInputField extends never ? true : MissingInputField = true
void _noMissingInputField
