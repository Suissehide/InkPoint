# Moteur audio, cartes à jouer, spawn visible et six réglages

## 1. Intention

Huit demandes issues d'une session de jeu. Sept sont des changements ciblés ; la huitième
est un sous-système entier.

1. **La ruée glisse le long des murs** au lieu de s'arrêter quand elle en percute un.
2. **Les ennemis apparaissent hors de l'écran**, donc leur phase d'apparition — le contour
   pointillé qui dit « pas encore mortel » — n'est jamais visible.
3. **« Encre généreuse » double la fréquence des power-ups** et doit disparaître.
4. **Les cartes d'amélioration** doivent passer en format carte à jouer, la « rare » en tête.
5. **La Ronce d'encre sort encore trop souvent**, malgré un premier réglage.
6. **La carte mythique frémit** et ne devrait pas.
7. **Les ennemis manquent de contraste** sur le fond depuis que la réglure a été densifiée.
8. **Le jeu n'a aucun son.**

Le point 8 est un sous-système complet, sans rapport technique avec les sept autres. Le
regrouper avec eux dans une spec unique a été proposé, déconseillé, puis explicitement
confirmé par le responsable du projet. Ce document isole donc l'audio en §9, de sorte que le
plan d'implémentation puisse le traiter comme une phase séparable.

## 2. La ruée s'arrête au mur

### 2.1 Ce qui change, et pourquoi c'est un renversement

`dashFullyBlocked` (`src/sim/systems/player-movement.ts`) ne termine aujourd'hui la ruée que
si **toutes** ses composantes de vitesse sont bloquées — un impact frontal, ou un coin. Le
commentaire l'assume : « une ruée diagonale qui rase le sol avance encore et ne doit pas
être coupée ». Une ruée oblique glisse donc le long de la paroi pendant toute sa durée.

C'est cet arbitrage qu'on inverse : **tout contact réel avec un mur termine la ruée.**

### 2.2 Le piège à éviter

La fonction devient `dashHitsWall`, et la logique passe d'un « et » à un « ou » :

```ts
const blockedX = (vx < 0 && x <= r) || (vx > 0 && x >= world.arena.width - r)
const blockedY = (vy < 0 && y <= r) || (vy > 0 && y >= world.arena.height - r)
return blockedX || blockedY
```

Les termes `vx === 0 ||` et `vy === 0 ||` de la version actuelle **disparaissent**. Corrects
dans un « et » (une composante nulle ne progresse pas), ils deviendraient désastreux dans un
« ou » : une ruée parfaitement horizontale a `vy === 0` et s'annulerait au premier pas, à
l'autre bout de l'arène. C'est le seul vrai risque de ce changement.

Le garde-fou d'entrée `if (vx === 0 && vy === 0) return false` devient du code mort — sous la
nouvelle forme, les deux tests rendent déjà `false`. Il est supprimé.

### 2.3 Ce qui ne change pas

Le chemin de sortie reste unique : expiration ou mur mènent au même endroit, et la grâce
d'atterrissage de 200 ms est accordée dans les deux cas. Elle existe parce que la Ruée
s'active en situation d'encerclement ; s'arrêter contre un mur n'y change rien.

### 2.4 Conséquences assumées

Collé au mur gauche, une ruée vers le haut-gauche s'annule au premier pas et le power-up est
perdu — là où elle glissait vers le haut auparavant. Le sillage (`dash-wake.ts`) et les kills
de ruée (`dash-kill.ts`) sont écourtés d'autant. C'est le prix de la règle retenue.

`playerMovementSystem` tourne avant `integrationSystem` (`step.ts`), donc le test de mur lit
la position clampée au pas précédent : la ruée s'arrête un pas après le contact, soit 16,7 ms.
C'était déjà le cas ; l'ordre des systèmes n'est pas modifié pour si peu.

### 2.5 Tests

- Le test « termine la ruée quand le mur bloque toute sa vitesse » reste valable tel quel.
- Le test « laisse filer une ruée qui rase le mur au lieu de le percuter » est **inversé** :
  une ruée diagonale qui touche un mur doit désormais se terminer. Il ne doit être ni
  neutralisé, ni commenté — il encode l'ancien arbitrage, il doit encoder le nouveau.
