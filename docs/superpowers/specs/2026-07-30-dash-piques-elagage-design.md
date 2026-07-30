# Ink Point — Élagage des power-ups, couronne de piques, Plume renforcée

**Date :** 2026-07-30
**Statut :** validé, prêt pour le plan d'implémentation
**Portée :** suppression de deux power-ups, refonte du Trait d'encre en couronne de piques, renforcement et mise en visibilité de la Plume

---

## 1. Contexte

Trois constats de playtest, tous sur le même thème — ce que le joueur voit ne correspond pas à ce que le jeu fait.

**Le Trait d'encre ne trace rien.** `trailSystem` recopie la position du joueur sur une zone de rayon 12 à chaque pas. Le joueur fait un rayon 9 : la zone est un disque collé sous son sprite, invisible, qui ne laisse aucune trace. Ce n'est pas un défaut de rendu — il n'y a rien à voir. Le commentaire du fichier assume déjà le raccourci (« un vrai sillage coûte une entité par pas, ajustement post-playtest possible »). Sa portée réelle de mise à mort est de 19 px (12 + rayon ennemi), soit à peine plus que de se faire toucher.

**La Plume est invisible et faible.** 720 px/s pendant 220 ms font 158 px de course — moins de deux fois la longueur du sprite — dans un couloir mortel de 32 px de large (rayon joueur 9 + rayon ennemi 7). Aucun effet visuel n'accompagne la ruée : le sprite se déplace vite, c'est tout. Rien ne dit où l'on va arriver ni ce qu'on balaie au passage.

**Deux power-ups ne portent pas leur place.** La Rature (`strike`) et le Séchage (`dryspell`) diluent le tirage de cartes et l'attention du joueur sans apporter de décision intéressante.

### Objectifs

1. **Élaguer** : retirer la Rature et le Séchage, et tout ce qui en dépend.
2. **Rendre le Trait d'encre visible et dangereux** en le transformant en couronne de piques, avec un avertissement avant expiration.
3. **Faire de la Plume une pièce maîtresse** : plus large, plus longue, traçante — et lisible.

### Principe directeur

**Ce qui est affiché est ce qui tue.** Aucun indicateur décoratif posé à côté d'une hitbox invisible : les piques dessinées *sont* les zones mortelles, et le sillage affiché de la ruée *est* le couloir qui tue. Rien à synchroniser, donc rien qui puisse mentir.

### Hors périmètre

- Aucun moteur audio (le réglage de volume reste inerte).
- Aucun rééquilibrage des autres power-ups (Bombe, Gel, Buvard, Halo).
- Aucun changement au système de vagues ni à la difficulté.

---

## 2. Suppression de la Rature et du Séchage

### 2.1 Ce que touche la suppression

| Fichier | Rature (`strike`) | Séchage (`dryspell`) |
|---|---|---|
| `sim/data/powerups.ts` | entrée de `PowerUpKind`, `POWERUP_KINDS`, `POWERUP_ID`, `POWERUP_BY_ID`, `POWERUP_BASE`, `HAZARD_STRIKE` | idem, sans constante `HAZARD_*` |
| `sim/powerups/activate.ts` | le `case 'strike'` | le `case 'dryspell'` |
| `sim/upgrades/stats.ts` | champ `strikeWidth` | champ `dryspellDurationMs` |
| `sim/systems/hazards.ts` | `HAZARD_STRIKE` dans `LETHAL` et son import | — |
| `sim/world.ts` | — | champ `slowUntil` et son initialisation |
| `sim/systems/homing.ts` | — | lecture de `slowUntil` / `slowFactor` |
| `sim/systems/shard.ts` | — | lecture de `slowUntil` / `slowFactor` |
| `sim/data/upgrades.ts` | cartes `strike-width`, `wide-strike` | carte `dryspell-duration` |
| `render/views/hazard.ts` | entrée `HAZARD_STRIKE` de `COLORS` | — |
| `render/views/pickup.ts` | `drawStrike` et son entrée de table | `drawDryspell` et son entrée |
| `ui/icons.ts` | icône `strike` | icône `dryspell` |
| `i18n/locales/{en,fr}.json` | 4 clés (2 cartes × nom + description) | 2 clés |
| tests | cas `strike` d'`activate.test.ts` | cas `dryspell` d'`activate.test.ts`, référence de `shard.test.ts` |

### 2.2 Identifiants numériques : des trous, pas une renumérotation

