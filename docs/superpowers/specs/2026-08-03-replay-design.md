# Format de replay et rejeu sans tête

Étape 2 du chantier décrit dans `2026-08-02-leaderboard-architecture-design.md`. L'étape 1
(`2026-08-02-sim-portable-design.md`) est livrée : la simulation rejoue au bit près sous
Node, Chromium, Firefox et WebKit.

## 1. Intention

Le leaderboard ne croira jamais le score envoyé par un client : le serveur rejouera la
partie et le recalculera. Cette étape produit ce qui se rejoue — un format de replay — et le
moteur qui le rejoue, sans écran et sans serveur.

Livrable vérifiable seul : `npm run replay partie.bin` affiche un score, identique à celui
que le jeu vient d'afficher.

**Hors périmètre.** Aucun backend, aucune base, aucune route HTTP, aucune UI de classement —
c'est l'étape 3. Aucune soumission réseau : le fichier sort du navigateur par un
téléchargement en développement, rien de plus.

## 2. Ce qu'un replay doit contenir, et pourquoi si peu

L'étape 1 a réduit la surface sans le chercher. En parcourant `front/src` : **une seule
ligne écrit dans la simulation depuis l'extérieur**, `source.writeInto(run.world.input, …)`
dans la boucle à pas fixe. L'autre écriture, `run.world.timeScale = timeScaleFor(juice, …)`,
a disparu quand le hitstop est entré dans la simulation.

L'histoire déterministe d'une partie tient donc en quatre choses :

```
{ graine, arène, entrées[pas], cartes choisies[] }
```

**Correction après coup.** Cette section affirmait que l'arène n'y figurait pas, parce
qu'`ARENA` était alors une constante unique de `sim/world.ts`. Ce n'est plus vrai :
`sim/world.ts` exporte désormais aussi `ARENA_MOBILE` (896 × 504, `rangeScale: 0.7`), et
`front/src/app/game.ts` choisit entre les deux au démarrage selon
`window.matchMedia('(pointer: coarse)')`. `rangeScale` met à l'échelle les *portées* des
power-ups, donc l'arène fait partie de l'état causal d'une partie — elle doit être dans le
replay, sous peine que le rejeu d'une partie mobile diverge dès `spawnPlayer` (qui place le
joueur au centre de `world.arena`, différent selon l'arène).

Le replay porte un **id d'arène**, pas ses dimensions. Un `Replay` qui porterait
`width`/`height`/`rangeScale` directement laisserait un replay forgé déclarer n'importe quelle
arène — minuscule pour survivre plus longtemps, immense pour se donner de la place — et le
serveur, qui ne doit jamais croire ce que le client affirme, l'appliquerait sans broncher.
L'id résout contre `ARENA_BY_ID` (`sim/world.ts`, `0` = `ARENA`, `1` = `ARENA_MOBILE`), qui ne
connaît que les arènes publiées : un forgeur ne choisit plus l'arène, il choisit parmi celles
qu'on a bien voulu publier. Même raisonnement, exactement, que les cartes ci-dessous —
enregistrées par indice et non par identifiant.

Ces ids sont **figés pour toujours**, à l'identique de tout ce que ce chantier protège par
indirection : le jour où l'un d'eux changerait de sens (`1` cesserait de désigner
`ARENA_MOBILE`), tous les replays déjà stockés sous cet id se rejoueraient en silence sur une
arène différente de celle réellement jouée — un score recalculé faux sans qu'aucun contrôle
ne le signale. Ajouter une arène ajoute une entrée avec un nouvel id ; on n'en réutilise et on
n'en réaffecte jamais un existant.

Ce qui n'y figure toujours **pas**, et pour quelle raison :

| Absent | Raison |
| --- | --- |
| `timeScale` | Produit par `hitstopSystem`, à l'intérieur de la simulation |
| La graine du tirage des cartes | Dérivée : `createRng(seed + wave)` |
| Les power-ups ramassés | Produits par `pickupSystem` depuis `world.rng` |

