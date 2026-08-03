# Succès et tracés

## 1. Intention

Une partie d'InkPoint ne laisse aujourd'hui qu'une trace : `bestScore`, un nombre dans
`localStorage`. Le joueur qui meurt à 1 300 000 points et celui qui meurt à 12 000 ont
rigoureusement la même page d'accueil.

Ce chantier ajoute une collection de **24 succès** — des paliers, des gestes de maîtrise,
et des idées absurdes qu'on ne réussit qu'en le voulant — dont six ouvrent un **tracé**,
c'est-à-dire une autre silhouette pour la pointe du joueur. Le tracé est la seule
récompense : il ne change ni la portée, ni la vitesse, ni la hitbox. On ne débloque pas de
puissance, on débloque une signature.

Deux contraintes commandent tout le reste.

**La palette est sémantique.** Rouge = danger, jaune = explosion, bleu = gel, violet =
éclat, et le joueur est la seule chose en `paper`. Un tracé ne peut donc pas changer de
couleur sans mentir au joueur sur ce qu'il regarde. Les six tracés sont six silhouettes de
la même encre.

**La simulation doit rester pure.** Le chantier `sim/` portable
(`2026-08-02-sim-portable-design.md`) prépare un noyau rejouable au bit près par le
serveur ; y verser une condition de succès à chaque idée nouvelle ferait diverger
l'empreinte de déterminisme pour une raison décorative. Les succès vivent donc
intégralement dans `src/app/`, à partir des `SimEvent` que la simulation émet déjà.

## 2. Ce que le code impose

Quatre découvertes faites en lisant la simulation, qui ont chacune corrigé une entrée du
catalogue avant qu'elle ne soit écrite.

**Le score monte tout seul.** `score.ts` accorde `SURVIVAL_POINTS_PER_SEC = 5`. « Mourir
sans un seul point », l'idée d'origine, n'est atteignable qu'en mourant en moins de 200 ms.
Le succès devient **mourir sans avoir tué un seul ennemi** : même geste absurde, et
réalisable.

**On ne peut pas refuser une carte.** `upgrade.ts` n'a pas de « passer ». Une partie sans
amélioration n'existe que pour qui meurt avant la fin de la vague 1, ce que couvre déjà
« Faux départ ». Aucun succès n'est fondé là-dessus.

**Une vague dure 40 s fixes** (`WAVE_DURATION_MS`), et se termine sur un minuteur, jamais
sur une arène vidée. Vague 10 = 6 min 40, vague 30 = 20 min. Les paliers de vague sont
calibrés là-dessus.

**`playerHit` n'est jamais émis.** Le type existe dans `SimEvent` mais aucun système ne le
pousse : le joueur n'a pas de points de vie. Un contact le tue, sauf s'il porte un Halo,
qui se brise (`haloBroken`) et absorbe une fois. « Traverser une vague sans un seul dégât »
signifierait donc « sans Halo brisé » — condition qu'un joueur n'ayant jamais ramassé de
Halo remplit sans rien faire. Les deux succès immaculés se mesurent à la place sur la
**distance au plus proche ennemi menaçant** (§4.3).

Ce chantier ne supprime pas `playerHit` du type : ce serait une modification de `src/sim/`
sans rapport avec la fonctionnalité, et le chantier portable rouvrira ce fichier de toute
façon.

## 3. Le catalogue

Trois familles, 24 entrées, six tracés. La famille n'est qu'un regroupement d'affichage.

### 3.1 Progression — 9

| `id` | Titre | Condition | Tracé |
| --- | --- | --- | --- |
| `wave-5` | Cinquième page | Atteindre la vague 5 | |
| `wave-10` | Le carnet | Atteindre la vague 10 | **la Bille** |
| `wave-20` | Le volume | Atteindre la vague 20 | |
| `wave-30` | L'œuvre complète | Atteindre la vague 30 | **le Sceau** |
| `score-100k` | Belle plume | 100 000 points en une partie | |
| `score-500k` | Grand format | 500 000 points en une partie | |
| `score-1m` | Le million | 1 000 000 points en une partie | |
| `kills-500` | Buvard | 500 ennemis en une partie | |
| `kills-2000` | Marée noire | 2 000 ennemis en une partie | |