Retirer `strike` (id 4) et `dryspell` (id 8) laisse des trous dans `POWERUP_ID` et `POWERUP_BY_ID`, de même que `HAZARD_STRIKE` (4) dans les kinds de zone. **Ces trous sont conservés** : ce sont des étiquettes opaques, rien ne les parcourt par plage, et les décaler ferait bouger du code qui n'a aucune raison de bouger. `POWERUP_BY_ID` porte déjà `null` à l'indice 0 et ses lecteurs gèrent l'absence (`POWERUP_BY_ID[...] ?? 'blast'` dans `stage.ts`) : deux `null` de plus ne changent rien. Un commentaire dans `powerups.ts` explique pourquoi les trous existent, pour que personne ne « range » ça plus tard.

### 2.3 Conséquence sur le tirage de cartes

Le pool passe de 19 à 16 cartes (deux communes, une rare). `drawUpgrades` supporte un pool plus court sans casser : `pickWeighted` renvoie `null` sur un pool vide et la boucle `while (result.length < CHOICES)` s'arrête. Le §4.3 en rajoute une, ramenant le pool à 17.

---

## 3. Le Trait d'encre devient une couronne de piques

### 3.1 Géométrie

Sept piques en orbite autour du joueur :

| Réglage | Valeur |
|---|---|
| Nombre de piques | 7 |
| Rayon d'orbite | 40 px |
| Rayon mortel d'une pique | 11 px |
| Portée extérieure | 51 px (contre 19 px avant) |
| Vitesse de rotation | 1,6 rad/s |
| Durée de base | 5 000 ms (contre 3 000 ms) |

Chaque pique est **une entité de zone à part entière**, avec son `Hazard`, sa `Position`, sa `PrevPosition` et son `Lifetime`. Le rendu dessine un éclat d'encre effilé du joueur vers chaque pique : la forme visible coïncide avec la zone qui tue, sans code de synchronisation.

