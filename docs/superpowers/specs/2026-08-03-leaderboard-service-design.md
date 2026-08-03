# Service de classement et UI

Étape 3 du chantier décrit dans `2026-08-02-leaderboard-architecture-design.md`. Les étapes 1
(`2026-08-02-sim-portable-design.md`) et 2 (`2026-08-03-replay-design.md`) sont livrées et
fusionnées : la simulation rejoue au bit près sous Node, Chromium, Firefox et WebKit, et
`npm run replay partie.bin` recalcule un score depuis un fichier de replay.

## 1. Intention

Rendre le classement en ligne. Le serveur ne croit jamais le score qu'on lui envoie — il ne
le reçoit même pas : il reçoit un replay, le rejoue, et calcule le score lui-même.

Livrable vérifiable : un joueur meurt, clique « Publier mon score », voit son rang ; un autre
joueur, sur une autre machine, voit ce score au menu.

## 2. Ce que la mesure a supprimé

La spec d'architecture justifiait toute une machinerie asynchrone par une estimation :
« rejouer 36 000 pas prend de l'ordre de la dizaine de secondes ». **Mesuré, c'est 234 ms** —
un facteur quarante. Une minute de jeu se rejoue en 26 ms, cinq minutes en 120 ms, et la run
mesurée est immortelle, donc c'est un pire cas que le jeu réel n'atteint pas.

| Mesure | Valeur |
| --- | --- |
| 3 600 pas (1 min) | 26 ms, 21 Ko bruts |
| 18 000 pas (5 min) | 120 ms, 106 Ko bruts |
| 36 000 pas (10 min) | 234 ms, 211 Ko bruts |

Tombent donc, avec leur justification : la file d'attente en Postgres, le
`SELECT … FOR UPDATE SKIP LOCKED`, le `worker_threads`, l'état `PENDING`, le `202 Accepted`,
le sondage côté client et les états d'UI qui allaient avec. **La vérification se fait dans la
requête.** Le joueur voit son rang au lieu d'un « en cours de vérification ».

C'est la troisième estimation de ce chantier que la mesure corrige — après « gzip ramène à
quelques Ko » (mesuré : ratio 0,60) et « un second rejeu calculerait le score de travers »
(mesuré : faux). La règle vaut d'être écrite : **dans ce projet, aucun chiffre n'entre dans
une décision d'architecture sans avoir été mesuré.**

## 3. Décisions

| Sujet | Décision | Raison |
| --- | --- | --- |
| Durée de vie d'un score | Vérifié une fois à la soumission, verdict conservé | `SIM_VERSION` change au moindre octet de `sim/`, commentaire compris. Un classement indexé dessus serait vide la plupart du temps |
| Arènes | Un seul classement, pastille mobile/bureau par ligne | `arenaId` est déjà en base : segmenter plus tard est un filtre, pas une migration |
| Graine | Tirée par le client | Fermer le farming de graines en laissant les bots ouverts serait fermer la petite porte et pas la grande |
| Vérification | Synchrone, dans la requête | 234 ms mesurés (§2) |
| Soumission | Bouton explicite sur l'écran de fin | Rien ne part sans geste du joueur |
| Affichage | Menu et écran de fin, **top 100** défilant | Un seul composant, réutilisé aux deux endroits. 100 et non 10 : c'est exactement le périmètre dont la purge garde les octets (§7), donc ce qu'on affiche est ce qu'on peut encore auditer |

## 4. L'API

Trois routes. Fastify 5, zod 4 via `fastify-type-provider-zod`, structure plate
(`routes/`, `verify/`, `db/`), conformément à la spec d'architecture §4.

### `POST /runs`

```jsonc
// requête
{ "nickname": "leo", "replay": "<gzip du .bin, en base64>" }
// 201
{ "rank": 7, "score": 19449, "total": 42, "improved": true }
```

