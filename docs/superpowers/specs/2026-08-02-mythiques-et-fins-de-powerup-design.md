# Trois mythiques qui changent la run, et des fins de power-up lisibles

## 1. Intention

Deux constats de jeu, sans rapport l'un avec l'autre mais livrés ensemble.

**Les trois mythiques sont sans intérêt.** Elles sont pourtant la rareté la plus haute,
une seule par run, et une garantie de pitié en impose une à la vague 10 : c'est la carte
qui devrait faire basculer une partie.

- **« Seconde encre »** accorde un Halo, immédiatement et jusqu'à ce qu'il serve. Or le
  Halo est une pastille au sol de poids 1,5 sur ~20,5, soit 7 % des ramassages : sur une
  run on en croise plusieurs. **La carte la plus rare du jeu vaut un ramassage chanceux.**
- **« Encre vive »** (un ennemi gelé qui meurt gèle ses voisins) et **« Rémanence »**
  (l'explosion laisse une braise) font *un peu plus* de ce qu'on fait déjà, et sont
  conditionnées à un power-up précis (`requires: 'freeze'` / `'blast'`).

**Rien n'annonce la fin d'un power-up.** Le jeu a le vocabulaire — la couronne de Ronce
pulse et se rétracte sur ses 900 dernières millisecondes (`warnMs`) — mais ne s'en sert
qu'une fois. Le trou le plus grave n'est pas une zone au sol : c'est **l'invincibilité de
la Ronce**, 5 s (10 avec « Ronce vivace »), dont le seul signe est un joueur à 55 %
d'opacité, constant du début à la fin. C'est le seul effet où ne pas savoir tue.

## 2. La contrainte qui gouverne le remplacement des mythiques

**Au moins une mythique doit rester inconditionnelle.** « Seconde encre » est aujourd'hui
la seule sans `requires`. Un joueur qui n'a croisé ni Bombe ni Gel ne peut tirer aucune
des deux autres — y compris à la vague 10, où la pitié en réclame une. La supprimer sans
remplaçante inconditionnelle laisserait des runs sans aucune mythique.

**Les trois nouvelles sont donc toutes inconditionnelles.** C'est aussi ce qui les rend
intéressantes : une mythique qui change la façon de jouer n'a pas à dépendre d'un
power-up qu'on n'a peut-être jamais vu.

## 3. Ce qui part

| Élément | Fichier |
| --- | --- |
| cartes `living-ink`, `afterburn`, `second-ink` | `src/sim/data/upgrades.ts` |
| 12 clés i18n (3 cartes × 2 clés × 2 locales) | `src/i18n/locales/{fr,en}.json` |
| `secondInkSystem` | `src/sim/systems/second-ink.ts` (fichier supprimé) et son appel dans `step.ts` |
| composant `SecondInkSpent` | `src/sim/components/index.ts` |
| branche `livingInk` | `src/sim/systems/death.ts` |
| `spawnAfterburn` et sa branche | `src/sim/systems/lifetime.ts` |
| `RULE_TUNING.afterburn` | `src/sim/data/powerups.ts` |
| `HAZARD_AFTERBURN`, son entrée `LETHAL` et sa couleur | `powerups.ts`, `hazards.ts`, `render/views/hazard.ts` |

L'identifiant de zone **6 est retiré, jamais réattribué** : un commentaire le dit à sa
place, comme les indices 4 et 8 de `POWERUP_BY_ID`.

Deux commentaires mentent dès que « Rémanence » disparaît et doivent suivre :
`spawnQuillBlast` (`seeker.ts`), qui explique de quelles cartes la Volée hérite, et
l'en-tête de `RULE_TUNING`.

## 4. Papier calque

**Un fantôme de ton propre trajet d'il y a 2,5 s te suit et tue ce qu'il touche.**

Tu ne poses plus des zones : tu les **dessines en te déplaçant**. Passer deux fois au même
endroit y concentre la mort ; foncer en ligne droite ne laisse qu'un fil. C'est la seule
mythique qui change la façon de bouger, et elle réutilise l'idée qui est déjà au cœur du
jeu — les ennemis te poursuivent avec du retard, ton calque aussi.

Le nom est littéral : un calque est une copie décalée du trait d'origine.

- Règle `tracingPaper`, sans `requires`.
- Composant marqueur `Tracing`, nouveau genre de zone `HAZARD_TRACING = 11`, dans `LETHAL`.
- Système `src/sim/systems/tracing.ts`, avec son propre historique de positions (même
  patron que `homingSystem`, qui garde le sien dans une `WeakMap` par monde).
- Le fantôme naît **quand `world.time` a dépassé `delayMs`**, pas avant : sinon il
  camperait au point de spawn pendant deux secondes et demie.
- Un seul fantôme par run. Il ne meurt pas : pas de `Lifetime`.
- Réglages : `RULE_TUNING.tracingPaper = { delayMs: 2500, radius: 14 }`. Le rayon est
  supérieur à celui du joueur (9) pour que le calque se lise comme une tache, pas comme
  un double exact.

**Rendu** — un disque plein au rayon mortel exact, en `INK.paper` à opacité moyenne, cerné
d'un liseré pointillé : le pointillé dit « copie » sans jamais rogner la surface qui tue.
Il porte `PrevPosition`, donc `stage.ts` l'interpole comme toute zone mobile.

## 5. Double trait

**Chaque power-up ramassé se déclenche deux fois**, la seconde 400 ms plus tard, **à la
position du joueur à cet instant** — pas là où la pastille a été prise.

C'est ce décalage qui fait la carte : la première salve tombe où tu étais, la seconde où
tu vas. Une Bombe devient deux Bombes qui se recouvrent à moitié ; une Ronce se recharge à
peine expirée ; une Bavure part dans une autre direction. La carte améliore **tout** le
sac, y compris les power-ups qu'on trouvera plus tard.

- Règle `doubleStroke`, sans `requires`.
- Composant `DelayedPowerUp { kind: ui8, remaining: f32 }`.
- Système `src/sim/systems/delayed-powerup.ts`, placé **juste avant `pickupSystem`** dans
  `step.ts` pour que la seconde activation soit traitée par les mêmes systèmes que la
  première, dans le même pas.
- **Seul `pickupSystem` programme un différé.** `activatePowerUp` n'en programme jamais :
  sans cette règle, la seconde salve en programmerait une troisième, et ainsi de suite.
- Réglage : `RULE_TUNING.doubleStroke = { delayMs: 400 }`.

## 6. Le papier boit

**Chaque ennemi tué laisse une tache d'encre mortelle**, ~1,2 s.

Tuer cesse d'être un événement ponctuel : le champ de bataille se couvre. Les grappes
d'ennemis deviennent des réactions en chaîne, et le joueur gagne à les laisser venir avant
de frapper.

- Règle `thirstyPaper`, sans `requires`.
- **Réutilise `HAZARD_INK_TRAIL`**, le genre créé pour la trace de Bavure : une tache
  d'encre mortelle est exactement la même chose, avec d'autres réglages. Son commentaire
  cesse de nommer la Bavure et parle de « trace d'encre » en général.
- La tache naît dans `deathSystem`, au point où `enemyKilled` est déjà émis — c'est le
  seul endroit qui connaît toutes les morts, quelle qu'en soit la cause.
- Réglages : `RULE_TUNING.thirstyPaper = { radius: 22, lifeMs: 1200 }`.

**La cascade est assumée** : une tache tue un voisin, qui laisse sa tache, qui en tue un
autre. Elle est bornée par le nombre d'ennemis vivants, jamais infinie — mais c'est le
comportement à surveiller en playtest, et le rayon de 22 (contre 26 pour la goutte de
Bavure) le tient en laisse.

## 7. Les zones qui s'assèchent

Toute zone qui dure prévient de sa fin **sur ses 800 dernières millisecondes**, en
s'asséchant comme une plume qui manque d'encre.

Deux mouvements simultanés :

- le remplissage pâlit, de son opacité pleine à **45 %** ;
- un **liseré apparaît au rayon mortel exact** et se renforce à mesure, de 0 à 90 %.

**La zone ne rétrécit jamais.** C'est tout l'enjeu : rétrécir le dessin d'une zone qui tue
encore laisserait une bande meurtrière hors du trait, contre la règle que le projet
défend partout. Le liseré fait l'inverse — il rend la frontière *plus* explicite au moment
où le remplissage s'efface.

S'applique à la Bavure, sa trace d'encre, la zone de Gel et le calque. Pas à la Bombe, qui
grandit et meurt trop vite pour qu'un avertissement veuille dire quelque chose ; pas à la
couronne de Ronce, qui a déjà le sien (`warnMs`, pulsation et rétraction).

Constante partagée `DRY_MS = 800` dans `render/views/hazard.ts`, avec un helper
`dryness(remainingMs)` rendant 1 (humide) à 0 (sec).

## 8. L'arc d'invincibilité

Un arc autour du curseur, qui **se vide** au fil de l'invulnérabilité restante.

### 8.1 Le problème à résoudre d'abord

`Invulnerable` ne porte que `remaining`. Une jauge a besoin d'une référence, et il n'y en
a pas : le composant est posé depuis **quatre endroits** avec des durées différentes —
Ronce (`activate.ts`, 5 000 ms et plus), Halo brisé (`collision.ts`, 1 000 ms),
atterrissage de Ruée (`player-movement.ts`), début de vague (`waves.ts`) — et tous
prolongent en `Math.max` sans savoir ce qu'ils prolongent.

`Invulnerable` gagne donc un champ `total`. **Règle unique, sans exception : partout où
`remaining` est écrit, `total` reçoit la même valeur.** L'arc part alors toujours plein,
quelle que soit la source, y compris quand une grâce en prolonge une autre.

### 8.2 Le rendu

`stage.ts` transmet à `playerView` le rapport `remaining / total` (0 en l'absence du
composant). L'arc est tracé en `INK.paper`, fin, à un rayon légèrement supérieur au
joueur, et se referme dans le sens horaire.

Le voile actuel à 55 % d'opacité **reste** : il dit « protégé », l'arc dit « jusqu'à
quand ». Les deux répondent à des questions différentes.

## 9. Tests

Nouveaux :

- `tracing.test.ts` — le fantôme suit bien la position d'il y a `delayMs` ; il ne naît pas
  avant ; il tue ce qu'il touche ; il n'y en a jamais deux.
- `delayed-powerup.test.ts` — la seconde salve part après `delayMs`, à la position
  **courante** du joueur et non à celle du ramassage ; elle n'en programme jamais une
  troisième ; sans la règle, rien n'est programmé.
- `thirsty-paper` (dans `death.test.ts` ou dédié) — une mort laisse une tache mortelle ;
  sans la règle, aucune.

À étendre :

- `upgrades.test.ts` (i18n) attrapera de lui-même les clés orphelines et manquantes.
- `collision.test.ts` — `total` est posé à chaque écriture de `remaining`, depuis les
  quatre sources.
- `powerups.test.ts` — l'identifiant de zone 6 reste retiré.

**Chaque nouvelle règle doit être prouvée par sabotage** : les chaînes `tracingPaper`,
`doubleStroke` et `thirstyPaper` vivent dans un `Set<string>` non typé, et une faute de
frappe rendrait la mythique silencieusement inerte — le piège déjà rencontré sur
`nestedQuills` et `splitSplatter`.

## 10. Hors périmètre

- Aucun réglage de la courbe de difficulté, alors que trois mythiques inconditionnelles
  augmentent la puissance moyenne d'une run. À observer en playtest.
- Aucune quatrième ou cinquième mythique : trois suffisent à couvrir la pitié, et chacune
  est un système à équilibrer.
- Le voile d'invulnérabilité à 55 % n'est pas retouché, malgré sa durée désormais longue.
