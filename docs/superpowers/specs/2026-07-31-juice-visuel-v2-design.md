# Juice visuel v2 — page révélée, mort mise en scène, power-ups signés

## 1. Intention

Le juice d'impact d'Ink Point est déjà dense : hitstop, secousse directionnelle,
éclats coniques, ondes de choc, flashs, rémanences, punch du HUD, boil/grain/vignette.
Trois manques subsistent, et aucun ne concerne l'impact :

1. **Le fond ne dit rien.** L'arène est un aplat `INK.bg` vide. Le jeu raconte une
   plume sur une page, et il n'y a pas de page.
2. **La mort n'est pas une scène.** Un flash, une secousse, 800 ms d'attente, l'écran
   de fin. Le moment le plus chargé d'une run est le moins mis en scène.
3. **Les six power-ups se déclenchent à l'identique.** `applyJuice` reçoit un `kind`
   et le jette (`src/app/juice.ts:169`) : même souffle ambre pour la Bombe, le Givre,
   la Ronce d'encre, le Buvard, la Ruée et le Halo.

Cette spec traite ces trois points. **L'audio reste hors périmètre** — il fera l'objet
d'une spec propre (moteur WebAudio, désactivé par défaut, branché sur le réglage de
volume déjà persisté par `src/ui/screens/settings.ts`).

## 2. Le fond : une page révélée par la plume

### 2.1 Ce qu'on voit

Une page réglée occupe toute l'arène : lignes horizontales espacées de 32 px, plus une
marge verticale rouge à 58 px du bord gauche. **Hors du halo, elle est invisible.** Un
disque d'environ 165 px de rayon, centré sur le joueur, la révèle en dégradé — pleine
opacité (0,34) au centre, nulle au bord. Un voile lumineux très faible (0,055) accompagne
le disque pour que le halo se sente même entre deux lignes.

C'est la variante « révélation pure » : le fond n'existe littéralement que là où le joueur
se trouve. Retenue en connaissance de la contrepartie — hors du halo, le fond n'offre
aucun repère spatial. C'est un parti pris esthétique assumé, pas un oubli.

### 2.2 Où ça vit

Un `pageLayer` (`Container`) inséré dans `content`, **avant** `worldLayer`. Ce placement
lui donne exactement ce qu'il faut :

- le masque d'arène et le zoom du viewport, comme tout `content` ;
- la vignette, posée sur `content` — la page s'assombrit donc sur les bords avec le reste ;
- **pas** le boil, posé sur `worldLayer` seul. La réglure est du papier, pas du trait
  d'encre : elle ne doit pas frémir à 8 fps.

Nouveau module `src/render/page.ts`, exposant `createPage(container)` avec
`resize(width, height)`, `update(x, y)` et `setEnabled(enabled)`. `stage.ts` l'appelle
depuis `sync`, avec la position **interpolée** du joueur — la même que `playerView`, via
`lerp(PrevPosition, Position, alpha)`. Quand `world.playerEid < 0` (mort, entre deux runs),
la page se retire : `update` reçoit alors `null` et le calque s'efface.

### 2.3 Comment c'est dessiné

La réglure est tracée une fois dans un `Graphics` à opacité pleine, redessiné seulement
sur `resize`. La révélation est un **masque** : un `Graphics` en dégradé radial, déplacé
à chaque frame sur la position du joueur, posé comme `mask` du calque. Déplacer un masque
coûte une transformation par frame ; redessiner la réglure en coûterait une par ligne.

## 3. La séquence de mort

### 3.1 Le fait qui rend tout ça simple

Pendant l'état `dying`, **la simulation est déjà entièrement gelée** : `game.ts:onStep`
n'appelle `stepWorld` que dans l'état `playing`. La séquence de mort est donc une
animation purement côté rendu, jouée sur un monde immobile. Aucune écriture dans la
simulation, aucun risque pour le déterminisme, aucun `Math.random()` interdit à contourner.

### 3.2 Le déroulé

Quatre temps, 1,6 s au total :

| Temps | Durée | Ce qui se passe |
| --- | --- | --- |
| Impact | — | Flash pleine intensité, secousse maximale (déjà en place) |
| **Arrêt** | 340 ms | Tout se fige. Les ennemis **blanchissent** vers `INK.paper` : le monde est suspendu, plus hostile. Le joueur se dilate légèrement (×1,25) — il encaisse. |
| **Détonations** | 760 ms | Les ennemis explosent **du plus proche au plus lointain**, en onde depuis le point d'impact. Chacun : 11 éclats `INK.danger`, un petit anneau, un soupçon de flash. |
| **Dispersion** | 500 ms | Le joueur éclate : 34 éclats `INK.paper`, un anneau de 170 px, flash plein. La page disparaît avec lui — l'arène finit noire. |