**`rank` est celui de la meilleure ligne du pseudo, et `improved` dit si la partie
soumise est devenue cette meilleure ligne.** C'est une correction : la première
rédaction rendait le rang de la partie *soumise*, ce qui produisait des rangs
supérieurs au total dès qu'un joueur republiait moins bien que son record. Le
classement n'affichant qu'une ligne par pseudo, la partie soumise n'y figure alors
pas — mais la meilleure ligne du même pseudo, elle, y figure et compte contre elle.
Mesuré : un joueur à 100 000 qui publie une partie à 31 recevait
`{"rank": 2, "total": 1}`, et l'interface aurait affiché « 2ᵉ sur 1 ». Avec cinq
joueurs devant, « 7ᵉ sur 6 ». Ce n'est pas un cas limite : c'est le cas normal de
quiconque joue souvent.

Les deux champs donnent au front les deux messages dont il a besoin — « nouveau
record, 3ᵉ » et « 31 points, ton record tient à 100 000, 3ᵉ » — et le rang ne peut
plus dépasser le total.

Le `score` rendu ici est **arrondi**, comme celui de `GET /leaderboard` et pour la même raison
(voir plus bas) : c'est le nombre que le joueur vient de lire sur son écran de fin, et lui en
renvoyer un autre lui ferait croire à un désaccord.

Le corps ne porte **aucun score revendiqué**. Le serveur décode, rejoue, et calcule score,
vague, pas et `arenaId` depuis le replay lui-même : il n'existe donc aucun écart possible
entre ce que le client affirme et ce qui est stocké, et aucun code à écrire pour arbitrer un
tel écart.

Le replay voyage en base64 dans du JSON. Cela coûte 33 % de volume sur une charge déjà
compressée ; en échange, un seul type de contenu, validé de bout en bout par zod, sans
greffon multipart et sans lecture manuelle d'un flux binaire.

Refus, tous en `422` avec un `reason` distinct et un message destiné à l'utilisateur :

| `reason` | Cause |
| --- | --- |
| `stale_build` | La `SIM_VERSION` du replay n'est pas celle du serveur — voir §6 |
| `too_long` | Plus de 72 000 pas |
| `not_dead` | `alive === true` : la partie ne s'est pas terminée par une mort |
| `already_submitted` | Ce replay a déjà été soumis (hachage identique) |
| `malformed` | Magie, version de format, longueur ou id d'arène invalides |

### `GET /leaderboard?nickname=leo`

```jsonc
{
  "top": [{ "rank": 1, "nickname": "ana", "score": 24310, "wave": 7, "arenaId": 0, "createdAt": "…" }],
  "you": { "rank": 47, "nickname": "leo", "score": 8420, "wave": 3, "arenaId": 1, "createdAt": "…" }
}
```

`top` porte les **100 premiers**, et le panneau défile. C'est le même périmètre que celui
dont §7 garde les octets de replay : ce qui est affiché est exactement ce qui reste
auditable, et les deux nombres ne peuvent plus diverger. Cent lignes pèsent une dizaine de
kilo-octets, donc l'appel reste sans conséquence.

Le paramètre `nickname` est **facultatif**. Fourni, la réponse porte en plus `you` : la
meilleure ligne de ce pseudo et son rang, **et seulement s'il est hors du top rendu** — un
joueur déjà visible dans la liste n'a pas besoin d'être répété en pied. Absent ou inconnu,
`you` est absent.

C'est la seule capacité que le lot 2 ajoute au service, et elle vient d'une décision
d'interface : le panneau du menu affiche une ligne « toi » sous les cent premiers, pour que le
classement dise quelque chose à qui n'y figurera jamais.

**Les rangs se calculent partout par la même formule : `count(strictement meilleur) + 1`
sur l'ensemble dédoublonné.** C'est une correction d'un défaut relevé à la relecture du lot 1 :
`rankOf` comptait ainsi, mais le classement numérotait par index de tableau. Sur une égalité de
score, un joueur s'entendait donc dire « 1ᵉʳ » à la publication et se voyait « 3ᵉ » au menu —
et la ligne « toi » ci-dessus, qui vient de la première formule, aurait affiché un rang
introuvable dans la liste juste au-dessus. Le rang de compétition (1, 1, 1, 4) est la formule
retenue des deux côtés.