Les piques portent un kind de zone à elles, `HAZARD_SPIKE` (valeur 7, la première libre) — et non `HAZARD_TRAIL`, que le §4.2 réaffecte au sillage de la ruée. Les deux se dessinent différemment (éclat effilé contre tache d'encre) et le rendu doit pouvoir les distinguer. `HAZARD_SPIKE` rejoint l'ensemble `LETHAL` de `hazards.ts`.

Les trous entre les piques sont voulus — c'est ce qui en fait des piques plutôt qu'une aura. À sept piques, l'écart angulaire vaut 2π/7 ≈ 0,90 rad, balayé en 0,56 s à 1,6 rad/s : un ennemi qui se glisse dans un trou se fait rattraper par la rotation.

### 3.2 Le système

`trailSystem` devient `spikeSystem`. À chaque pas, il repositionne chaque pique à
`joueur + R·(cos(θᵢ + ωt), sin(θᵢ + ωt))`, où `θᵢ = 2πi/7` est l'angle de base de la pique et `t` le temps de simulation. La rotation dérive donc de `world.time`, pas d'une horloge murale : elle est déterministe et gèle pendant un hitstop comme le reste du monde.

L'angle de base et le rayon d'orbite sont portés par un composant `Orbiting { angle, radius }` plutôt que détournés d'un champ existant : `Hazard.growthRate` est libre sur ces entités, mais y ranger un angle rendrait les deux illisibles.

`PrevPosition` est indispensable, pour la même raison qu'avant sur le Trait : ces zones bougent, et sans elle le rendu ne peut pas les interpoler — elles décrocheraient visiblement du joueur, lui interpolé, sur un écran à haut rafraîchissement.

### 3.3 Avertissement de fin

Sur les **900 dernières millisecondes**, les piques pulsent en opacité et se rétractent légèrement vers le joueur. La pulsation est **sinusoïdale à ~5 Hz, pas un clignotement binaire** : même lisibilité (« ça va finir »), sans effet stroboscopique. La surface concernée est petite et centrée sur le joueur, loin d'un flash plein écran.

L'effet est piloté par `Lifetime.remaining` de la pique, transmis au rendu. Le `lifeRatio` actuel de `hazardView` est calculé sur une fenêtre de 400 ms et ne suffit pas : le rendu reçoit désormais aussi le temps restant brut.

### 3.4 Équilibrage assumé

C'est un buff net : la portée passe de 19 à 51 px et la durée de 3 à 5 s. Avec la rare « Encre vive » (`lasting-trail`, durée doublée), on atteint 10 s de quasi-invulnérabilité. C'est un choix délibéré — le power-up était jusqu'ici sans effet perceptible. Le levier de correction, s'il faut en tirer un après playtest, est la durée de base.

La carte `trail-duration` (+900 ms) reste valable telle quelle.

---

## 4. La Plume renforcée

### 4.1 Puissance

| Réglage | Avant | Après |
|---|---|---|
| Rayon du couloir mortel | 9 (rayon du joueur) | **40** (nouveau stat `dashRadius`) |
| Largeur du couloir | 32 px | **80 px** |
| Durée | 220 ms | **380 ms** |
| Distance parcourue | 158 px | **274 px** |
| Vitesse | 720 px/s | 720 px/s (inchangée) |
| Sillage mortel | aucun | segments tous les 30 ms, vie 800 ms |
| Invulnérabilité après | aucune | 200 ms |

`dashKillSystem` teste aujourd'hui `rayon joueur + rayon ennemi`. Il lira `stats.dashRadius` à la place. Aucun test balayé (« swept capsule ») n'est nécessaire : à 720 px/s et 16,7 ms par pas, le joueur avance de 12 px par pas contre un rayon de 40 — le recouvrement est large, rien ne peut passer entre deux pas.

L'invulnérabilité de 200 ms est posée au moment où `playerMovementSystem` retire `Dashing` (il est déjà le seul endroit qui détecte la fin de la ruée). Elle répond au défaut de conception que le commentaire d'`activate.ts` documente déjà : la Plume est le recours quand on est encerclé, et elle tuait dans la situation même où on l'active — ici en s'arrêtant en pleine foule.

### 4.2 Le sillage, qui est aussi le visuel

Un nouveau `dashWakeSystem` dépose un segment de zone tous les 30 ms le long du parcours, de rayon `stats.dashRadius`, d'une durée de vie de 800 ms. Ces segments réutilisent `HAZARD_TRAIL`, qui retrouve ainsi son sens : la constante désignait jusqu'ici une zone collée au joueur qui ne traînait rien, elle devient le sillage de la ruée.

C'est **le même objet qui tue et qui se voit**. La portée et la largeur de la ruée se lisent donc directement à l'écran, sans indicateur séparé susceptible de diverger de la réalité.

S'y ajoutent des **images rémanentes** : pendant la ruée, une copie fantôme de la pointe de plume toutes les ~40 ms, qui s'efface en 250 ms. Rendu seul, dans `src/render/`, derrière le garde « mouvement réduit » — c'est du mouvement à l'écran, comme les particules et la secousse.

### 4.3 Une carte pour la largeur

Nouvelle carte commune `dash-radius` : **+30 % de rayon de ruée**, `requires: 'dash'`. Elle donne un axe de build au power-up qui devient la pièce maîtresse, et ramène le pool à 17 cartes après les trois suppressions du §2. Le nom d'affichage « Plume large » / « Broad Nib » est libéré par la suppression de la Rature et se réutilise tel quel.

---

## 5. Tests

L'environnement Vitest est `node`, sans DOM ni WebGL : les tests portent sur la simulation et sur les fonctions pures, jamais sur le rendu.

| Fichier | Couverture |
|---|---|
| `sim/systems/spikes.test.ts` (neuf, remplace `trail.test.ts`) | position orbitale d'une pique à un instant donné ; les sept piques restent équidistantes ; elles suivent le joueur ; elles expirent ensemble |
| `sim/powerups/activate.test.ts` | `trail` crée sept zones et non une ; cas `strike` et `dryspell` supprimés |
| `sim/systems/dash-wake.test.ts` (neuf) | espacement des segments le long de la course ; rayon égal à `stats.dashRadius` ; aucun segment hors ruée |
| `sim/systems/dash-kill.test.ts` | la portée suit `stats.dashRadius`, pas le rayon du joueur |
| `sim/systems/player-movement.test.ts` | `Invulnerable` est posé à la fin de la ruée, et pas avant |
| `sim/upgrades/draw.test.ts` | le tirage reste à trois cartes avec le pool réduit |
| `i18n/parity.test.ts` | passe après retrait des six clés et ajout des deux nouvelles |

Le rendu (piques dessinées, pulsation de fin, images rémanentes) se vérifie à l'écran, pas en test unitaire.

---

## 6. Vérification manuelle

1. Ni la Rature ni le Séchage n'apparaissent au sol, et leurs cartes ne sortent plus au choix d'amélioration.
2. Ramasser le Trait d'encre fait apparaître sept piques nettement visibles autour du joueur, qui tournent et tuent ce qu'elles touchent.
3. Les piques pulsent et se rétractent sur la dernière seconde, assez tôt pour qu'on ait le temps de réagir.
4. La ruée trace un large couloir d'encre visible qui tue ce qui s'y trouve, y compris les ennemis qui se referment derrière le joueur.
5. S'arrêter en pleine foule à la fin d'une ruée ne tue plus instantanément.
6. Mouvement réduit activé : les images rémanentes disparaissent ; les piques et le sillage restent (ce sont des zones de jeu, pas des effets).