- **Nouveau test, celui qui garde le piège du §2.2** : une ruée parfaitement horizontale,
  loin de tout mur, ne doit pas être coupée.

## 3. Les ennemis n'apparaissent plus hors de l'écran

### 3.1 Le problème

`FORMATION_EDGE_MARGIN = 40` fait naître les ennemis de bord **40 px à l'extérieur** de
l'arène. Le masque de découpe du rendu les y rend invisibles. Or c'est exactement pendant ce
temps que se joue leur `Materializing` : le contour **pointillé** qui signale qu'ils sont
encore traversables. Le joueur ne le voit donc jamais pour ces ennemis — ils entrent dans son
champ déjà pleins et mortels.

C'est la même racine que le débordement des formations corrigé au chantier précédent : le
masque de découpe cachait un état que le joueur avait besoin de voir.

### 3.2 Ce qui change

Les ennemis de bord se matérialisent **à l'intérieur** de l'arène. La marge devient
intérieure : leur centre naît à `MAX_ENEMY_RADIUS` du mur au plus près, de sorte qu'ils soient
entièrement visibles dès la première image de leur apparition.

**Garde de distance :** `AMBUSH_MIN_DISTANCE` (180 px) est l'objectif de tous les spawns.
Cette constante gouverne déjà les embuscades (`waves.ts`) ; l'étendre aux spawns de bord fait
qu'**un seul chiffre gouverne tous les spawns**, au lieu de deux règles parallèles.

Elle n'est pas tenable partout, et la distinction est structurelle, pas anecdotique :

**Garanti sans réserve — ruissellement, embuscades, figures enveloppantes.** Ce sont des
points isolés, ou des motifs posés autour du joueur : il existe toujours une position qui
dégage 180 px, et le code la prend. Aucun ennemi de ces trois familles ne naît plus près.

**Visé mais géométriquement inatteignable — figures traversantes.** Une figure traversante
(Ligne, V, Spirale) naît en travers de son bord d'entrée, et `crossingLayout` la fait exprès
occuper toute l'étendue perpendiculaire à sa marche : c'est ce qui donne les « lignes de bord
à bord » voulues. Un joueur qui longe la paroi d'entrée est alors à quelques dizaines de
pixels du plan d'apparition, et **aucune position le long du bord ne peut l'en écarter de
180 px** — la figure devrait sortir entière de l'arène pour cela. Ce n'est pas un défaut de
calcul, c'est une impossibilité géométrique.

Chiffres mesurés dans l'arène 1280×720, sur 2819 figures simulées réparties en deux
échantillons — une grille couvrant toute l'arène, et un échantillon concentré le long des
parois, là où le cas se produit :

| | |
|---|---|
| Effectif à partir duquel le cas peut se produire | **9 membres** (≈ 20 s de jeu) |
| Figures naissant à moins de 180 px | **2 % en grille, 5 % le long des parois** |
| Dégagement typique dans ce cas | **≈ 110 px** (médiane) |
| Plancher mesuré | **18 px**, et prouvé optimal |

La proportion dépend entièrement de l'échantillon de positions : elle vaut ce que vaut
l'hypothèse sur le temps que le joueur passe collé à une paroi. Le **plancher**, lui, ne
dépend d'aucune hypothèse — c'est le pire cas atteignable, et il est de 18 px.

**Ce que fait le code dans ce cas :** il fait glisser la figure le long du bord jusqu'au
**maximum exact** de la distance au membre le plus proche, dans l'intervalle des positions qui
gardent la figure entièrement dans l'arène. Exact et non approché : la fonction à maximiser
est un minimum de fonctions convexes, son maximum peut tomber à l'intérieur de l'intervalle, et
`farthestFromPlayer` (`waves.ts`) l'énumère par l'enveloppe inférieure des paraboles. Aucune
figure ne laisse de dégagement inexploité.

**Ce qui cède, et pourquoi :** l'écartement, jamais le maintien **en envergure** dans l'arène.
Un membre né hors du masque de découpe tue sans avoir montré son contour pointillé ; un membre
né trop près tue après une seconde d'avertissement visible. C'est cette seconde de
`MATERIALIZE_EDGE_MS` qui protège le joueur quand les 180 px sont hors d'atteinte — et c'est
précisément pour cela que le chantier a ramené les apparitions à l'intérieur de l'arène.