### Les entrées sont déjà quantifiées, et l'aller-retour est sans perte

`front/src/app/mouse.ts` quantifie déjà `world.input` sur un pas de `QUANTUM = 1 / 128`, avec
ce commentaire : « Pas de quantification des entrées — prérequis du netcode v3 ». Le travail
était fait, délibérément, pour cette raison exacte.

Conséquence mesurée sur 500 000 valeurs : `k = round(v × 128)` donne `k ∈ [-128, 128]`, soit
257 valeurs, et `k / 128` reproduit le double **bit pour bit**, sans une seule exception. La
raison est que `1/128` vaut `2⁻⁷` : `k · 2⁻⁷` est exactement représentable en f64.

Cela annule une précaution que la spec d'architecture annonçait — « la quantification se fait
à la capture, au prix d'un léger déplacement du ressenti ». Il n'y a aucun déplacement : on
enregistre un entier qui existe déjà.

Le clavier, lui, écrit exactement `-1`, `0` ou `1`, donc `k ∈ {-128, 0, 128}`.

### Les cartes s'enregistrent par indice, pas par identifiant

Le replay porte **l'indice choisi** (0 à 2) et le pas où il l'a été. Enregistrer
l'identifiant de la carte serait plus simple et ouvrirait une triche immédiate : un tricheur
s'offrirait un mythique à chaque vague, et le serveur, appliquant ce qu'on lui donne,
n'aurait aucun moyen de savoir que cette carte n'était pas proposée. Le serveur doit donc
reproduire l'offre pour valider le choix.

## 3. La progression d'une run entre dans `sim/`

Le tirage `drawUpgrades(rng, state)` vit **déjà** dans `sim/upgrades/draw.ts`. Ce qui vit
encore dans `front/src/app/game.ts`, ce sont les trois états dont il dépend : `ownedIds`
(ligne ~100), `mythicTaken` (~101), et `seenPowerups`, qui vient depuis peu du traqueur de
succès (`tracker.trace.powerupsPicked`).

Tant qu'ils y restent, le rejeu sans tête devrait importer `front/` pour reproduire l'offre —
ce qui recréerait la dépendance croisée qu'on a évitée en sortant `sim/` de `front/`, et
obligerait l'image Docker du back à embarquer l'arbre du front. Même raisonnement qu'au
hitstop de l'étape 1 : un état qui alimente un calcul déterministe appartient à la
simulation.

Nouveau `sim/upgrades/progress.ts` :

```ts
export interface RunProgress {
  /** Ids des cartes prises, doublons compris — sert à la pondération du tirage. */
  ownedIds: string[]
  mythicTaken: boolean
  seenPowerups: Set<PowerUpKind>
}

export function createRunProgress(): RunProgress
/** Alimente `seenPowerups` depuis les événements du pas. */
export function absorbEvents(progress: RunProgress, world: SimWorld): void
/** Effets de la carte dans `stats`, son historique dans `progress`. */
export function takeUpgrade(card: UpgradeDef, stats: RunStats, progress: RunProgress): void
```

**Séparé de `RunStats`, volontairement.** `RunStats` traverse `stepWorld` à chaque pas et les
systèmes le lisent ; `ownedIds` et `seenPowerups` ne sont lus par aucun système. Les fusionner
mettrait du poids mort dans le chemin chaud et brouillerait ce que chaque type signifie.

Le traqueur de succès garde son propre `powerupsPicked` : les deux dérivent la même chose des
mêmes événements, et son code n'est pas touché.

## 4. Version de simulation

Un replay n'est valide que sous la version qui l'a produit. L'en-tête porte donc une
**empreinte des sources de `sim/` et de la version résolue de `bitecs`**, et le rejeu refuse
tout replay qui ne la présente pas.

