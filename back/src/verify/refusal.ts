/**
 * `RefusalReason`, `HttpErrorReason` et `ApiErrorReason` vivent dans
 * `shared/api-errors.ts`, pas ici : voir sa docstring pour pourquoi ce
 * fichier-ci n'est PAS ce que `front/` importe (un `import type` posé
 * directement sur ce module compile en local mais casse le build Docker
 * isolé du front, mesuré). Réexportés ici pour ne rien changer aux points
 * d'import déjà en place dans `back/` (`server.ts`, ce fichier lui-même).
 */
import type { RefusalReason } from '@shared/api-errors'

export type { ApiErrorReason, HttpErrorReason, RefusalReason } from '@shared/api-errors'

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