### 3.2 Maîtrise — 8

| `id` | Titre | Condition | Tracé |
| --- | --- | --- | --- |
| `combo-250` | Roulement | Combo de 250 sans rupture | |
| `combo-750` | Chaîne d'encre | Combo de 750 sans rupture | |
| `clean-wave` | Page immaculée | Une vague entière sans qu'un ennemi approche à moins de 60 px | |
| `clean-three` | Cahier immaculé | Trois vagues d'affilée dans les mêmes conditions | **le Pinceau** |
| `burst-100` | Rafale | 100 ennemis en moins de 2 secondes | |
| `full-kit` | Toute la trousse | Ramasser les 8 genres de power-up dans une même partie | |
| `bare-hands` | Mains nues | Atteindre la vague 5 sans avoir ramassé un seul power-up | |
| `no-halo` | Sans filet | Atteindre la vague 10 sans avoir jamais ramassé de Halo | |

### 3.3 Loufoque — 7

| `id` | Titre | Condition | Tracé |
| --- | --- | --- | --- |
| `blank-page` | Page blanche | Mourir sans avoir tué un seul ennemi | **la Tache** |
| `false-start` | Faux départ | Mourir dans les 5 premières secondes | |
| `still-life` | Nature morte | Rester 15 s sans s'éloigner de plus de 40 px | **le Compte-gouttes** |
| `pacifist` | Pacifiste | Traverser une vague entière sans tuer un ennemi | **le Crayon** |
| `grand-tour` | Tour du propriétaire | Toucher les quatre bords de l'arène en moins de 5 s | |
| `homebody` | Casanier | Une vague entière sans parcourir plus d'un quart de l'arène | |
| `back-to-inkwell` | Retour à l'encrier | Mourir à moins de 50 px de son point d'apparition | |

### 3.4 Les seuils

`combo-250`, `combo-750` et `burst-100` sont posés sans mesure : ils sont dérivés du seul
repère connu — des parties à 500 000 points pour 2 000 tués, un record à 1 300 000 — et non
d'une observation du combo courant en fin de partie ni du nombre d'ennemis qu'une explosion
à gros rayon fauche au maximum. Ce sont trois nombres dans `catalog.ts`, à réviser après le
premier passage de joueurs ; les corriger ne touche à rien d'autre.

Les seuils de vague, eux, sont fermes : ils se lisent directement en minutes de survie
(§2).

## 4. La trace de partie

`src/app/achievements/trace.ts`. Un objet mutable, reconstruit à chaque `startRun()`,
avancé une fois par pas de simulation. Il porte exactement ce que les 24 prédicats
demandent, et rien de plus.

```ts
export interface RunTrace {
  /** `world.time` — gèle en hitstop, comme le HUD. */
  timeMs: number
  score: number
  wave: number
  kills: number
  maxCombo: number
  /** Vrai dès `playerDied`. Les prédicats de mort le lisent. */
  died: boolean

  powerupsPicked: Set<PowerUpKind>
  powerupCount: number

  /** Horodatages des kills, élagués à la fenêtre de `burst-100`. */
  killTimestamps: number[]

  /** Remis à zéro à chaque `waveStarted`. */
  waveKills: number
  waveClean: boolean
  cleanWaveStreak: number
  /**
   * Bilans de vague, arrêtés à `waveEnded` et jamais repris : « Pacifiste » et
   * « Casanier » portent sur une vague *achevée*, et leurs accumulateurs sont
   * remis à zéro par la vague suivante.
   */
  hadPacifistWave: boolean
  hadHomebodyWave: boolean
  waveMinX: number
  waveMaxX: number
  waveMinY: number
  waveMaxY: number

  /** Ancrage d'immobilité : origine, et durée passée dans son rayon. */
  stillX: number
  stillY: number
  stillMs: number

  /** Dernier contact avec chacun des quatre bords, en `timeMs`. */
  edgeTouchedAt: [number, number, number, number]

  spawnX: number
  spawnY: number
  /** Position du joueur au dernier pas — lue par les prédicats de mort. */
  x: number
  y: number

  /** Pas écoulés — cadence l'échantillonnage de proximité (§4.3). */
  steps: number
}
```