La dépendance figure dans l'empreinte pour la même raison que les sources, et c'est une
correction de ce que ce document décrivait d'abord. L'allocation des `eid`, les seuils de
recyclage et l'ordre d'itération des requêtes vivent dans `bitecs`, pas dans `sim/` : un
`npm update` faisant passer `^0.3.40` à `0.3.41` change la simulation et laisse l'empreinte
intacte. Tous les replays déjà stockés seraient alors re-scorés en silence sous un code
différent, pendant que le contrôle de version — le mécanisme construit exactement pour
empêcher ça — rapporterait un accord. C'est le sens dangereux que le paragraphe suivant
reproche aux options écartées, et l'empreinte y tombait elle-même.

C'est le choix conservateur : *toute* modification de `sim/` invalide les replays antérieurs,
y compris un changement de commentaire. Une invalidation inutile, jamais dangereuse. Les deux
autres options invalident **moins** que nécessaire, chacune dans le sens dangereux :

- réutiliser `REFERENCE_DIGEST` hériterait de son trou de couverture documenté — la run de
  référence n'atteint ni `death.ts` (scission à la mort) ni `shard.ts`, donc modifier ces
  systèmes changerait un replay sans bouger l'empreinte ;
- une constante incrémentée à la main fait accepter, quand on oublie de la bumper, un replay
  qui produira un score faux sans que rien ne s'en aperçoive.

L'empreinte est **gravée au build** dans un fichier généré et committé : le navigateur ne
peut pas lire les fichiers de `sim/`, alors que Node peut, et les deux côtés doivent porter la
même valeur — la calculer à l'exécution les ferait diverger dès qu'un build est périmé. La CI
vérifie que régénérer ne produit aucun diff, exactement comme pour `sim/math.golden.json`.

## 5. `sim/replay/format.ts`

Encodage et décodage d'un tampon binaire, **sans compression** :

| Champ | Taille |
| --- | --- |
| magie `INKR` | 4 |
| version de format | `uint8` |
| empreinte de `sim/` — les 8 premiers octets d'un SHA-256 des sources | 8 |
| id d'arène — résolu contre `ARENA_BY_ID` (`sim/world.ts`) | `uint8` |
| graine | `uint32` |
| nombre de pas | `uint32` |
| nombre de choix | `uint16` |
| par choix : pas, indice | `uint32` + `uint8` |
| par pas : `kx`, `ky` | `int16` × 2 |

L'id d'arène a fait passer la version de format de 1 à 2 : un décodeur de version 1 lirait ce
qui suit `simVersion` comme le début de `seed`, décalé d'un octet — la vérification de version
au tout début de `decodeReplay` refuse ce cas avant qu'il ne produise un score silencieusement
faux.

Le SHA-256 est tronqué à 8 octets : 2⁶⁴ suffit très largement à distinguer des versions de
`sim/`, et l'en-tête n'a aucune raison d'en porter 32.

Le **pas** d'un choix est redondant — les choix sont ordonnés, donc le n-ième correspond à la
n-ième fin de vague. Il est là comme contrôle de cohérence : le rejeu vérifie que la vague
s'est bien terminée à ce pas, et refuse sinon. Un replay bricolé qui décale un choix est ainsi
rejeté au lieu de produire un score que personne ne saurait expliquer.

**La compression reste dehors, chez l'appelant** — `CompressionStream` dans le navigateur,
`zlib` dans Node. C'est la seule façon de garder `sim/` portable : une API de compression est
spécifique à la plateforme, et le module doit passer `purity.test.ts`. Le prix est trois
lignes de gzip de chaque côté, non partagées. C'est le bon prix.

Dix minutes de jeu font 144 Ko bruts. **Mesuré** sur un replay synthétique de 7 200 pas aux
entrées lissées : gzip ramène à **0,60** du brut. C'est bien moins que ce que ce document
supposait d'abord (« quelques Ko ») — `k` bouge lentement mais ses bits de poids faible
restent bruités, et gzip n'exploite pas la corrélation entre pas voisins.

