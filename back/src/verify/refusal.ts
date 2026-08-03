/** Les raisons de refus exposées au client, une par cause distincte (spec §4). */
export type RefusalReason =
  | 'stale_build'
  | 'too_long'
  | 'not_dead'
  | 'already_submitted'
  | 'malformed'

/**
 * Un refus attendu, par opposition à une panne. Les routes le traduisent en
 * `422` ; tout ce qui n'est pas un `Refusal` reste un `500`, parce qu'une
 * panne du serveur ne doit jamais ressembler à une faute du joueur.
 */
export class Refusal extends Error {
  constructor(
    readonly reason: RefusalReason,
    message: string,
  ) {
    super(message)
    this.name = 'Refusal'
  }
}