### 4.1 Alimentation

`advanceTrace(trace, world)` est appelée dans `onStep`, **avant** `handleSimEvents()`, donc
dans le seul état où la simulation avance. L'ordre est contraint : `handleSimEvents` tire
les cartes d'amélioration en fin de vague, et le tirage lit `trace.powerupsPicked`. Comme
`pickupSystem` s'exécute avant `waveSystem`, une pastille ramassée au pas exact où la vague
tombe doit compter pour ce tirage-là — c'était le cas quand `game.ts` tenait l'ensemble à la
main, et cela doit le rester. Elle lit :

- les scalaires du monde (`time`, `score`, `wave`, `combo`) ;
- les `SimEvent` du pas : `enemyKilled` (compteurs et horodatage), `powerupPicked`
  (ensemble et compteur), `waveStarted` (remise à zéro des accumulateurs de vague),
  `playerDied` (`died`) ;
- la `Position` du joueur, que `game.ts` lit déjà via `playerMotion()`.

`waveStarted` n'est pas émis pour la vague 1 : `createTrace()` initialise les
accumulateurs de vague comme le ferait un début de vague, à partir de la position
d'apparition.

`maxCombo` retient le maximum de `world.combo` et non sa valeur courante : `scoreSystem`
le remet à zéro dès que la fenêtre de 2,5 s expire, et un prédicat qui lirait la valeur
courante manquerait le pic d'un pas sur deux.

### 4.2 Les fenêtres

**Rafale.** `killTimestamps` est élagué en tête de chaque pas de tout ce qui est plus vieux
que 2 000 ms ; le prédicat est `length >= 100`. Le tableau est donc borné par le nombre de
kills que 2 secondes peuvent produire, pas par la durée de la partie.