Le délai de détonation d'un ennemi vaut `(d / dMax) × 620 ms + jitter`, où `d` est sa
distance au point de mort et `dMax` la diagonale de l'arène × 0,62. Le grain de désordre
(`jitter`, jusqu'à 70 ms) évite l'effet métronome d'une onde parfaitement régulière.

**Le jitter doit être déterministe** — il dérive de l'`eid` de l'ennemi, pas de
`Math.random()`. Ce module vit dans `src/render/`, où `Math.random()` est permis, mais une
séquence de mort reproductible se débogue et se teste ; un tirage par frame ne se teste pas.

### 3.3 Sauter la séquence

**N'importe quelle touche pendant `dying` saute directement à l'écran de fin.** Sur un jeu
où l'on relance vingt fois de suite, une animation qu'on ne peut pas couper devient une
punition dès la troisième mort. Le routage clavier de `game.ts` gagne une branche `dying`,
placée avant le reste, qui force `deathTimer` à 0.

### 3.4 Où ça vit

Nouveau module `src/render/fx/death-sequence.ts` : `createDeathSequence()` avec
`start(world, x, y)`, `update(dtMs, fx)` et `readonly done: boolean`. Il lit les positions
des ennemis **une seule fois** au `start` (le monde est gelé, rien ne bougera plus) et
pilote ensuite `particles`, `shockwaves` et `flash` comme le fait `juice.ts`.

`stage.ts` gagne un drapeau de masquage par entité, alimenté par la séquence : un ennemi
déjà détoné n'est plus dessiné. Le blanchiment de l'arrêt est un paramètre de teinte passé
à `enemyView.update`.

### 3.5 Le bug à corriger au passage

`DEATH_SLOWMO_MS` sert aujourd'hui à deux choses : la durée du ralenti dans `juice.ts` et
la durée de l'état `dying` dans `game.ts`. Or **le ralenti ne s'exécute jamais** —
`timeScaleFor` n'est appelé que dans l'état `playing`, et la simulation est gelée dès que
`playerDied` fait basculer vers `dying`.

Conséquence, vérifiée par test : `applyJuice` pose `deathSlowmoRemaining = 800`, personne
ne le décompte, et `juice` n'est **pas** réinitialisé par `startRun()` (`game.ts:71`, un
`const` créé une fois). **Chaque run après la première démarre donc au ralenti à 0,15×
pendant 800 ms.**

Le correctif tient en deux gestes :

- `startRun()` réinitialise l'état de juice ;
- `DEATH_SLOWMO_MS` / `DEATH_SLOWMO_SCALE` et le champ `deathSlowmoRemaining` disparaissent,
  remplacés par une constante `DEATH_SEQUENCE_MS = 1600` qui dit ce qu'elle est : la durée
  de l'état `dying`, désormais celle de la séquence (340 + 760 + 500, plus la marge du
  battement d'impact).

Un test de non-régression doit couvrir le scénario complet mort → relance.

## 4. Les signatures de power-up

`applyJuice` cesse de jeter `event.kind` : il le repasse par `POWERUP_BY_ID` et route vers
six signatures. Chacune se distingue sur un axe **structurel** — le sens du mouvement, le
rythme, le comportement des éclats — et pas seulement par la couleur.

### 4.1 Bombe — la détonation à deux temps