**Au plus une ligne par pseudo**, la meilleure. Sans comptes, un pseudo n'est pas une
identité et cette règle se contourne en changeant de pseudo — elle n'est pas là pour ça, mais
pour qu'un bon joueur n'occupe pas les dix lignes à lui seul. C'est une règle d'affichage,
énoncée comme telle.

**Le rang se calcule sur cet ensemble dédoublonné**, pas sur toutes les parties, et c'est une
précision qui manquait à la première rédaction de cette section : les deux règles cohabitant
naïvement, le classement aurait affiché des rangs troués (1, 2, 5, 9…) puisque les parties
masquées auraient continué de compter. Concrètement : on retient la meilleure partie de chaque
pseudo, puis `count(score > x) + 1` sur ce classement-là. Les égalités se départagent par
`createdAt` croissant — à score égal, le premier arrivé passe devant.

**Le score affiché est arrondi**, comme l'écran de fin l'arrondit déjà (`Math.round`). La base
garde le flottant brut. C'est le piège qui avait failli passer à l'étape 2 : la CLI de rejeu
affichait le flottant quand le jeu affichait l'arrondi, et les comparer donnait un faux écart.

### `GET /health`

Pour le healthcheck compose. Vérifie que la base répond.

## 5. Recevabilité

Ces bornes sont ce qui remplace la confiance. Elles sont calculées, pas choisies au jugé.

- **72 000 pas (20 minutes).** 432 Ko bruts, environ 260 Ko compressés au ratio 0,60 mesuré à
  l'étape 2, et **470 ms de rejeu bloquant**. C'est le coût réel du choix synchrone et il faut
  l'énoncer : pendant ces 470 ms, la boucle d'événements Node ne fait rien d'autre. À une
  soumission par seconde le service tient sans effort ; à dix, il faudra revenir ici.
  La borne est un **argument obligatoire de `replayRun`**, pas une note dans un document :
  `replayRun(replay, { maxSteps })`. Un paramètre requis ne s'oublie pas.
- **Corps limité à 768 Ko** (`bodyLimit` Fastify). Le calcul doit passer par le base64, sans
  quoi la borne serait trop serrée d'un tiers : 432 Ko bruts → environ 260 Ko compressés →
  **347 Ko en base64**, plus l'enveloppe JSON. 768 Ko laisse donc un facteur deux sur la
  charge réelle transmise, et non sur la charge compressée.
- **Décompression bornée à 1 Mo** (`gunzipSync(…, { maxOutputLength })`). Sans cela, 509 Ko de
  zéros se détendent en 500 Mo.
- **`alive === false` exigé.** Le replay doit se terminer par la mort du joueur. Sinon un
  tricheur tronque ses entrées à son pic de score et le rejeu confirme docilement un score que
  personne n'a fini de jouer.
- **Hachage SHA-256 du replay décompressé, en clé unique.** Ferme la resoumission de la
  même partie. **Sur le `.bin` décompressé et non sur les octets reçus**, et c'est une
  correction : le client choisit son flux gzip, donc recompresser la même partie à un autre
  niveau donne un autre hachage. Mesuré : la même partie soumise en `level: 9` puis en
  `level: 1` passait deux fois, sous deux pseudos, et occupait deux lignes du classement.
  Le `.bin` est la forme canonique — `decodeReplay` en valide déjà la longueur exacte.
  Ce n'est pas une subtilité d'attaquant : `CompressionStream('gzip')` du navigateur ne
  produit pas le même flux que `node:zlib`, donc le cas se présente dès que le lot 2 existe.

L'ordre compte : décoder et vérifier l'en-tête **avant** de rejouer. Le nombre de pas est dans
l'en-tête, donc le plafond se contrôle sans avoir dépensé une seule milliseconde de
simulation.