Le maintien dans l'arène est acquis **en envergure, pas en profondeur** : `crossingLayout`
resserre la largeur de la figure perpendiculairement à sa marche, rien ne borne sa traîne le
long de la marche. Passé une trentaine de membres, cette traîne dépasse la dimension d'arène
qu'elle longe et des membres naissent bel et bien dehors — rien avant 6 min de jeu, une
centaine de pixels à 7 min, jusqu'à ~590 px à 15 min. Limite pré-existante, nommée dans
`fitBounds` (`waves.ts`) ; la corriger demanderait de borner aussi la profondeur des motifs,
donc de retoucher la forme du V et de la Spirale.

### 3.3 Ce que ça donne au joueur

La seconde entière de `MATERIALIZE_EDGE_MS` devient visible. Un ennemi qui apparaît à 180 px
laisse au joueur, qui se déplace à 240 px/s, largement de quoi se replacer avant qu'il ne
devienne mortel.

Face à une grande figure traversante dont il longe la paroi d'entrée, il n'a plus cette marge :
le dégagement tombe à une centaine de pixels en général, et **jusqu'à 18 px dans le pire cas
mesuré** — un ennemi qui naît quasiment sur lui. Ce qui le protège alors n'est plus la
distance mais **le temps** : la seconde entière de contour pointillé pendant laquelle l'ennemi
est traversable, et où il suffit de s'écarter. C'est précisément ce que ce chantier rend
visible, et c'est ce qui rend le cas jouable au lieu d'être une mort arbitraire.

### 3.4 Tests

- Aucun ennemi ne naît à cheval sur une bordure de l'arène **dans les premières minutes de
  jeu** — le disque entier est contrôlé, pas seulement son centre, et les bornes sont dérivées
  d'`ARENA`, jamais recopiées. Le test couvre 50 s de jeu ; au-delà de 6 min la traîne des
  grandes figures sort de l'arène (voir §3.2), et cette portion-là n'est pas garantie.
- Les **trois familles** pour lesquelles les 180 px sont garantis sont couvertes séparément,
  chacune avec son assertion de non-vacuité : ruissellement et embuscades (points isolés) et
  figures enveloppantes (Cercle, Carré). Compter les familles à part n'est pas un ornement —
  une première version sautait les enveloppantes tout en prétendant les couvrir.
- Une figure traversante ou bien dégage `AMBUSH_MIN_DISTANCE`, ou bien **aucune position
  admissible le long de son bord n'aurait fait mieux** — vérifié en balayant l'intervalle
  entier, jamais en comparant aux seuls candidats que le code examine.
- Le glissement le long du bord fonctionne quand le joueur est collé à la paroi d'entrée,
  pour la Ligne, le V **et** la Spirale.

## 4. « Encre généreuse » retirée

La carte `generous-ink` (rare, « Les power-ups apparaissent deux fois plus souvent ») est
supprimée de `src/sim/data/upgrades.ts`, ainsi que ses deux clés `upgrade.generous-ink.name`
et `.desc` dans **les deux** locales.

Le champ `pickupIntervalMultiplier` de `RunStats` n'a alors plus aucun écrivain : `upgrades.ts`
était le seul, via cette carte. Il est supprimé lui aussi, avec sa valeur initiale dans
`createRunStats` (`src/sim/upgrades/stats.ts`) et son unique lecture, `pickupInterval(...) *
stats.pickupIntervalMultiplier` dans `src/sim/systems/pickup.ts`. Le commentaire de
`difficulty.ts` qui le mentionne doit aussi partir — laisser un multiplicateur que personne ne
modifie serait du code mort, et un commentaire qui le documente serait la quatrième
affirmation périmée de ce dépôt.

## 5. Les cartes en format carte à jouer

### 5.1 La forme retenue

Proportion **5:7**, celle d'une vraie carte à jouer, en remplacement du bloc arrondi de 208 px
de large actuel.

- **Le cadre est un trait d'encre irrégulier**, pas un filet net : la carte a l'air dessinée
  à la plume sur la page, comme le reste du jeu. Le tracé est un quadrilatère dont les quatre
  sommets sont déviés de quelques pixels.
- **Deux index en coins opposés**, portant le glyphe du power-up concerné, le second retourné
  à 180° comme sur une carte à jouer.
