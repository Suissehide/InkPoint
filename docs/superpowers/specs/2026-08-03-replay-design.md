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

L'histoire déterministe d'une partie tient donc en trois choses :

```
{ graine, entrées[pas], cartes choisies[] }
```

Ce qui n'y figure **pas**, et pour quelle raison :

| Absent | Raison |
| --- | --- |
| L'arène | `ARENA` est une constante `1280 × 720` de `sim/world.ts` ; le viewport ne met à l'échelle que le rendu |
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
**empreinte des sources de `sim/`**, et le rejeu refuse tout replay qui ne la présente pas.

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
| graine | `uint32` |
| nombre de pas | `uint32` |
| nombre de choix | `uint16` |
| par choix : pas, indice | `uint32` + `uint8` |
| par pas : `kx`, `ky` | `int16` × 2 |

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
4. par pas : écrire `world.input` depuis `kx / 128` et `ky / 128`, `stepWorld`, `absorbEvents` ;
5. aux fins de vague — reconnues à l'événement `waveEnded`, qui porte lui-même le numéro de
   vague : reproduire `drawUpgrades(createRng(seed + wave), { wave, ...progress })`, vérifier
   que le choix enregistré désigne bien ce pas, puis appliquer son indice via `takeUpgrade` ;
6. rendre le score, la vague atteinte et la durée.

`sim/scripts/replay.ts` est la CLI mince par-dessus, sur le modèle de `gen-golden.ts` :
`npm run replay partie.bin`.

## 7. Comment le fichier sort du jeu

En développement seulement, la fin d'une partie déclenche le téléchargement de
`partie-<graine>.bin`. Aucune UI à dessiner, rien en production, et le livrable se vérifie à
la main en trente secondes : jouer, mourir, passer le fichier au runner, comparer au score
affiché.

L'enregistreur tourne en revanche **toujours**, y compris en production : 144 Ko en mémoire
pour dix minutes est sans conséquence, et l'étape 3 aura besoin du replay de n'importe quelle
partie. À décider à l'étape 3 : le plafond de pas au-delà duquel une partie devient non
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

## 10. Questions ouvertes

- Le gain réel de gzip sur les entrées, à mesurer avant de décider si un encodage delta ou un
  empaquetage sur 9 bits vaut sa complexité.
- Le plafond de pas d'une partie soumissible, à trancher à l'étape 3 avec le reste des bornes
  de la vérification.