La conclusion tient quand même : à 0,60, dix minutes pèsent environ 86 Ko et une partie de
deux minutes 17 Ko. Pour un classement qui ne conserve que les meilleurs replays, c'est sans
objet. Ni l'encodage delta ni l'empaquetage sur 9 bits ne se justifient — ils gagneraient un
facteur là où aucun facteur n'est nécessaire.

## 6. Le rejeu

`sim/replay/run.ts`, pur et réutilisable tel quel par le back à l'étape 3 :

1. `resetGlobals()` — bitECS alloue les `eid` depuis un compteur **global au module**, comme
   `determinism.test.ts` le documente ; sans remise à zéro, un second rejeu dans le même
   processus hérite du compteur du premier ;
2. vérifier magie, version de format et empreinte de `sim/`, et **refuser** sinon ;
3. `createWorld({ seed, … })`, `spawnPlayer`, `createRunStats`, `createRunProgress` ;
4. par pas : écrire `world.input` depuis `kx / 128` et `ky / 128`, puis
   `stepAndAbsorb(world, stats, progress)` ;
5. aux fins de vague — reconnues à l'événement `waveEnded`, qui porte lui-même le numéro de
   vague : appeler `offerUpgrades(seed, wave, progress)`, vérifier
   que le choix enregistré désigne bien ce pas, puis appliquer son indice via `takeUpgrade` ;
6. rendre le score, la vague atteinte et la durée.

### Deux points d'entrée partagés, et pourquoi ils ne sont pas négociables

Les étapes 4 et 5 ci-dessus nomment des fonctions partagées, pas des recettes à réécrire.
C'est une correction de ce que ce document prescrivait d'abord, et la décision de conception
la plus conséquente du chantier : la version initiale demandait au rejeu de *reproduire*
`drawUpgrades(createRng(seed + wave), { wave, ...progress })`, donc de retenir la même
formule en deux endroits. Le jour où la pondération du tirage change dans un seul, le
serveur calcule une offre que le joueur n'a jamais vue et rejette un score honnête.

- **`offerUpgrades(seed, wave, progress)`** (`sim/upgrades/offer.ts`) est le seul point
  d'entrée du tirage. Le jeu et le rejeu l'appellent tous les deux, avec les mêmes
  arguments, et `drawUpgrades` n'est appelé nulle part ailleurs. Il construit son `DrawState`
  **champ par champ**, délibérément : `{ wave, ...progress }` laisserait un futur champ de
  `RunProgress` fuiter dans le tirage.
- **`stepAndAbsorb(world, stats, progress)`** (`sim/replay/step-with-progress.ts`) enchaîne
  `stepWorld` puis `absorbEvents`, dans cet ordre. L'ordre est porteur : un power-up ramassé
  au pas exact où une vague se termine doit être visible dans l'offre. Tant que les deux
  appels restaient séparés de chaque côté, inverser les deux lignes du jeu laissait toute la
  suite verte et faisait diverger client et serveur sur les runs assez bonnes pour atteindre
  une fin de vague — c'est-à-dire exactement celles qu'on soumet.

Dans les deux cas la règle est la même, et c'est celle que l'étape 3 doit reprendre : un
invariant qu'aucun test ne peut atteindre se supprime en le rendant structurel, pas en le
commentant. Et « structurel » veut dire ce qu'il dit — extraire une fonction partagée ne
suffit pas, puisque les fonctions d'origine restent importables. C'est la règle
`noRestrictedImports` de `biome.json`, interdisant `@sim/step` et `absorbEvents` depuis
`front/src/**`, qui supprime l'autre chemin ; la fonction partagée ne fait qu'indiquer le
bon.

`sim/scripts/replay.ts` est la CLI mince par-dessus, sur le modèle de `gen-golden.ts` :
`npm run replay partie.bin`.

## 7. Comment le fichier sort du jeu