- **La rareté se lit au nombre de traits** : un cadre pour la commune, deux cadres
  concentriques pour la rare, un cartouche plein (inversion en négatif) pour la mythique.

### 5.2 Ce que la rare abandonne

La rare portait une lueur ambrée diffuse (`shadow-[0_0_18px_-4px_#ffd166]`) et un anneau
intérieur. C'est ce halo flou qui posait problème. Il disparaît au profit d'un **second trait
d'encre franc**, dans la même couleur ambre : la distinction devient nette au lieu d'être
vaporeuse.

### 5.3 Déterminisme du tracé

L'irrégularité du cadre doit être **stable pour une carte donnée** : elle dérive de l'`id` de
la carte, jamais d'un tirage. Un cadre qui se redessine différemment à chaque `render()`
scintillerait à chaque changement de sélection — et `render()` est rappelé à chaque
déplacement dans le menu.

Le tracé n'est **pas** animé : le *boil* du jeu s'applique aux entités de l'arène, pas à
l'interface, et l'écran de choix est un moment de lecture calme.

### 5.4 Aucune couleur nouvelle

Papier pour la commune, ambre (`INK.blast`) pour la rare, inversion papier/encre pour la
mythique. Ce sont les couleurs déjà en place ; seule leur mise en forme change.

## 6. La Ronce à son poids le plus bas

`POWERUP_WEIGHT.bramble` passe de `2` à **`1`**.

| | Poids | Part |
| --- | --- | --- |
| Blast, Givre, Buvard, Ruée | 4 | 21,6 % chacun |
| Halo | 1,5 | 8,1 % |
| **Ronce** | **1** | **5,4 %** |

Elle devient **le power-up le plus rare du jeu**, devant le Halo. Ce n'est pas qu'un réglage :
c'est un changement de statut, décidé en connaissance de cause.

**Un test existant va échouer, et c'est attendu.** `pickup.test.ts`, « le Halo est nettement
plus rare que les autres », affirme que `POWERUP_WEIGHT.halo` est inférieur à celui de tous
les autres genres. C'est faux dès que la Ronce passe sous lui. Le test doit être **réécrit
pour exprimer la hiérarchie réelle** — quatre power-ups au poids plein, puis le Halo, puis la
Ronce — et non neutralisé ni assoupli.

**Conséquence assumée :** `draw.ts` conditionne les cartes à `seenPowerups`. « Longue ronce »
et « Ronce vivace » entrent donc bien plus tard dans le tirage, puisqu'il faut d'abord avoir
croisé une Ronce.

## 7. L'animation de la carte mythique retirée

`animate-[boil_0.16s_steps(1,end)_infinite]` disparaît de `RARITY_CLASS`
(`src/ui/components/card.ts`). L'inversion en négatif — fond papier, encre sombre — suffit
largement à distinguer la mythique, et c'est déjà la seule inversion du lot.

La règle CSS de `main.css` qui neutralise les animations sous `reduced-motion` **reste en
place** : elle est générale (`:root.reduced-motion *`, plus la media query système) et couvre
toute l'interface, pas seulement ce pouls. Retirer l'animation d'une carte ne la rend pas
morte.

## 8. Un liseré autour des ennemis

Les ennemis sont aujourd'hui des disques pleins (`INK.danger`, ou `INK.frost` gelés). Un
**liseré fin en `INK.paper`** les détache du fond, dont la réglure a été densifiée de 60 % au
chantier précédent — la dernière revue signalait justement le risque qu'un Éclat (rayon 6)
devienne difficile à repérer.

**Le liseré est tracé à l'intérieur du rayon de collision**, jamais au-delà. Le disque affiché
doit rester exactement le disque qui tue : un contour débordant annoncerait une zone mortelle
plus large que la vraie. Concrètement, le trait est centré à `radius − épaisseur / 2`.

Il ne s'applique **pas** pendant `Materializing` : le contour pointillé est déjà la signature
de cet état, et lui ajouter un liseré plein brouillerait la règle « pointillé = inoffensif,
plein = mortel ».

## 9. Le moteur audio

### 9.1 Où ça vit

Nouveau calque **`src/audio/`**, au même rang que `src/render/` : il **lit** `world.events` et
n'écrit **jamais** dans la simulation. La frontière de pureté existante s'y applique
telle quelle — `src/sim/` continue de ne rien savoir de l'audio.