**`replayRun` n'est pas réentrant** — `resetGlobals()` remet à zéro l'état bitECS *global au
processus*. La contrainte est satisfaite ici par construction, puisque la vérification est
synchrone et qu'aucun `await` ne sépare l'appel de son résultat. Elle cesserait de l'être au
premier `await` introduit dans ce chemin : c'est écrit dans la docstring de `replayRun`, et
ça doit rester vrai.

## 6. Le piège du build périmé

`replayRun` refuse tout replay dont la `SIM_VERSION` diffère de la sienne. Donc **après chaque
déploiement, un joueur qui avait gardé son onglet ouvert reçoit un refus** : son jeu tourne
sur l'ancien code, son replay porte l'ancienne empreinte.

Ce n'est pas un cas limite, c'est le cas normal, et il touche exactement les joueurs les plus
assidus. Le message doit dire « ton jeu n'est plus à jour, recharge la page », pas « replay
invalide » — un joueur honnête ne doit jamais lire qu'on soupçonne son score. L'écran de fin
propose le rechargement, et la partie reste consultable.

Il n'y a pas de contournement possible : accepter un replay d'une autre version reviendrait à
le rejouer sous un code différent de celui joué, c'est-à-dire à calculer un score faux — ce
que toute l'étape 2 existe pour empêcher.

## 7. Ce que la base garde

Une table, `Run` :

| Colonne | Note |
| --- | --- |
| `id` | |
| `nickname` | 1 à 20 caractères après élagage |
| `seed`, `arenaId`, `simVersion` | Lus dans le replay, jamais dans la requête |
| `score`, `wave`, `steps` | Calculés par le rejeu |
| `replay` | `bytea`, gardé pour le top 100 seulement |
| `replayHash` | SHA-256, unique |
| `createdAt` | Départage les égalités de score |

Index sur `(score desc, createdAt asc)`.

**Pas de hachage d'IP.** La spec d'architecture en prévoyait un pour un rate-limit ; le
rate-limit n'est pas retenu, et garder une donnée personnelle sans usage n'est pas gratuit.
Le jour où il faudra brider, on ajoutera les deux ensemble.

**Les octets du replay ne sont gardés que pour le top 100.** Le reste est purgé après
vérification : le verdict est calculé et définitif, et jusqu'à 260 Ko par partie sur un petit
serveur finiraient par compter — le top 100 conservé plafonne à environ 26 Mo. Ce qu'on perd est la capacité de ré-auditer une partie hors du top —
ce qui, le verdict étant conservé et non recalculable de toute façon après un changement de
`sim/`, ne coûte rien de réel.

## 8. Le front

- **Pseudo** : demandé au premier clic sur « Publier mon score », mémorisé en `localStorage`,
  et **modifiable ensuite dans l'écran Réglages**. Élagué, 1 à 20 caractères. Aucune unicité,
  aucune modération — voir §11.

  L'écran de réglages doit dire que **les scores déjà publiés gardent l'ancien nom** : sans
  comptes, rien ne les relie au joueur, donc rien ne peut les renommer. Le taire ferait
  découvrir la chose au pire moment, en cherchant son ancien score au classement.

  Le front **normalise avant d'envoyer** : élagage, retrait des caractères de contrôle et des
  marques bidirectionnelles, et échappement à l'affichage. Le serveur ne contrôle que la
  longueur (§11), donc un pseudo contenant `U+202E` ou un saut de ligne passerait et casserait
  la mise en page du tableau.
- **Écran de fin** : un bouton « Publier mon score ». Après succès, le classement s'affiche
  avec la ligne du joueur mise en évidence et **amenée dans la vue** — sur cent lignes, une
  mise en évidence hors écran ne sert à rien. Hors du top 100, son rang en pied.