Flash ambre à 0,55. Un premier anneau (92 px, 300 ms, épaisseur 4), puis un **second
décalé de 90 ms** (10 → 132 px, 560 ms, à 55 % d'opacité), avec une reprise de flash.
22 éclats à 210–350 px/s qui décélèrent. La seule des six à frapper deux fois : elle se
lit comme la plus violente.

### 4.2 Givre — l'onde qui prend en glace

Flash `INK.frost` à 0,22. L'onde n'est **pas un cercle lisse** : 16 aiguilles radiales de
longueur alternée poussent depuis un cercle intérieur (78 % du rayon). 18 éclats filent à
150–285 px/s puis **s'arrêtent net** entre 240 et 400 ms, et fondent sur place. Le gel se
lit dans le mouvement, pas seulement dans la couleur.

### 4.3 Buvard — l'implosion

Le seul qui va **vers l'intérieur**. 26 éclats naissent sur un cercle de 96–120 px et sont
aspirés vers le centre **en accélérant**, avec une composante tangentielle qui les fait
tourner. L'anneau se **contracte** (100 → 14 px) au lieu de s'étendre. La spirale à trois
bras s'amorce dans le même geste. On comprend qu'il attire avant qu'un ennemi ait bougé.

### 4.4 Ruée — la détente latérale

**Aucun anneau.** Un anneau dit « ça part de partout » ; or la ruée part quelque part.
16 traits d'élan giclent à l'opposé de la direction (cône de ±0,45 rad), trois chevrons
filent vers l'avant sur 130 px, et un trait perpendiculaire claque à l'appui. Le seul
déclenchement orienté des six — l'angle vient de `Facing`, déjà porté par l'entité.

### 4.5 Halo — celui qui ne détone pas

Une protection ne devrait pas exploser. **Pas de burst du tout.** L'anneau du joueur —
déjà dessiné par `src/render/views/player.ts:35`, mais qui apparaît aujourd'hui d'un coup
(`halo.visible = hasHalo`) — s'installe en 320 ms (ease-out) puis **respire** doucement
(±4,5 % d'amplitude, période ~1,25 s) tant qu'il couvre. Sept motes tournent lentement avec lui.

Par contraste, ce silence rend les quatre autres plus percutants, et la **rupture** du halo
— déjà spectaculaire dans `juice.ts` (secousse 14, 24 éclats, flash 0,12, anneau 200) —
redevient enfin l'événement bruyant de ce power-up.

### 4.6 Ronce d'encre — pas encore de signature propre

La Ronce d'encre (`bramble`) est arrivée dans le dépôt juste avant cette tâche, dont le
brief ne la couvrait pas. Elle conserve donc le souffle générique que jouaient les six
power-ups avant cette spec : secousse, burst ambre, flash, anneau — sans axe structurel qui
lui soit propre. C'est un choix explicite pour ne pas la faire disparaître en attendant
qu'elle en reçoive une, pas un oubli.

## 5. Primitives de rendu à étendre

Les signatures demandent trois capacités que `particles.ts` et `shockwave.ts` n'ont pas.
Chacune est un ajout optionnel : le comportement par défaut ne change pas.

**`BurstOptions` gagne :**

- `spawnRadius?: number` — les éclats naissent sur un cercle plutôt qu'au point (Buvard) ;
- `converge?: boolean` — vélocité dirigée vers le centre, avec accélération à l'approche,
  et une composante tangentielle (Buvard) ;
- `stallAfterMs?: number` — au-delà de ce délai, la particule s'immobilise et fond sur
  place au lieu de continuer (Givre).

**`ShockwaveOptions` gagne :**

- `fromRadius?: number` — rayon de départ, pour un anneau qui se contracte (Buvard) ;
- `needles?: number` — l'anneau se dessine en aiguilles radiales plutôt qu'en cercle (Givre).

**`player.ts` gagne** un état d'installation du halo (progression + phase de respiration),
avancé par `update` avec le `dtMs` réel.

Ces extensions sont testables isolément : `burstAngle` et `ringRadius` sont déjà des
fonctions pures exportées et testées ; les nouvelles courbes suivent le même modèle.

## 6. Mouvement réduit

Le réglage existant (`stage.setEffects`, piloté par `resolveReducedMotion`) coupe
boil/grain/vignette, et `motionEnabled` coupe secousse et particules dans `juice.ts`. Les
trois nouveautés s'y branchent selon ce qu'elles font réellement bouger :

- **La page.** Sous mouvement réduit, le halo est **désactivé** et la réglure se dessine
  statiquement à opacité uniforme faible (0,07) sur toute l'arène. La page reste, la
  révélation mobile disparaît. C'est le seul cas où l'esthétique retenue en §2.1 est
  assouplie — un large disque lumineux qui suit le joueur est précisément le genre de
  changement de luminance que ce réglage existe pour éviter.
- **La séquence de mort.** L'ordre et le rythme sont conservés (ce n'est pas du mouvement
  vestibulaire), mais les éclats et la secousse restent derrière `motionEnabled`, comme
  partout ailleurs dans `juice.ts`. La mort reste une scène, sans projection à l'écran.
- **Les signatures de power-up.** Entièrement derrière `motionEnabled`, comme le burst
  générique qu'elles remplacent. Aucun changement de contrat.

## 7. Tests

La frontière est la même que partout dans ce dépôt : `src/render/` n'est pas testé
directement (pas de Pixi en test), mais **toute la logique de timing et de courbe en est
extraite en fonctions pures**, qui sont testées.

| Fonction pure | Ce qu'on vérifie |
| --- | --- |
| `revealAlpha(distance, radius)` | 0,34 au centre, 0 au bord, monotone décroissante |
| `detonationDelay(distance, maxDistance, eid)` | monotone en distance ; déterministe pour un `eid` donné ; borné par la durée de la phase |
| `deathPhaseAt(elapsed)` | les quatre phases dans l'ordre, aux bornes exactes |
| `haloInstall(elapsed)` | 0 à t=0, 1 après 320 ms, respiration bornée à ±4,5 % |
| `convergeSpeed(...)`, `stallDamping(...)` | accélération à l'approche du centre ; immobilisation nette au délai |

Deux tests de comportement complètent :

- **Non-régression du ralenti** (§3.5) : mort → relance, le premier pas de la nouvelle run
  rend un `timeScale` de 1.
- **Routage des signatures** : `applyJuice` sur un `powerupUsed` de chaque `kind` produit
  des appels distincts sur un `fx` espionné pour les six kinds — et notamment **aucun**
  burst pour le Halo.

`src/sim/purity.test.ts` continue de garantir qu'aucun de ces ajouts ne franchit la
frontière : tout ce que décrit cette spec vit dans `src/render/` et `src/app/`.

## 8. Hors périmètre

- **L'audio.** Spec séparée. Le réglage de volume reste inerte d'ici là.
- **Le rendu des zones** (bombe, gel, buvard, sillage) : déjà différencié, non touché.
- **L'équilibrage.** Aucune valeur de `src/sim/data/` ne bouge ; rien ici n'entre dans la
  simulation.
- **Les autres pistes de juice** évoquées puis écartées : chiffres de score qui jaillissent,
  télégraphes d'apparition, récompense de frôlement, fanfare de début de vague.