**Tour du propriétaire.** Plutôt qu'une fenêtre glissante et un masque à réinitialiser, on
garde pour chacun des quatre bords l'horodatage du dernier contact — être à moins de 40 px
du bord. Le prédicat est `max(edgeTouchedAt) - min(edgeTouchedAt) <= 5000`, et il est faux
tant qu'un bord n'a jamais été touché (`-Infinity` à l'initialisation). Aucun état à
remettre à zéro, aucune fenêtre à ouvrir ou fermer.

**Nature morte.** Tant que le joueur reste à moins de 40 px de `(stillX, stillY)`,
`stillMs` s'accumule ; dès qu'il en sort, l'ancre se replace sur lui et `stillMs` repart de
zéro. Le prédicat est `stillMs >= 15000`. Rien n'exige d'y « survivre » : la trace n'avance
que tant que la simulation avance, donc tant que le joueur est vivant.

**Casanier.** On suit la boîte englobante des positions de la vague, et le prédicat vérifie
à `waveEnded` que `maxX - minX <= ARENA.width / 2` et `maxY - minY <= ARENA.height / 2`.
Une boîte plutôt qu'un quadrant fixe, parce que le joueur apparaît au centre exact de
l'arène (`spawnPlayer`) : il est à cheval sur les quatre quadrants au premier pas, et tout
critère de quadrant fixe serait perdu d'avance.

### 4.3 La distance au plus proche ennemi

Les deux succès immaculés demandent la seule mesure que les événements ne donnent pas :
combien un ennemi s'est approché.

La population mesurée est **exactement celle qui peut tuer** — `activeEnemies` de
`collision.ts`, soit `Enemy` sans `Materializing`, `Frozen` ni `Doomed`. Un ennemi en
pointillé est inoffensif, un ennemi gelé se traverse et meurt. Pour que la définition de la
menace ne diverge jamais entre le succès et la mort réelle, `activeEnemies` **est exportée**
depuis `collision.ts` et importée par le traqueur, au lieu d'être redéclarée à l'identique.

La mesure tourne **un pas sur quatre**, soit 15 Hz. La borne d'erreur est explicite : un
ennemi va au plus à 150 px/s (`enemyMaxSpeed`), le joueur à 240 px/s, donc leur écart
diminue d'au plus 26 px pendant les 66,7 ms séparant deux mesures. Le seuil de 60 px est
plus du double : une approche sous 60 px doit durer moins de 66 ms pour passer entre deux
mesures, ce qui suppose une trajectoire tangente au bord exact du disque. Limite assumée,
et dans le sens généreux — au pire un joueur garde un succès immaculé qu'il a frôlé.

La mesure n'est calculée que si `clean-wave` ou `clean-three` est encore verrouillé (§6) :
pour un joueur qui les a tous les deux, elle disparaît complètement.

`waveClean` tombe à faux dès qu'une mesure passe sous 60 px, et ne se relève qu'au
`waveStarted` suivant. `cleanWaveStreak` s'incrémente à `waveEnded` si `waveClean` tient,
et retombe à zéro sinon.

## 5. Le catalogue en données

`src/app/achievements/catalog.ts`, sur le modèle de `sim/data/upgrades.ts` : de la donnée
typée, pas du code de branchement.

```ts
export type AchievementFamily = 'progression' | 'mastery' | 'oddity'

export interface AchievementDef {
  id: string
  family: AchievementFamily
  /** Le tracé que ce succès ouvre, quand il en ouvre un. */
  skin?: SkinId
  /** Vrai dès que la condition est remplie. Fonction pure de la trace. */
  done(trace: RunTrace): boolean
}
```

Titre et condition passent par i18n, clés `achievement.<id>.name` et
`achievement.<id>.desc`, comme les cartes d'amélioration. `i18n/parity.test.ts` vérifie
déjà que les deux locales portent les mêmes clés ; un test dédié vérifie que chaque `id` du
catalogue a les siennes (§11).

Les seuils sont des constantes nommées en tête de fichier, jamais des littéraux dans les
prédicats : ils vont bouger (§3.4), et une valeur qu'on révise se lit à un seul endroit.
`full-kit` compare à `POWERUP_KINDS.length`, jamais à `8` : ajouter un neuvième genre doit
resserrer le succès tout seul.

## 6. Le traqueur

`src/app/achievements/tracker.ts`.

```ts
export interface Tracker {
  /** Avance la trace et évalue. Retourne les succès ouverts à ce pas. */
  step(world: SimWorld): AchievementDef[]
  reset(): void
  /** Vrai tant que `clean-wave` ou `clean-three` reste à acquérir (§4.3). */
  needsProximity: boolean
}
```

Aucun prédicat ne lit une distance : la mesure de proximité n'est pas stockée dans la
trace, elle ne fait que faire tomber `waveClean`. Les deux succès immaculés lisent
`waveClean` et `cleanWaveStreak` comme les autres lisent des compteurs.

Un succès acquis — dans cette partie ou dans une précédente — n'est plus évalué. Le
traqueur tient l'ensemble des `id` restants, en retire ce qu'il ouvre, et le rend à
`reset()` depuis le store. À la fin d'une longue partie il n'évalue donc plus qu'une
poignée de prédicats.

**Il n'y a pas d'évaluation finale séparée.** `playerDied` arrive dans les événements du pas
courant, et `onStep` traite ce pas entièrement : `advanceTrace` y pose `died`, et
l'évaluation qui suit ouvre `blank-page`, `false-start` et `back-to-inkwell` dans la foulée.
Une passe supplémentaire après la mort serait toujours vide.

Ce qui distingue ces trois-là n'est donc pas *quand* ils s'ouvrent, mais *où* ils
s'affichent : le bandeau se tait dès que `trace.died` est vrai (§9.4). Ils n'apparaissent
qu'au récapitulatif — le comportement annoncé, par un chemin plus court.

**Chaque déblocage est persisté immédiatement**, pas à la fin de la partie : un joueur qui
ferme l'onglet en pleine partie garde ce qu'il a gagné. L'écriture est rare par nature — au
plus 24 fois dans la vie d'un joueur.

### 6.1 Le branchement dans `game.ts`

| Endroit | Appel |
| --- | --- |
| `startRun()` | `tracker.reset()` |
| `onStep`, **avant** `handleSimEvents()` | `tracker.step(run.world)` → accumulés pour l'écran de fin, et mis en file du bandeau **sauf si** `trace.died` |
| `onEnterGameOver()` | lit la liste accumulée pour `GameOverStats.unlocked` |

Le test `!trace.died` à l'entrée du bandeau est le seul endroit qui sépare
les succès annoncés en jeu de ceux réservés au récapitulatif. Il ne demande aucun catalogage
préalable : un succès qui ne peut tomber qu'à la mort se filtre tout seul.

**Deux compteurs de `game.ts` disparaissent.** `killCount` et `seenPowerups` y sont tenus à
la main depuis `handleSimEvents`, et la trace les recalcule à l'identique : `trace.kills`
remplace le premier, `trace.powerupsPicked` le second — ce dernier étant déjà consommé par
`drawUpgrades` pour le tirage des cartes. Deux sources pour le même compteur finissent
toujours par diverger d'un événement, et c'est ici gratuit à éviter puisque les deux se
remplissent du même flux.

## 7. Persistance

Deux clés, à travers le `storage` existant, qui avale déjà le mode privé et le quota
dépassé :

| Clé | Contenu | Défaut |
| --- | --- | --- |
| `inkpoint.achievements` | `string[]` — les `id` acquis | `[]` |
| `inkpoint.skin` | `SkinId` — le tracé équipé | `'quill'` |

`src/app/achievements/store.ts` filtre à la relecture : un `id` absent du catalogue est
ignoré, un tracé inconnu ou non débloqué retombe sur la Plume. Renommer ou retirer un
succès plus tard ne doit pas casser la sauvegarde d'un joueur, ni lui laisser une
silhouette qu'il n'a pas gagnée.

**Rien n'est rétroactif.** Le `bestScore` déjà en place ne débloque pas « Belle plume » :
il n'existe aucun historique de parties à relire, et en inventer un pour un seul cas serait
un mensonge sur ce que le joueur a fait.

## 8. Les tracés

`src/render/views/nibs.ts`. Chaque silhouette est un **polygone fermé**, exprimé comme une
liste de sommets dans le même repère que la plume actuelle — origine au centre, pointe vers
`+x`.

```ts
export type SkinId = 'quill' | 'ball' | 'brush' | 'blot' | 'dropper' | 'pencil' | 'seal'
export const NIBS: Record<SkinId, readonly (readonly [number, number])[]>
```

`quill` reprend exactement les quatre sommets de `drawNib` aujourd'hui : le tracé par
défaut ne change pas d'un pixel.

Deux consommateurs, une seule source :

- `drawNib(gfx, color, skin)` trace le polygone dans Pixi. Sa signature gagne un paramètre ;
  `fx/afterimage.ts`, qui l'appelle déjà pour que le fantôme de la ruée ressemble au joueur,
  reçoit le tracé courant et suit sans autre modification.
- `nibPath(skin)` rend l'attribut `d` d'un `<path>` SVG, pour les deux vitrines DOM.

Tout est polygonal, disque compris : le filtre `boil` fait trembler le trait à 8 fps, un
cercle à seize côtés y est indiscernable d'un vrai, et une seconde primitive obligerait les
deux consommateurs à savoir la dessiner chacun de son côté.

La **hitbox ne bouge pas** — elle vit dans `Collider.radius` côté simulation, qu'aucun
tracé ne touche. Un test vérifie que chaque silhouette tient dans le rayon de la Plume, pour
qu'aucune ne promette une allonge qu'elle n'a pas.

Les six silhouettes : **la Bille** (disque plein), **le Pinceau** (touffe large, pointe
molle), **la Tache** (blot irrégulier, sans direction lisible), **le Compte-gouttes**
(goutte, pointe fine et corps rond), **le Crayon** (hexagone allongé, pointe taillée), **le
Sceau** (losange épais).

## 9. L'interface

### 9.1 Le menu

`ENTRIES` passe de trois à cinq : `play`, `achievements`, `skins`, `upgrades`, `settings`.
`createMenuNav(ENTRIES.length)` suit tout seul, et `renderMain` n'a rien à apprendre.

### 9.2 L'écran des succès

Vue intégrée au menu, sur le modèle exact de la vitrine « Améliorations » : `view` passe de
`'main' | 'upgrades'` à une union de quatre valeurs. Une grille de cartes, un compteur
`7 / 24` en tête, un bouton « retour ».

**Rien n'est caché.** Un succès verrouillé affiche son titre et sa condition en creux : la
condition *est* l'invitation à jouer, un point d'interrogation ne dit rien à personne. Un
succès acquis passe au trait plein et annonce le tracé qu'il porte, s'il en porte un.

La carte est un composant frère de `renderCard`, pas une extension : `renderCard` est typé
`UpgradeDef` et sa lecture de rareté n'a pas d'équivalent ici. Elle partage la géométrie et
le cadre d'encre (§10), pas la structure.

### 9.3 L'écran des tracés

Même grille, sept silhouettes rendues par `nibPath`. Le tracé équipé est marqué ; ceux qui
ne sont pas ouverts se montrent en creux avec le nom du succès qui les ouvre. Valider
équipe et persiste.

### 9.4 Le bandeau

Dans le HUD, en haut au centre : la silhouette du tracé porté par le succès, ou une marque
d'encre pour les honorifiques, puis le titre. 2,5 s, puis le suivant si la file n'est pas
vide — deux succès ouverts au même pas défilent l'un après l'autre plutôt que de se
superposer.

**Il se tait dès que `trace.died` est vrai.** Corollaire assumé : `blank-page`,
`false-start` et `back-to-inkwell` tombent dans le pas qui porte `playerDied` (§6.1) — ils
n'apparaissent donc que dans le récapitulatif. Le drapeau de la trace plutôt que l'état de
la machine : le traqueur avance désormais avant `handleSimEvents`, donc la machine est
encore en `playing` à cet instant, et `trace.died` est le seul signal juste.

Il suit les règles du HUD : `pointer-events-none`, opacité basse, et son apparition passe
par une transition CSS que `.reduced-motion` coupe (`main.css`). Dans un jeu où une
demi-seconde d'attention coûte la partie, un bandeau qui bouge trop est un piège.

### 9.5 Le récapitulatif

`GameOverStats` gagne un champ `unlocked: AchievementDef[]`, affiché sous le meilleur score :
titre, condition, et le tracé ouvert le cas échéant. La liste est **complète** — elle
reliste ce que le bandeau a déjà montré. Un joueur qui meurt trois secondes après un
déblocage ne doit pas avoir à se souvenir de ce qu'il a vu passer.

## 10. Nettoyages induits

Deux, et rien de plus — ce sont ceux que trois familles de cartes rendent nécessaires.

**`frameJitter` et `inkFrame` sortent de `card.ts`** vers `ui/components/ink-frame.ts`. Le
cadre d'encre irrégulier, dérivé de l'identifiant, va servir aux cartes de succès et aux
tuiles de tracé ; recopié trois fois, il divergerait au premier ajustement de `JITTER_PX`.

**La géométrie de la grille devient un helper partagé.** Elle est aujourd'hui en dur dans
`menu.ts`, sous un commentaire de quinze lignes qui avertit que ses trois valeurs sont
solidaires de `renderCard`. Trois grilles vont désormais l'employer : recopier ces classes
Tailwind, c'est garantir que l'avertissement soit ignoré deux fois sur trois. Le commentaire
suit le helper.

## 11. Tests

| Fichier | Ce qu'il vérifie |
| --- | --- |
| `achievements/catalog.test.ts` | `id` uniques ; chaque `id` a `name` et `desc` dans `fr` et `en` ; chaque `skin` référencé existe dans `NIBS` ; tout tracé sauf `quill` est ouvert par exactement un succès |
| `achievements/trace.test.ts` | Élagage de `killTimestamps` ; remise à zéro des accumulateurs à `waveStarted` ; ancrage d'immobilité qui se replace ; `maxCombo` qui retient le pic malgré la remise à zéro de `world.combo` ; boîte englobante de vague |
| `achievements/predicates.test.ts` | Un cas par succès : une trace littérale juste sous le seuil, une juste au-dessus |
| `achievements/tracker.test.ts` | Un succès acquis n'est pas réévalué ; deux succès ouverts au même pas sortent tous les deux ; le pas qui porte `playerDied` ouvre les prédicats de mort ; `reset()` repart de l'ensemble du store ; `needsProximity` tombe à faux quand les deux immaculés sont acquis |
| `achievements/store.test.ts` | `id` inconnu ignoré à la relecture ; tracé inconnu ou non débloqué → `quill` ; un `localStorage` qui refuse d'écrire ne casse rien |
| `render/views/nibs.test.ts` | Chaque silhouette tient dans le rayon de la Plume ; `nibPath` et `drawNib` lisent la même liste de sommets ; `NIBS.quill` est identique aux sommets actuels de `drawNib` |
| `i18n/achievements.test.ts` | Sur le modèle de `upgrades.test.ts` |

La proximité (§4.3) se teste sur un monde bitECS monté à la main, comme `collision.test.ts`
le fait déjà : un ennemi `Materializing` à 10 px ne doit pas salir la vague, un ennemi actif
à 59 px doit la salir.

## 12. Vérification à l'œil

- Le bandeau reste lisible sans détourner de l'esquive, à la souris comme au clavier.
- Les sept silhouettes se distinguent les unes des autres **en jeu**, sous le `boil`, en
  mouvement — pas seulement dans la vitrine.
- Le tracé équipé apparaît aussi sur les images rémanentes de la ruée.
- Le menu à cinq entrées tient sur une fenêtre basse, et la grille des succès à 24 cartes
  défile sans déborder sur une fenêtre étroite.
- `reduced-motion` actif : le bandeau apparaît sans transition et reste lisible.

## 13. Hors périmètre

- **Aucune vérification serveur.** Les succès se débloquent sur la foi du client, comme le
  `bestScore` aujourd'hui. Le rejeu de vérification est le sujet du chantier leaderboard,
  et rien ici ne le gêne : la trace est reconstructible à partir des mêmes `SimEvent`.
- **Aucune statistique cumulée entre parties.** Les 24 conditions s'évaluent à l'intérieur
  d'une partie. « 10 000 ennemis en tout » demanderait un store de compteurs persistants,
  sa migration et ses tests, pour un succès.
- **Aucun succès rétroactif** (§7).
- **Aucun changement dans `src/sim/`**, à une exception près : `activeEnemies` devient
  exportée (§4.3). Aucune modification de comportement, donc aucun effet sur l'empreinte de
  `determinism.test.ts`.
- **Aucune modification de l'équilibrage.** Les tracés sont strictement cosmétiques.