Le module est piloté depuis `src/app/game.ts`, au même endroit que `applyJuice` : les deux
traduisent les mêmes événements, l'un en image, l'autre en son.

### 9.2 Sons synthétisés, pas d'échantillons

Tout est généré à la volée par WebAudio — oscillateurs, bruit filtré, enveloppes de gain.
Aucun fichier à produire, à licencier ou à télécharger ; le site statique ne s'alourdit pas,
et chaque son se règle par un chiffre dans le code, comme le reste de l'équilibrage.

### 9.3 Actif par défaut

Le son est **actif dès le premier lancement**. Le réglage `sfxVolume`, déjà persisté par
`src/ui/screens/settings.ts` et aujourd'hui inerte, devient le volume maître : c'est le
commentaire de ce fichier — qui annonce depuis le début un réglage « prêt pour le jour où un
moteur sera branché » — qui se réalise enfin. Ce commentaire doit être réécrit.

**Démarrage :** les navigateurs interdisent de démarrer un `AudioContext` sans geste
utilisateur. Le contexte est donc créé à l'état suspendu et repris au **premier appui clavier
ou clic**, ce qui arrive nécessairement avant toute partie puisqu'on lance le jeu depuis un
menu. Aucun son n'est perdu : rien ne se joue avant.

### 9.4 La palette sonore

| Événement | Son |
| --- | --- |
| `enemyKilled` | Impact court et sec. **La hauteur monte avec le multiplicateur de combo**, redescend quand il retombe — le combo s'entend avant de se lire. |
| `powerupPicked` | Note brève, montante. |
| `powerupUsed` | **Une signature par genre**, sur les mêmes axes que les signatures visuelles : deux temps pour la Bombe, une texture cristalline qui se fige pour le Givre, un glissando descendant pour le Buvard qui aspire, un souffle bref et orienté pour la Ruée, un accord tenu pour le Halo, rien de percussif pour la Ronce. |
| `haloBroken` | Rupture nette, plus grave que le reste. |
| `playerDied` | Chute longue, seul son qui dure. |
| `waveStarted` | Marqueur discret, non mélodique. |
| Navigation de menu | Clic très bref. |
| Choix de carte | Confirmation, plus ample selon la rareté. |

### 9.5 Ce qui borne le système

- **Un plafond de voix simultanées.** Vingt kills dans le même pas ne doivent pas produire
  vingt sons superposés : au-delà d'un petit nombre par événement et par image, les
  déclenchements supplémentaires sont ignorés. Sans ce plancher, un gros combo sature.
- **Aucun son pendant un hitstop** n'est requis : l'audio vit sur l'horloge réelle, comme la
  secousse et les particules, et n'a pas à être gelé.
- **Le mouvement réduit ne coupe pas le son.** C'est un réglage de confort vestibulaire ; il
  n'a rien à voir avec l'audio, exactement comme il ne coupe ni le hitstop ni le ralenti.

### 9.6 Tests

`src/audio/` n'est pas testable directement (pas de WebAudio en environnement de test), même
frontière que `src/render/`. La logique en est donc extraite en fonctions pures, seules
testées :

| Fonction pure | Ce qu'on vérifie |
| --- | --- |
| `killPitch(multiplier)` | monte avec le combo, bornée aux deux extrémités |
| `volumeFor(sfxVolume)` | 0 rend un gain nul, 100 le gain plein, monotone entre les deux |
| `voiceBudget(...)` | le plafond de voix par image est respecté, et un événement isolé n'est jamais ignoré |

Un test de comportement complète : `applyAudio` sur un `powerupUsed` de chaque genre produit
six déclenchements distincts sur un moteur espionné — et **aucun** son percussif pour la Ronce.

## 10. Hors périmètre

- **Musique de fond.** Seuls les effets sont traités.
- **Un réglage de volume séparé pour la musique**, sans objet tant qu'il n'y a pas de musique.
- **La collision triangulaire de la Ronce**, écartée au chantier précédent et toujours écartée.
- **Le déplacement des figures enveloppantes** (cercle, carré), qui naissent déjà dans
  l'arène : seuls les spawns de bord et le ruissellement changent au §3.