- **Menu** : le même composant de classement, consultable sans mourir.
- **Compression** : `CompressionStream('gzip')` dans le navigateur, `node:zlib` côté serveur —
  l'asymétrie était déjà prévue à l'étape 2, et c'est ce qui garde `sim/` portable.
- **Hors ligne** : le jeu reste jouable. Un échec réseau laisse le bouton disponible et dit
  que la publication a échoué, sans bloquer la relance.
- **i18n et tactile** : les deux surfaces suivent ce qui existe (`front/src/i18n/locales`,
  arène mobile).

## 9. Déploiement

`deploy/compose.yaml` gagne deux services :

- **`postgres`** : PostgreSQL 16, volume nommé, healthcheck, non exposé au proxy.
- **`back`** : le service Fastify, routeur Traefik sur `api.inkpoint.qwetle.fr`, CORS limité à
  l'origine du front. `prisma migrate deploy` au démarrage du conteneur.

Un `deploy/Dockerfile.back`, sur le modèle de celui du front, avec les trois dossiers
(`back/`, `sim/`, plus la racine du workspace) — `sim/` est compilé depuis la source, pas
installé.

`TRAEFIK_HOST` est renommé en `TRAEFIK_FRONT_HOST` **à cette étape**, comme le commentaire de
`compose.yaml` l'a prévu : c'est le moment où `deploy/.env` doit de toute façon être édité
pour Postgres, donc le seul où le renommage ne laisse pas une variable vide résoudre en
`Host()` vide et un 404 silencieux.

## 10. Vérification

- **Unitaires** : bornes, validation du pseudo, calcul du rang, règle « une ligne par pseudo ».
- **Intégration, sur un vrai Postgres** : chaque `reason` de refus du §4, le dédoublonnage par
  hachage, la purge du top 100.
- **Bout en bout, et c'est le test qui compte** : un replay produit par le front, envoyé à
  l'API, dont le score recalculé côté serveur **égale celui affiché par le jeu, après
  arrondi**. Sans ce test, tout le reste vérifie que le service se comporte bien sans vérifier
  qu'il calcule la bonne chose.
- **Falsification obligatoire** : chaque garde-fou du §5 doit être vu en train de refuser.
  Un test qu'on n'a jamais vu échouer n'est pas un garde-fou — six gardes de l'étape 2
  passaient au vert pendant que ce qu'ils gardaient était cassé, et aucun n'a été trouvé
  autrement qu'en cassant le code exprès.

## 11. Ce que ce service ne ferme pas

- **Les bots.** Un programme qui pilote le jeu produit un replay parfaitement valide. Le rejeu
  ferme la falsification du score, pas l'automatisation — et c'est assumé depuis la spec
  d'architecture.
- **Le farming de graines.** Conséquence directe du point précédent : défendre contre le choix
  de la graine en laissant les bots ouverts serait dépenser une route, une table et un chemin
  d'échec hors ligne pour fermer la plus petite des deux portes.
- **Les pseudos.** Aucune unicité, aucune modération, aucun filtre. Deux joueurs peuvent
  porter le même nom, et rien n'empêche un pseudo insultant d'atteindre le classement. Sur un jeu
  à la fréquentation encore nulle c'est un risque accepté, pas un oubli ; le jour où il se
  matérialise, la réponse est une liste de blocage et un bouton de suppression, pas des
  comptes.

## 12. Découpage

Deux lots, chacun vérifiable seul, dans cet ordre :

| Lot | Contenu | Vérifiable par |
| --- | --- | --- |
| **1** | `back/` : schéma Prisma, trois routes, vérification, bornes, tests d'intégration ; `deploy/` : Postgres, service back, sous-domaine | `curl` contre l'API locale, et le service qui démarre en compose |
| **2** | `front/` : pseudo, bouton de publication, panneau de classement, i18n, tactile, chemins d'erreur | Le navigateur : jouer, mourir, publier, voir son rang |

Le lot 1 ne dépend que de ce qui est déjà livré. Le lot 2 dépend du lot 1.