En développement seulement, la fin d'une partie déclenche le téléchargement de
`partie-<graine>.bin`. Aucune UI à dessiner, rien en production, et le livrable se vérifie à
la main en trente secondes : jouer, mourir, passer le fichier au runner, comparer au score
affiché.

L'enregistreur tourne en revanche **toujours**, y compris en production : dix minutes coûtent
144 Ko *encodés* et environ 576 Ko en mémoire — les entrées s'accumulent dans un `number[]`,
soit 36 000 pas × 2 × 8 octets, et non dans le tampon `int16` final. Sans conséquence non
plus, mais c'est le bon chiffre : le premier justifiait le second par erreur.

À décider à l'étape 3 : le plafond de pas au-delà duquel une partie devient non
soumissible, pour qu'une session laissée ouverte des heures ne produise pas un fichier absurde.

## 8. Vérification

- **Aller-retour** : encoder puis décoder rend un objet identique, y compris aux bornes
  (`k = ±128`, zéro choix, zéro pas).
- **Bout en bout** : une run scriptée, enregistrée puis rejouée, produit la **même empreinte**
  que la run directe — pas seulement le même score. L'outillage existe depuis l'étape 1.
- **Refus d'un replay périmé** : un test fabrique un replay portant une mauvaise empreinte de
  `sim/` et vérifie que le rejeu **refuse**, au lieu de calculer un score faux.
- **À la main** : la boucle jouer → mourir → `npm run replay` → comparer.

## 9. Ce que le rejeu ne prouve pas

Il prouve qu'une suite d'entrées produit bien ce score sous cette version de la simulation.
Il ne prouve pas qu'un humain l'a jouée : un bot qui pilote le jeu produit un replay
parfaitement valide. La vérification par rejeu ferme la falsification du score, pas
l'automatisation du jeu — et fermer la seconde est un problème d'une autre nature, hors de ce
chantier.

## 10. Ce que l'étape 3 hérite

Le gain de gzip n'est plus une question ouverte : mesuré à **0,60**, soit 86 Ko pour dix
minutes (§5). Ni l'encodage delta ni l'empaquetage sur 9 bits ne valent leur complexité à ce
prix. Restent quatre points que ce chantier a rendus visibles sans les trancher, et qui
appartiennent à la spec de l'étape 3 :

- **Le plafond de pas doit être un paramètre obligatoire de `replayRun`, pas une note.**
  `decodeReplay` vérifie que le fichier contient bien les pas qu'il annonce, donc personne ne
  peut mentir sur le compte — mais 4 octets d'entrée achètent un pas complet de simulation,
  une amplification de l'ordre du million. Un envoi de 100 Mo vaut 25 M de pas, soit des
  heures de calcul. Un argument requis est ce qui empêche d'oublier la borne ; un paragraphe
  de documentation ne l'empêche pas.
- **La décompression doit être bornée avant d'être crue.** 509 Ko de zéros se détendent en
  500 Mo. La CLI passe désormais un `maxOutputLength` ; le worker en hérite.
- **`replayRun` n'est pas réentrant.** `resetGlobals()` remet à zéro l'état **global au
  processus** de bitECS — curseur, `removed`, `recycled`. Les appels séquentiels ne sont sûrs
  aujourd'hui que parce qu'il n'y a aucun `await` dans la boucle. Le premier qu'on y ajoutera
  — remontée de progression, streaming, un `yield` pour ne pas bloquer la boucle
  d'événements — fera se corrompre deux rejeux entrelacés, et le même appel détruirait tout
  autre monde bitECS vivant dans le processus. « Un rejeu à la fois par processus » est donc
  une contrainte d'ingestion, pas un détail d'implémentation.
- **Ce que `alive: true` autorise.** `ReplayResult` le rapporte, mais rien ne rejette un
  replay qui s'arrête simplement en cours de partie : un joueur peut tronquer ses entrées à
  son pic de score. C'est une question de politique de classement, pas un défaut ici, et elle
  se tranche avec le plafond.
