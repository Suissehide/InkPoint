/**
 * Motifs de refus qu'un client de `POST /runs` peut recevoir (spec §4), plus
 * les trois qu'ajoute la couche HTTP (413/4xx/500, `back/src/server.ts`).
 *
 * Vit dans `shared/`, PAS dans `back/src/verify/refusal.ts` (où ce type a
 * d'abord été posé) : `front/` et `back/` sont deux images Docker construites
 * et déployées séparément (`deploy/Dockerfile`, `deploy/Dockerfile.back`), et
 * `deploy/Dockerfile` ne copie jamais `back/` dans le contexte de build du
 * front — mesuré, un `import type` posé sur `back/src/verify/refusal.ts`
 * depuis `front/` compile bien en local (le dépôt entier est sur disque) mais
 * fait échouer `tsc --noEmit` dans le conteneur front isolé, où
 * `back/src/verify/refusal.ts` n'existe simplement pas. `shared/`, comme
 * `sim/`, n'a pas de `package.json` propre et est copié tel quel dans les
 * DEUX images (`COPY shared ./shared`, aux côtés de `COPY sim ./sim`) — c'est
 * ce qui rend un `import type` réellement résolvable des deux côtés, y
 * compris en isolation Docker, sans faire dépendre une image de l'arbre
 * source de l'autre.
 *
 * `back/src/verify/refusal.ts` réexporte ces trois types pour ne pas changer
 * ses points d'import existants ; c'est CE fichier-ci, et non celui-là, que
 * `front/src/ui/screens/gameover.ts` importe (toujours en `import type` —
 * jamais en valeur : ce module ne doit rien tirer qui alourdirait le bundle
 * du jeu, et n'a d'ailleurs aucune valeur à exporter).
 */
export type RefusalReason =
  | 'stale_build'
  | 'too_long'
  | 'not_dead'
  | 'already_submitted'
  | 'malformed'

/**
 * Les trois motifs que seule la couche HTTP produit (`back/src/server.ts`,
 * `setErrorHandler`), en dehors de tout refus métier : une charge au-delà de
 * `bodyLimit` (413), une requête qui ne passe même pas la validation zod du
 * corps (4xx), ou une vraie panne (500).
 */
export type HttpErrorReason = 'too_large' | 'invalid_request' | 'server_error'

/**
 * Tout `reason` qu'un client de `POST /runs` peut recevoir. Le front l'importe
 * en type pour lier son tableau de messages
 * (`gameover.ts#REFUSAL_MESSAGE_KEYS`) à ce que le serveur expose : un motif
 * ajouté ici sans mise à jour du tableau échoue `tsc --noEmit` côté front
 * plutôt que de tomber en silence sur le message générique. Voir la
 * docstring de `REFUSAL_MESSAGE_KEYS` pour l'autre moitié de cette garantie —
 * pourquoi elle reste partielle malgré tout (deux images déployées
 * indépendamment).
 */
export type ApiErrorReason = RefusalReason | HttpErrorReason
